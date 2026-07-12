import type { AppError } from '@/domain/errors';
import { ok, type Result } from '@/domain/result';
import type { Instrument } from '@/domain/asset';
import type { AssetClass } from '@/domain/assetClass';
import { isSupportedCurrency, type CurrencyCode } from '@/domain/money';
import type { CoinGeckoClient } from '@/infrastructure/coinGeckoClient';
import type { AlphaVantageClient } from '@/infrastructure/alphaVantageClient';

/** Unified instrument search across crypto (CoinGecko) and equities (Alpha Vantage). */
export interface SearchService {
  search(query: string, signal?: AbortSignal): Promise<Result<readonly Instrument[], AppError>>;
}

export interface SearchServiceDeps {
  readonly coinGecko: CoinGeckoClient;
  readonly alphaVantage: AlphaVantageClient;
}

const toCurrency = (raw: string): CurrencyCode =>
  isSupportedCurrency(raw.toUpperCase()) ? (raw.toUpperCase() as CurrencyCode) : 'USD';

const EU_REGION_KEYWORDS = [
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

const classifyEquity = (region: string): { assetClass: AssetClass; exchange: string } => {
  const r = region.toLowerCase();
  if (r.includes('canada') || r.includes('toronto')) {
    return { assetClass: 'ca_equity', exchange: 'TSX' };
  }
  if (r.includes('united states') || r.includes('usa')) {
    return { assetClass: 'us_equity', exchange: 'NYSE/NASDAQ' };
  }
  if (EU_REGION_KEYWORDS.some((k) => r.includes(k))) {
    return { assetClass: 'eu_equity', exchange: region || 'Europe' };
  }
  return { assetClass: 'other', exchange: region || 'Other' };
};

export const createSearchService = (deps: SearchServiceDeps): SearchService => ({
  search: async (query, signal) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return ok([]);

    const [crypto, equities] = await Promise.all([
      deps.coinGecko.search(trimmed, signal),
      deps.alphaVantage.search(trimmed, signal),
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

    if (equities.ok && equities.value.bestMatches) {
      for (const m of equities.value.bestMatches.slice(0, 8)) {
        const { assetClass, exchange } = classifyEquity(m['4. region']);
        results.push({
          id: `alphavantage:${m['1. symbol']}`,
          symbol: m['1. symbol'],
          name: m['2. name'],
          assetClass,
          exchange,
          nativeCurrency: toCurrency(m['8. currency']),
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
