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

const BASE = 'https://www.alphavantage.co/query';

export const createAlphaVantageClient = (apiKey: string): AlphaVantageClient => ({
  search: (query, signal) =>
    getJson(
      `${BASE}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${apiKey}`,
      alphaVantageSearchSchema,
      { signal },
    ),
  quote: (symbol, signal) =>
    getJson(
      `${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
      alphaVantageQuoteSchema,
      { signal },
    ),
});
