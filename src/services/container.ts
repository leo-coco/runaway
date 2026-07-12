import type { AppEnv } from '@/config/env';
import { createCoinGeckoClient } from '@/infrastructure/coinGeckoClient';
import { createAlphaVantageClient } from '@/infrastructure/alphaVantageClient';
import { createExchangeRateClient } from '@/infrastructure/exchangeRateClient';
import { createPriceService, type PriceService } from './priceService';
import { createSearchService, type SearchService } from './searchService';

/** The set of services injected into React via context (dependency injection). */
export interface Services {
  readonly price: PriceService;
  readonly search: SearchService;
}

/** Compose infrastructure clients and services from validated env. */
export const createServices = (env: AppEnv): Services => {
  const coinGecko = createCoinGeckoClient(env.coinGeckoBaseUrl);
  const alphaVantage = createAlphaVantageClient(env.alphaVantageApiKey);
  const exchangeRate = createExchangeRateClient(env.exchangeRateApiKey);

  return {
    price: createPriceService({ coinGecko, alphaVantage, exchangeRate }),
    search: createSearchService({ coinGecko, alphaVantage }),
  };
};
