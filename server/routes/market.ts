import { Hono } from 'hono';
import type { z } from 'zod';
import YahooFinance from 'yahoo-finance2';
import type { SearchResult } from 'yahoo-finance2/modules/search';
import type { QuoteSummaryResult } from 'yahoo-finance2/modules/quoteSummary-iface';
import { auth } from '../auth.js';
import { serverEnv } from '../env.js';
import { getCached, type CacheStatus } from '../lib/cachedFetch.js';
import { exchangeRateLatestSchema } from '../../src/schemas/api/exchangeRate.schema.js';
import { MAX_EQUITY_BATCH_SYMBOLS } from '../../src/schemas/api/market.schema.js';
import type {
  MarketAllocation,
  MarketQuote,
  MarketSearch,
} from '../../src/schemas/api/market.schema.js';

/**
 * Market-data proxy. Keeps the ExchangeRate-API key server-side (it used to be
 * VITE_-prefixed and thus inlined into the client bundle) AND caches every
 * response in Postgres (see server/lib/cachedFetch.ts), so a given key is
 * fetched upstream at most once per TTL for the whole app.
 *
 * Equities come from Yahoo, which needs no API key but is an *unofficial*
 * endpoint with no SLA: it can change shape or block us without notice. The
 * Postgres cache is therefore load-bearing, not just an optimisation — when a
 * fetch throws, getCached replays the last known-good payload, so a Yahoo
 * incident degrades to a slightly stale price instead of an error.
 *
 * Endpoints are named by functional domain (equities, fx), not by provider, and
 * responses use provider-neutral DTOs (src/schemas/api/market.schema.ts), so the
 * upstream vendor can be swapped without changing the client contract.
 *
 * Cache keys are `equity:`/`search:`, deliberately not the `quote:`/`avsearch:`
 * used while this proxy fronted Alpha Vantage: those rows hold AV-shaped
 * payloads and outlive a deploy, so reusing the key would serve the old shape
 * to the new client until the TTL expired. Bump the prefix on any future
 * payload change too.
 *
 * TTLs, tunable:
 *  - FX rates change ~daily and are identical for all users → 24h.
 *  - Quotes are shared per ticker but move intraday → 1h.
 *  - Symbol search results are effectively static → 24h.
 */
const FX_TTL_MS = 24 * 60 * 60_000;
const QUOTE_TTL_MS = 60 * 60_000;
const SEARCH_TTL_MS = 24 * 60 * 60_000;
/** A fund's holdings mix moves on a rebalance cadence, not intraday like price. */
const ALLOCATION_TTL_MS = 30 * 24 * 60 * 60_000;

const UPSTREAM_TIMEOUT_MS = 12_000;

/** Marker thrown when the provider throttled us, mapped to HTTP 429 downstream. */
const RATE_LIMIT = 'RATE_LIMIT';

/** Marker for "the provider has no such symbol", mapped to 404 (not a 502). */
const NOT_FOUND = 'NOT_FOUND';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** Instrument kinds worth offering; excludes options, futures and money-market noise. */
const SEARCHABLE_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);

/**
 * Yahoo quotes some listings in a currency's *minor* unit — LSE mixes GBp
 * (pence) and GBP on the same exchange. Uppercasing "GBp" to "GBP" would
 * silently record a price 100x too high, so normalise to the major unit here,
 * the one place every quote passes through.
 */
const MINOR_UNITS: Record<string, { readonly code: string; readonly per: number }> = {
  GBp: { code: 'GBP', per: 100 },
  ZAc: { code: 'ZAR', per: 100 },
  ILA: { code: 'ILS', per: 100 },
};

const toMajorUnits = (price: number, currency: string): { price: number; currency: string } => {
  const minor = MINOR_UNITS[currency];
  return minor ? { price: price / minor.per, currency: minor.code } : { price, currency };
};

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

/** yahoo-finance2 sets `code` to the HTTP status on its HTTPError. */
const isYahooThrottle = (cause: unknown): boolean =>
  typeof cause === 'object' && cause !== null && (cause as { code?: number }).code === 429;

const errorStatus = (cause: unknown): 404 | 429 | 502 => {
  if ((cause instanceof Error && cause.message === RATE_LIMIT) || isYahooThrottle(cause))
    return 429;
  if (cause instanceof Error && cause.message === NOT_FOUND) return 404;
  return 502;
};

