import {
  alphaVantageQuoteSchema,
  alphaVantageSearchSchema,
} from '@/schemas/api/alphaVantage.schema';
import type { AppError } from '@/domain/errors';
import type { Result } from '@/domain/result';
import { getJson } from './httpClient';

export type AlphaVantageSearchDto = ReturnType<typeof alphaVantageSearchSchema.parse>;
export type AlphaVantageQuoteDto = ReturnType<typeof alphaVantageQuoteSchema.parse>;

/**
 * Equities/ETFs (US + Canadian listings) via our cached server proxy
 * (/api/market/quote, /api/market/search). No provider key on the client.
 */
export interface AlphaVantageClient {
  search(query: string, signal?: AbortSignal): Promise<Result<AlphaVantageSearchDto, AppError>>;
  quote(symbol: string, signal?: AbortSignal): Promise<Result<AlphaVantageQuoteDto, AppError>>;
}

export const createAlphaVantageClient = (): AlphaVantageClient => ({
  search: (query, signal) =>
    getJson(`/api/market/search?q=${encodeURIComponent(query)}`, alphaVantageSearchSchema, {
      signal,
    }),
  quote: (symbol, signal) =>
    getJson(`/api/market/quote/${encodeURIComponent(symbol)}`, alphaVantageQuoteSchema, { signal }),
});
