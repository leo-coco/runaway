import { exchangeRateLatestSchema } from '@/schemas/api/exchangeRate.schema';
import type { AppError } from '@/domain/errors';
import type { Result } from '@/domain/result';
import { getJson } from './httpClient';

export type ExchangeRateLatestDto = ReturnType<typeof exchangeRateLatestSchema.parse>;

/** FX rates via our cached server proxy (/api/market/fx). No provider key on the client. */
export interface ExchangeRateClient {
  latest(base: string, signal?: AbortSignal): Promise<Result<ExchangeRateLatestDto, AppError>>;
}

export const createExchangeRateClient = (): ExchangeRateClient => ({
  latest: (base, signal) =>
    getJson(`/api/market/fx/${encodeURIComponent(base)}`, exchangeRateLatestSchema, { signal }),
});
