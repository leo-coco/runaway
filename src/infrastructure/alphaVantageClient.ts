import {
  alphaVantageQuoteSchema,
  alphaVantageSearchSchema,
} from '@/schemas/api/alphaVantage.schema';
import type { AppError } from '@/domain/errors';
import type { Result } from '@/domain/result';
import { getJson } from './httpClient';

export type AlphaVantageSearchDto = ReturnType<typeof alphaVantageSearchSchema.parse>;
export type AlphaVantageQuoteDto = ReturnType<typeof alphaVantageQuoteSchema.parse>;

/** Raw Alpha Vantage access for equities/ETFs (US + Canadian listings). */
export interface AlphaVantageClient {
  search(query: string, signal?: AbortSignal): Promise<Result<AlphaVantageSearchDto, AppError>>;
  quote(symbol: string, signal?: AbortSignal): Promise<Result<AlphaVantageQuoteDto, AppError>>;
}

// Same-origin proxy (server holds the API key). See server/routes/market.ts.
const BASE = '/api/market/equities';

export const createAlphaVantageClient = (): AlphaVantageClient => ({
  search: (query, signal) =>
    getJson(`${BASE}/search?keywords=${encodeURIComponent(query)}`, alphaVantageSearchSchema, {
      signal,
    }),
  quote: (symbol, signal) =>
    getJson(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}`, alphaVantageQuoteSchema, {
      signal,
    }),
});
