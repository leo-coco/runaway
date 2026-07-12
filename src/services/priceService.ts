import { appError, type AppError } from '@/domain/errors';
import { err, ok, type Result } from '@/domain/result';
import type { CurrencyCode } from '@/domain/money';
import type { CoinGeckoClient } from '@/infrastructure/coinGeckoClient';
import type { AlphaVantageClient } from '@/infrastructure/alphaVantageClient';
import type { ExchangeRateClient } from '@/infrastructure/exchangeRateClient';
import type { RatesTable } from './currencyService';

/**
 * Price/quote/FX access mapped from raw API DTOs into domain numbers.
 * No raw API response leaves this layer.
 */
export interface PriceService {
  cryptoPrice(
    coinId: string,
    vsCurrency: CurrencyCode,
    signal?: AbortSignal,
  ): Promise<Result<number, AppError>>;
  /** Batch crypto prices for several coin ids in one request. */
  cryptoPrices(
    coinIds: readonly string[],
    vsCurrency: CurrencyCode,
    signal?: AbortSignal,
  ): Promise<Result<Record<string, number>, AppError>>;
  stockPrice(symbol: string, signal?: AbortSignal): Promise<Result<number, AppError>>;
  rates(base: CurrencyCode, signal?: AbortSignal): Promise<Result<RatesTable, AppError>>;
}

export interface PriceServiceDeps {
  readonly coinGecko: CoinGeckoClient;
  readonly alphaVantage: AlphaVantageClient;
  readonly exchangeRate: ExchangeRateClient;
}

const isThrottled = (note?: string, info?: string): boolean => Boolean(note ?? info);

export const createPriceService = (deps: PriceServiceDeps): PriceService => ({
  cryptoPrice: async (coinId, vsCurrency, signal) => {
    const res = await deps.coinGecko.price([coinId], vsCurrency, signal);
    if (!res.ok) return res;
    const entry = res.value[coinId];
    const price = entry?.[vsCurrency.toLowerCase()];
    if (price === undefined) {
      return err(appError('not_found', `No ${vsCurrency} price found for "${coinId}".`));
    }
    return ok(price);
  },

  cryptoPrices: async (coinIds, vsCurrency, signal) => {
    if (coinIds.length === 0) return ok({});
    const res = await deps.coinGecko.price(coinIds, vsCurrency, signal);
    if (!res.ok) return res;
    const vs = vsCurrency.toLowerCase();
    const out: Record<string, number> = {};
    for (const [coinId, byCurrency] of Object.entries(res.value)) {
      const price = byCurrency[vs];
      if (price !== undefined) out[coinId] = price;
    }
    return ok(out);
  },

  stockPrice: async (symbol, signal) => {
    const res = await deps.alphaVantage.quote(symbol, signal);
    if (!res.ok) return res;
    if (isThrottled(res.value.Note, res.value.Information)) {
      return err(
        appError('rate_limit', 'Alpha Vantage is throttling requests (free tier). Try again soon.'),
      );
    }
    const raw = res.value['Global Quote']?.['05. price'];
    const price = raw === undefined ? Number.NaN : Number.parseFloat(raw);
    if (!Number.isFinite(price)) {
      return err(appError('not_found', `No quote found for "${symbol}".`));
    }
    return ok(price);
  },

  rates: async (base, signal) => {
    const res = await deps.exchangeRate.latest(base, signal);
    if (!res.ok) return res;
    if (res.value.result !== 'success') {
      return err(
        appError('http', `Exchange rate provider error: ${res.value['error-type'] ?? 'unknown'}.`),
      );
    }
    const table: RatesTable = {
      base: res.value.base_code,
      rates: res.value.conversion_rates,
      asOf: Date.now(),
    };
    return ok(table);
  },
});
