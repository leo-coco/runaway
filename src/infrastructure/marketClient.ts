import {
  MAX_EQUITY_BATCH_SYMBOLS,
  marketAllocationSchema,
  marketQuoteSchema,
  marketQuotesSchema,
  marketSearchSchema,
  type MarketAllocation,
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
  /** Fund/ETF composition (stock/bond/cash split); null-ish fields for plain equities. */
  getAllocation(symbol: string, signal?: AbortSignal): Promise<Result<MarketAllocation, AppError>>;
}

// Same-origin proxy (server owns the upstream vendor). See server/routes/market.ts.
const BASE = '/api/market/equities';

export const createMarketClient = (): MarketClient => ({
  search: (query, signal) =>
    getJson(`${BASE}/search?keywords=${encodeURIComponent(query)}`, marketSearchSchema, { signal }),
  quote: (symbol, signal) =>
    getJson(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}`, marketQuoteSchema, { signal }),
  getAllocation: (symbol, signal) =>
    getJson(`${BASE}/allocation?symbol=${encodeURIComponent(symbol)}`, marketAllocationSchema, {
      signal,
    }),
  quotes: async (symbols, signal) => {
    const quotes: MarketQuote[] = [];
    for (let offset = 0; offset < symbols.length; offset += MAX_EQUITY_BATCH_SYMBOLS) {
      const batch = symbols.slice(offset, offset + MAX_EQUITY_BATCH_SYMBOLS);
      const result = await getJson(
        `${BASE}/quotes?symbols=${encodeURIComponent(batch.join(','))}`,
        marketQuotesSchema,
        { signal },
      );
      if (!result.ok) return result;
      quotes.push(...result.value.quotes);
    }
    return { ok: true, value: { quotes } };
  },
});
