import {
  marketQuoteSchema,
  marketQuotesSchema,
  marketSearchSchema,
  type MarketQuote,
  type MarketQuotes,
  type MarketSearch,
} from '@/schemas/api/market.schema';
import type { AppError } from '@/domain/errors';
import type { Result } from '@/domain/result';
import { getJson } from './httpClient';

/** Equity/ETF market data (US, CA, EU listings) via the same-origin proxy. */
export interface MarketClient {
  search(query: string, signal?: AbortSignal): Promise<Result<MarketSearch, AppError>>;
  quote(symbol: string, signal?: AbortSignal): Promise<Result<MarketQuote, AppError>>;
  /** Batch quotes for several symbols in one request. */
  quotes(symbols: readonly string[], signal?: AbortSignal): Promise<Result<MarketQuotes, AppError>>;
}

// Same-origin proxy (server owns the upstream vendor). See server/routes/market.ts.
const BASE = '/api/market/equities';

export const createMarketClient = (): MarketClient => ({
  search: (query, signal) =>
    getJson(`${BASE}/search?keywords=${encodeURIComponent(query)}`, marketSearchSchema, { signal }),
  quote: (symbol, signal) =>
    getJson(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}`, marketQuoteSchema, { signal }),
  quotes: (symbols, signal) =>
    getJson(`${BASE}/quotes?symbols=${encodeURIComponent(symbols.join(','))}`, marketQuotesSchema, {
      signal,
    }),
});
