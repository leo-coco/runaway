import { appError, type AppError } from '@/domain/errors';
import { err, ok, type Result } from '@/domain/result';
import type { CurrencyCode } from '@/domain/money';
import type { CoinGeckoClient } from '@/infrastructure/coinGeckoClient';
import type { MarketClient } from '@/infrastructure/marketClient';
import type { ExchangeRateClient } from '@/infrastructure/exchangeRateClient';
import type { MarketAllocation } from '@/schemas/api/market.schema';
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
  /** Batch stock prices for several symbols in one request. */
  stockPrices(
    symbols: readonly string[],
    signal?: AbortSignal,
  ): Promise<Result<Record<string, number>, AppError>>;
  rates(base: CurrencyCode, signal?: AbortSignal): Promise<Result<RatesTable, AppError>>;
  /** Fund/ETF composition for a symbol; null-ish fields when the symbol is a plain equity. */
  allocation(symbol: string, signal?: AbortSignal): Promise<Result<MarketAllocation, AppError>>;
}

export interface PriceServiceDeps {
  readonly coinGecko: CoinGeckoClient;
  readonly market: MarketClient;
  readonly exchangeRate: ExchangeRateClient;
}

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
    const res = await deps.market.quote(symbol, signal);
    if (!res.ok) return res;
    if (!Number.isFinite(res.value.price)) {
      return err(appError('not_found', `No quote found for "${symbol}".`));
    }
    return ok(res.value.price);
  },

  stockPrices: async (symbols, signal) => {
    if (symbols.length === 0) return ok({});
    const res = await deps.market.quotes(symbols, signal);
    if (!res.ok) return res;
    const out: Record<string, number> = {};
    for (const quote of res.value.quotes) {
      if (Number.isFinite(quote.price)) out[quote.symbol.toUpperCase()] = quote.price;
    }
    return ok(out);
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

  allocation: (symbol, signal) => deps.market.getAllocation(symbol, signal),
});
