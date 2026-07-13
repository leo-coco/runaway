import { exchangeRateLatestSchema } from '@/schemas/api/exchangeRate.schema';
import type { AppError } from '@/domain/errors';
import type { Result } from '@/domain/result';
import { getJson } from './httpClient';

export type ExchangeRateLatestDto = ReturnType<typeof exchangeRateLatestSchema.parse>;

/** Raw ExchangeRate-API access for live FX rates. */
export interface ExchangeRateClient {
  latest(base: string, signal?: AbortSignal): Promise<Result<ExchangeRateLatestDto, AppError>>;
}

// Same-origin proxy (server holds the API key). See server/routes/market.ts.
export const createExchangeRateClient = (): ExchangeRateClient => ({
  latest: (base, signal) =>
    getJson(`/api/market/fx/latest/${encodeURIComponent(base)}`, exchangeRateLatestSchema, {
      signal,
    }),
});