const cacheHeader = (status: CacheStatus): Record<string, string> => ({
  'x-cache': status,
  'cache-control': 'private, max-age=0, must-revalidate',
});

type YahooQuote = Awaited<ReturnType<typeof yf.quote>>;

/** Search returns Yahoo and non-Yahoo (e.g. Crunchbase) hits; only the former have a symbol. */
type YahooSearchQuote = Extract<SearchResult['quotes'][number], { isYahooFinance: true }>;

const toMarketQuote = (raw: NonNullable<YahooQuote>): MarketQuote | null => {
  if (raw.regularMarketPrice === undefined || raw.currency === undefined) return null;
  const { price, currency } = toMajorUnits(raw.regularMarketPrice, raw.currency);
  return {
    symbol: raw.symbol,
    price,
    currency,
    exchange: raw.fullExchangeName ?? '',
    asOf: raw.regularMarketTime?.getTime() ?? Date.now(),
  };
};

const toPct = (fraction: number | null | undefined): number | null =>
  typeof fraction === 'number' ? Math.round(fraction * 1000) / 10 : null;

/**
 * Individual equities carry neither module, so every field comes back null/empty
 * rather than throwing — callers don't need to special-case stocks vs funds.
 */
const toMarketAllocation = (raw: QuoteSummaryResult): MarketAllocation => {
  const holdings = raw.topHoldings;
  const profile = raw.fundProfile;
  const sectorWeightings = (holdings?.sectorWeightings ?? []).flatMap((entry) =>
    Object.entries(entry)
      .filter((pair): pair is [string, number] => typeof pair[1] === 'number' && pair[1] > 0)
      .map(([sector, weight]) => ({ sector, weightPct: Math.round(weight * 1000) / 10 })),
  );
  return {
    stockPct: toPct(holdings?.stockPosition),
    bondPct: toPct(holdings?.bondPosition),
    cashPct: toPct(holdings?.cashPosition),
    otherPct: toPct(holdings?.otherPosition),
    preferredPct: toPct(holdings?.preferredPosition),
    convertiblePct: toPct(holdings?.convertiblePosition),
    categoryName: profile?.categoryName ?? null,
    fundFamily: profile?.family ?? null,
    sectorWeightings,
  };
};

/** One upstream call for many symbols. Unknown symbols are simply absent. */
const fetchQuotes = async (symbols: readonly string[]): Promise<Map<string, MarketQuote>> => {
  const raws = await yf.quote([...symbols]);
  const out = new Map<string, MarketQuote>();
  for (const raw of raws) {
    const quote = toMarketQuote(raw);
    if (quote) out.set(quote.symbol.toUpperCase(), quote);
  }
  return out;
};

export const marketRoutes = new Hono();

