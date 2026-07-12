import { exchangeRateLatestSchema } from '@/schemas/api/exchangeRate.schema';
import type { AppError } from '@/domain/errors';
import type { Result } from '@/domain/result';
import { getJson } from './httpClient';

export type ExchangeRateLatestDto = ReturnType<typeof exchangeRateLatestSchema.parse>;

/** Raw ExchangeRate-API access for live FX rates. */
export interface ExchangeRateClient {
  latest(base: string, signal?: AbortSignal): Promise<Result<ExchangeRateLatestDto, AppError>>;
}

export const createExchangeRateClient = (apiKey: string): ExchangeRateClient => ({
  latest: (base, signal) =>
    getJson(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${encodeURIComponent(base)}`,
      exchangeRateLatestSchema,
      { signal },
    ),
});
