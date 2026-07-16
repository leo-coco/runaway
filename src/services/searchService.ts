import type { AppError } from '@/domain/errors';
import { ok, type Result } from '@/domain/result';
import type { Instrument } from '@/domain/asset';
import type { AssetClass } from '@/domain/assetClass';
import { isSupportedCurrency, type CurrencyCode } from '@/domain/money';
import type { CoinGeckoClient } from '@/infrastructure/coinGeckoClient';
import type { MarketClient } from '@/infrastructure/marketClient';

/** Unified instrument search across crypto (CoinGecko) and equities (market proxy). */
export interface SearchService {
  search(query: string, signal?: AbortSignal): Promise<Result<readonly Instrument[], AppError>>;
}

export interface SearchServiceDeps {
  readonly coinGecko: CoinGeckoClient;
  readonly market: MarketClient;
}

/**
 * Null when the app cannot represent the currency, which drops the instrument
 * from the results. Defaulting to USD instead would label, say, a Taipei-listed
 * TWD fund as dollars and quietly corrupt every total it lands in.
 */
const toCurrency = (raw: string): CurrencyCode | null => {
  const code = raw.toUpperCase();
  return isSupportedCurrency(code) ? code : null;
};

/**
 * Matched against venue names as the provider displays them ("NYSEArca",
 * "NasdaqGS", "Toronto", "Paris") — the closest thing to a region it returns.
 * Note it never spells out "United States", so country names alone would leave
 * every US listing unclassified.
 */
const EU_EXCHANGE_KEYWORDS = [
  'united kingdom',
  'london',
  'germany',
  'frankfurt',
  'xetra',
  'france',
  'paris',
  'amsterdam',
  'netherlands',
  'brussels',
  'belgium',
  'milan',
  'italy',
  'madrid',
  'spain',
  'lisbon',
  'portugal',
  'switzerland',
  'swiss',
  'euronext',
  'stockholm',
  'sweden',
  'helsinki',
  'finland',
  'oslo',
  'norway',
  'copenhagen',
  'denmark',
  'vienna',
  'austria',
  'ireland',
  'dublin',
  'europe',
];

const CA_EXCHANGE_KEYWORDS = ['toronto', 'canada', 'tsx', 'neo', 'vancouver', 'cse'];
const US_EXCHANGE_KEYWORDS = [
  'nyse',
  'nasdaq',
  'arca',
  'bats',
  'amex',
  'united states',
  'usa',
  'otc',
];

/** Currency is the fallback signal when the venue name is an opaque code (e.g. "DXE"). */
const CURRENCY_CLASS: Partial<Record<CurrencyCode, AssetClass>> = {
  CAD: 'ca_equity',
  USD: 'us_equity',
  EUR: 'eu_equity',
  GBP: 'eu_equity',
  CHF: 'eu_equity',
};

const classifyEquity = (
  exchange: string,
  currency: CurrencyCode,
): { assetClass: AssetClass; exchange: string } => {
  const e = exchange.toLowerCase();
  const label = exchange || 'Other';
  if (CA_EXCHANGE_KEYWORDS.some((k) => e.includes(k))) {
    return { assetClass: 'ca_equity', exchange: label };
  }
  if (US_EXCHANGE_KEYWORDS.some((k) => e.includes(k))) {
    return { assetClass: 'us_equity', exchange: label };
  }
  if (EU_EXCHANGE_KEYWORDS.some((k) => e.includes(k))) {
    return { assetClass: 'eu_equity', exchange: label };
  }
  return { assetClass: CURRENCY_CLASS[currency] ?? 'other', exchange: label };
};

export const createSearchService = (deps: SearchServiceDeps): SearchService => ({
  search: async (query, signal) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return ok([]);

    const [crypto, equities] = await Promise.all([
      deps.coinGecko.search(trimmed, signal),
      deps.market.search(trimmed, signal),
    ]);

    const results: Instrument[] = [];

    if (crypto.ok) {
      for (const c of crypto.value.coins.slice(0, 8)) {
        results.push({
          id: `coingecko:${c.id}`,
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          assetClass: 'crypto',
          exchange: 'Crypto',
          nativeCurrency: 'USD',
        });
      }
    }

    if (equities.ok) {
      for (const m of equities.value.results.slice(0, 8)) {
        const nativeCurrency = toCurrency(m.currency);
        if (!nativeCurrency) continue;
        const { assetClass, exchange } = classifyEquity(m.exchange, nativeCurrency);
        results.push({
          // New equity ids use the `equity:` namespace. Legacy `alphavantage:`
          // ids in older saved plans still resolve; see instrumentRef.ts.
          id: `equity:${m.symbol}`,
          symbol: m.symbol,
          name: m.name,
          assetClass,
          exchange,
          nativeCurrency,
        });
      }
    }

    // If both providers failed, surface the first error so the UI can act on it.
    if (results.length === 0 && !crypto.ok && !equities.ok) {
      return crypto;
    }
    return ok(results);
  },
});