// Equity data is available only to signed-in users. FX remains public because
// it is used while rendering plans and has its own daily, shared cache.
marketRoutes.use('/equities/*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

// Symbol search across equities/ETFs.
marketRoutes.get('/equities/search', async (c) => {
  const keywords = (c.req.query('keywords') ?? '').trim();
  if (keywords.length < 2) return c.json({ results: [] }, 200, cacheHeader('hit'));
  try {
    const { value, status } = await getCached<MarketSearch>(
      `search:${keywords.toLowerCase()}`,
      SEARCH_TTL_MS,
      async () => {
        const res = await yf.search(keywords, { quotesCount: 10, newsCount: 0 });
        const matches = res.quotes
          .filter(
            (q): q is YahooSearchQuote =>
              q.isYahooFinance &&
              SEARCHABLE_TYPES.has(q.quoteType) &&
              // Yahoo surfaces Morningstar-id funds (e.g. "0P0001KRJP.TW") with
              // no name at all; unpickable in a list, so don't offer them.
              Boolean(q.shortname ?? q.longname),
          )
          .slice(0, 8);
        if (matches.length === 0) return { results: [] };

        // Search results carry no currency, so resolve it from the quotes —
        // one extra upstream call, and it drops symbols we cannot price anyway.
        const quotes = await fetchQuotes(matches.map((m) => m.symbol));
        const results = matches.flatMap((m) => {
          const quote = quotes.get(m.symbol.toUpperCase());
          if (!quote) return [];
          return [
            {
              symbol: m.symbol,
              name: m.shortname ?? m.longname ?? m.symbol,
              exchange: m.exchDisp ?? quote.exchange,
              currency: quote.currency,
              // Narrowed by the SEARCHABLE_TYPES filter above.
              type: m.quoteType as 'EQUITY' | 'ETF' | 'MUTUALFUND',
            },
          ];
        });
        return { results };
      },
    );
    return c.json(value, 200, cacheHeader(status));
  } catch (cause) {
    return c.json({ error: 'Search unavailable' }, errorStatus(cause));
  }
});

// Latest quote for a single equity/ETF symbol.
marketRoutes.get('/equities/quote', async (c) => {
  const symbol = (c.req.query('symbol') ?? '').trim().toUpperCase();
  if (symbol.length === 0) return c.json({ error: 'symbol is required' }, 400);
  try {
    const { value, status } = await getCached<MarketQuote>(
      `equity:${symbol}`,
      QUOTE_TTL_MS,
      async () => {
        const quote = (await fetchQuotes([symbol])).get(symbol);
        // Unknown symbols resolve to undefined rather than throwing; never cache that.
        if (!quote) throw new Error(NOT_FOUND);
        return quote;
      },
    );
    return c.json(value, 200, cacheHeader(status));
  } catch (cause) {
    return c.json({ error: 'Quote unavailable' }, errorStatus(cause));
  }
});

// Fund/ETF composition (stock/bond/cash split, sector weightings, category).
// Null-ish for individual equities, which carry neither upstream module.
marketRoutes.get('/equities/allocation', async (c) => {
  const symbol = (c.req.query('symbol') ?? '').trim().toUpperCase();
  if (symbol.length === 0) return c.json({ error: 'symbol is required' }, 400);
  try {
    const { value, status } = await getCached<MarketAllocation>(
      `allocation:${symbol}`,
      ALLOCATION_TTL_MS,
      async () => {
        const raw = await yf.quoteSummary(symbol, { modules: ['topHoldings', 'fundProfile'] });
        return toMarketAllocation(raw);
      },
    );
    return c.json(value, 200, cacheHeader(status));
  } catch (cause) {
    return c.json({ error: 'Allocation unavailable' }, errorStatus(cause));
  }
});

/**
 * Batch quotes. Cached per symbol (same `equity:<SYMBOL>` keys as the single
 * route) rather than per request, so every portfolio combination shares one
 * entry per ticker instead of minting its own.
 *
 * The upstream batch is lazy and memoised: if every symbol is a cache hit no
 * fetch happens at all, and the first miss fetches all requested symbols in a
 * single call that the other misses then reuse.
 */
marketRoutes.get('/equities/quotes', async (c) => {
  const symbols = [
    ...new Set(
      (c.req.query('symbols') ?? '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0),
    ),
  ];
  if (symbols.length === 0) return c.json({ quotes: [] }, 200, cacheHeader('hit'));
  if (symbols.length > MAX_EQUITY_BATCH_SYMBOLS) {
    return c.json(
      {
        error: `A maximum of ${MAX_EQUITY_BATCH_SYMBOLS} unique symbols is allowed`,
      },
      400,
    );
  }

  let batch: Promise<Map<string, MarketQuote>> | null = null;
  const loadBatch = () => (batch ??= fetchQuotes(symbols));

  const settled = await Promise.allSettled(
    symbols.map((symbol) =>
      getCached<MarketQuote>(`equity:${symbol}`, QUOTE_TTL_MS, async () => {
        const quote = (await loadBatch()).get(symbol);
        if (!quote) throw new Error(NOT_FOUND);
        return quote;
      }),
    ),
  );

  const quotes = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value.value] : []));
  // A symbol that is unknown or wholly uncached shouldn't fail the batch; the
  // client reports "no price" per holding. Only a total wipeout is an error.
  if (quotes.length === 0) {
    const first = settled.find((r) => r.status === 'rejected');
    return c.json(
      { error: 'Quotes unavailable' },
      errorStatus(first?.status === 'rejected' ? first.reason : undefined),
    );
  }
  const worst: CacheStatus = settled.some(
    (r) => r.status === 'fulfilled' && r.value.status === 'stale',
  )
    ? 'stale'
    : settled.some((r) => r.status === 'fulfilled' && r.value.status === 'miss')
      ? 'miss'
      : 'hit';
  return c.json({ quotes }, 200, cacheHeader(worst));
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
