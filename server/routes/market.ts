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
 * Market-data proxy. Keeps the Alpha Vantage and ExchangeRate-API keys
 * server-side (they used to be VITE_-prefixed and thus inlined into the client
 * bundle) AND caches every response in Postgres (see server/lib/cachedFetch.ts),
 * so a given key is fetched upstream at most once per TTL for the whole app —
 * what keeps the fragile free tiers (esp. Alpha Vantage's ~25 req/day) viable.
 *
 * Endpoints are named by functional domain (equities, fx), not by provider, so
 * the upstream vendor can be swapped without changing the client contract.
 *
 * TTLs, tunable:
 *  - FX rates change ~daily and are identical for all users → 24h.
 *  - Quotes are shared per ticker but move intraday → 1h (freshness vs quota).
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

const errorStatus = (cause: unknown): 429 | 502 =>
  cause instanceof Error && cause.message === RATE_LIMIT ? 429 : 502;

const cacheHeader = (status: CacheStatus): Record<string, string> => ({ 'x-cache': status });

const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

export const marketRoutes = new Hono();

// Symbol search across equities/ETFs (Alpha Vantage SYMBOL_SEARCH).
marketRoutes.get('/equities/search', async (c) => {
  const keywords = (c.req.query('keywords') ?? '').trim();
  if (keywords.length < 2) return c.json({ bestMatches: [] }, 200, cacheHeader('hit'));
  const key = serverEnv().ALPHA_VANTAGE_API_KEY;
  try {
    const { value, status } = await getCached(
      `avsearch:${keywords.toLowerCase()}`,
      SEARCH_TTL_MS,
      async () => {
        const dto = await fetchJson(
          `${ALPHA_VANTAGE_BASE}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keywords)}&apikey=${key}`,
          alphaVantageSearchSchema,
        );
        // A throttled response must not poison the cache; fall back to the last good one.
        if (isThrottled(dto.Note, dto.Information)) throw new Error(RATE_LIMIT);
        return dto;
      },
    );
    return c.json(value, 200, cacheHeader(status));
  } catch (cause) {
    return c.json({ error: 'Search unavailable' }, errorStatus(cause));
  }
});

// Latest quote for an equity/ETF symbol (Alpha Vantage GLOBAL_QUOTE).
marketRoutes.get('/equities/quote', async (c) => {
  const symbol = (c.req.query('symbol') ?? '').trim().toUpperCase();
  const key = serverEnv().ALPHA_VANTAGE_API_KEY;
  try {
    const { value, status } = await getCached(`quote:${symbol}`, QUOTE_TTL_MS, async () => {
      const dto = await fetchJson(
        `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
        alphaVantageQuoteSchema,
      );
      if (isThrottled(dto.Note, dto.Information)) throw new Error(RATE_LIMIT);
      return dto;
    });
    return c.json(value, 200, cacheHeader(status));
  } catch (cause) {
    return c.json({ error: 'Quote unavailable' }, errorStatus(cause));
  }
});

// Live FX rates relative to a base currency (ExchangeRate-API).
marketRoutes.get('/fx/latest/:base', async (c) => {
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
    return c.json(value, 200, cacheHeader(status));
  } catch (cause) {
    return c.json({ error: 'FX rates unavailable' }, errorStatus(cause));
  }
});
