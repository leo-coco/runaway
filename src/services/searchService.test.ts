import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/domain/result';
import type { MarketClient } from '@/infrastructure/marketClient';
import type { CoinGeckoClient } from '@/infrastructure/coinGeckoClient';
import { createSearchService } from './searchService';

const coinGecko = {
  search: vi.fn(async () => ok({ coins: [] })),
  price: vi.fn(),
} as unknown as CoinGeckoClient;

const marketWith = (results: unknown[]): MarketClient =>
  ({
    search: vi.fn(async () => ok({ results })),
    quote: vi.fn(),
    quotes: vi.fn(),
  }) as unknown as MarketClient;

const result = (symbol: string, exchange: string, currency: string) => ({
  symbol,
  name: symbol,
  exchange,
  currency,
});

describe('createSearchService', () => {
  it.each([
    // The provider names a venue ("NYSEArca"), never a country, so classifying
    // on exchange text has to cope with US venues that never say "United States".
    ['VOO', 'NYSEArca', 'USD', 'us_equity'],
    ['AAPL', 'NasdaqGS', 'USD', 'us_equity'],
    ['ESE', 'NYSE', 'USD', 'us_equity'],
    ['VFV.TO', 'Toronto', 'CAD', 'ca_equity'],
    ['VFV.NE', 'NEO', 'CAD', 'ca_equity'],
    ['CW8.PA', 'Paris', 'EUR', 'eu_equity'],
    ['IWDA.AS', 'Amsterdam', 'EUR', 'eu_equity'],
    // An opaque venue code falls back to the currency.
    ['CW8P.XD', 'DXE', 'EUR', 'eu_equity'],
  ])('classifies %s on %s as %s', async (symbol, exchange, currency, expected) => {
    const service = createSearchService({
      coinGecko,
      market: marketWith([result(symbol, exchange, currency)]),
    });

    const res = await service.search('anything');

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value[0]?.assetClass).toBe(expected);
  });

  it('namespaces new equity ids under `equity:`', async () => {
    const service = createSearchService({
      coinGecko,
      market: marketWith([result('VOO', 'NYSEArca', 'USD')]),
    });

    const res = await service.search('voo');

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value[0]?.id).toBe('equity:VOO');
  });

  it('drops instruments in unsupported currencies rather than mislabelling them USD', async () => {
    const service = createSearchService({
      coinGecko,
      market: marketWith([result('0P0001.TW', 'Taiwan', 'TWD'), result('VOO', 'NYSEArca', 'USD')]),
    });

    const res = await service.search('fund');

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((i) => i.symbol)).toEqual(['VOO']);
  });
});
