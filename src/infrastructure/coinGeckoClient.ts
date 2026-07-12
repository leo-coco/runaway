import { coinGeckoPriceSchema, coinGeckoSearchSchema } from '@/schemas/api/coingecko.schema';
import type { AppError } from '@/domain/errors';
import type { Result } from '@/domain/result';
import { getJson } from './httpClient';

/** Raw CoinGecko access. Returns validated API DTOs (not yet domain entities). */
export interface CoinGeckoClient {
  search(query: string, signal?: AbortSignal): Promise<Result<CoinGeckoSearchDto, AppError>>;
  price(
    ids: readonly string[],
    vsCurrency: string,
    signal?: AbortSignal,
  ): Promise<Result<CoinGeckoPriceDto, AppError>>;
}

export type CoinGeckoSearchDto = ReturnType<typeof coinGeckoSearchSchema.parse>;
export type CoinGeckoPriceDto = ReturnType<typeof coinGeckoPriceSchema.parse>;

export const createCoinGeckoClient = (baseUrl: string): CoinGeckoClient => ({
  search: (query, signal) =>
    getJson(`${baseUrl}/search?query=${encodeURIComponent(query)}`, coinGeckoSearchSchema, {
      signal,
    }),
  price: (ids, vsCurrency, signal) =>
    getJson(
      `${baseUrl}/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=${encodeURIComponent(
        vsCurrency.toLowerCase(),
      )}`,
      coinGeckoPriceSchema,
      { signal },
    ),
});
