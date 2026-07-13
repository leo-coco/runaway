import { Hono } from 'hono';
import type { z } from 'zod';
import { serverEnv } from '../env.js';
import { getCached, type CacheStatus } from '../lib/cachedFetch.js';
import { exchangeRateLatestSchema } from '../../src/schemas/api/exchangeRate.schema.js';
import {
  alphaVantageQuoteSchema,
  alphaVantageSearchSchema,
} from '../../src/schemas/api/alphaVantage.schema.js';

/**
 * Server-side proxy for the two market APIs whose free tiers are most fragile.
 * Every response is cached in Postgres (see server/lib/cachedFetch.ts) so a
 * given key is fetched upstream at most once per TTL for the whole app, and the
 * provider keys stay server-side instead of being shipped in the client bundle.
 *
 * TTLs, tunable:
 *  - FX rates change ~daily and are identical for all users → 24h.
 *  - Quotes are shared per ticker but move intraday → 1h (balance freshness vs quota).
 *  - Symbol search results are effectively static → 24h.
 */
const FX_TTL_MS = 24 * 60 * 60_000;
const QUOTE_TTL_MS = 60 * 60_000;
const SEARCH_TTL_MS = 24 * 60 * 60_000;

const UPSTREAM_TIMEOUT_MS = 12_000;

/** Marker thrown when the provider throttled us, mapped to HTTP 429 downstream. */
const RATE_LIMIT = 'RATE_LIMIT';

/** Fetch JSON and validate it, throwing on any network/HTTP/schema failure. */
const fetchJson = async <T>(url: string, schema: z.ZodType<T>): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 429) throw new Error(RATE_LIMIT);
    if (!res.ok) throw new Error(`Upstream returned HTTP ${res.status}`);
    return schema.parse(await res.json());
  } finally {
    clearTimeout(timeout);
  }
};

const isThrottled = (note?: string, info?: string): boolean => Boolean(note ?? info);

export const marketRoutes = new Hono();

const setCacheHeader = (status: CacheStatus): Record<string, string> => ({
  'x-cache': status,
});

// Live FX rates relative to a base currency (ExchangeRate-API).
marketRoutes.get('/fx/:base', async (c) => {
  const base = c.req.param('base').toUpperCase();
  const key = serverEnv().EXCHANGERATE_API_KEY;
  try {
    const { value, status } = await getCached(`fx:${base}`, FX_TTL_MS, async () => {
      const dto = await fetchJson(
        `https://v6.exchangerate-api.com/v6/${key}/latest/${encodeURIComponent(base)}`,
        exchangeRateLatestSchema,
      );
      // Only a "success" table is worth caching; anything else is an error DTO.
      if (dto.result !== 'success') {
        throw new Error(`ExchangeRate provider error: ${dto['error-type'] ?? 'unknown'}`);
      }
      return dto;
    });
    return c.json(value, 200, setCacheHeader(status));
  } catch (cause) {
    return c.json(
      { error: 'FX rates unavailable' },
      cause instanceof Error && cause.message === RATE_LIMIT ? 429 : 502,
    );
  }
});

// Latest quote for an equity/ETF symbol (Alpha Vantage GLOBAL_QUOTE).
marketRoutes.get('/quote/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toUpperCase();
  const key = serverEnv().ALPHA_VANTAGE_API_KEY;
  try {
    const { value, status } = await getCached(`quote:${symbol}`, QUOTE_TTL_MS, async () => {
      const dto = await fetchJson(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
        alphaVantageQuoteSchema,
      );
      // A throttled response must not poison the cache; fall back to the last good quote.
      if (isThrottled(dto.Note, dto.Information)) throw new Error(RATE_LIMIT);
      return dto;
    });
    return c.json(value, 200, setCacheHeader(status));
  } catch (cause) {
    return c.json(
      { error: 'Quote unavailable' },
      cause instanceof Error && cause.message === RATE_LIMIT ? 429 : 502,
    );
  }
});

// Symbol search across equities/ETFs (Alpha Vantage SYMBOL_SEARCH).
marketRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ bestMatches: [] }, 200, setCacheHeader('hit'));
  const key = serverEnv().ALPHA_VANTAGE_API_KEY;
  try {
    const { value, status } = await getCached(
      `avsearch:${q.toLowerCase()}`,
      SEARCH_TTL_MS,
      async () => {
        const dto = await fetchJson(
          `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(q)}&apikey=${key}`,
          alphaVantageSearchSchema,
        );
        if (isThrottled(dto.Note, dto.Information)) throw new Error(RATE_LIMIT);
        return dto;
      },
    );
    return c.json(value, 200, setCacheHeader(status));
  } catch (cause) {
    return c.json(
      { error: 'Search unavailable' },
      cause instanceof Error && cause.message === RATE_LIMIT ? 429 : 502,
    );
  }
});
