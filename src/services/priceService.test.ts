import { describe, expect, it, vi } from 'vitest';
import { appError } from '@/domain/errors';
import { err, ok } from '@/domain/result';
import type { CoinGeckoClient } from '@/infrastructure/coinGeckoClient';
import type { ExchangeRateClient } from '@/infrastructure/exchangeRateClient';
import type { MarketClient } from '@/infrastructure/marketClient';
import type { MarketAllocation, MarketQuote } from '@/schemas/api/market.schema';
import { createPriceService, type PriceServiceDeps } from './priceService';

/**
 * These fakes stand in for the infrastructure clients, so the subject here is
 * purely the DTO → domain mapping. The clients themselves (HTTP, status codes,
 * Zod parsing) are covered against msw in `src/infrastructure/*.test.ts`.
 */
const quote = (symbol: string, price: number): MarketQuote => ({
  symbol,
  price,
  currency: 'USD',
  exchange: 'NYQ',
  asOf: 1_700_000_000_000,
});

const allocation: MarketAllocation = {
  stockPct: 99.4,
  bondPct: 0.1,
  cashPct: 0.5,
  otherPct: 0,
  preferredPct: 0,
  convertiblePct: 0,
  categoryName: 'Large Blend',
  fundFamily: 'Vanguard',
  sectorWeightings: [{ sector: 'technology', weightPct: 31.2 }],
};

const deps = (overrides: Partial<PriceServiceDeps> = {}): PriceServiceDeps => ({
  coinGecko: { search: vi.fn(), price: vi.fn() } as unknown as CoinGeckoClient,
  market: {
    search: vi.fn(),
    quote: vi.fn(),
    quotes: vi.fn(),
    getAllocation: vi.fn(),
  } as unknown as MarketClient,
  exchangeRate: { latest: vi.fn() } as unknown as ExchangeRateClient,
  ...overrides,
});

describe('priceService.cryptoPrice', () => {
  it('picks the requested currency out of the coin map', async () => {
    const price = vi.fn().mockResolvedValue(ok({ bitcoin: { usd: 64_000, eur: 59_000 } }));
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    const res = await svc.cryptoPrice('bitcoin', 'EUR');

    expect(res).toEqual(ok(59_000));
  });

  it('lower-cases the currency before the lookup', async () => {
    // CoinGecko keys its response by lower-case currency; the domain uses
    // upper-case CurrencyCode. Skipping the fold silently yields "not found".
    const price = vi.fn().mockResolvedValue(ok({ solana: { cad: 210 } }));
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    expect(await svc.cryptoPrice('solana', 'CAD')).toEqual(ok(210));
  });

  it('requests only the asked-for coin, and forwards the abort signal', async () => {
    const price = vi.fn().mockResolvedValue(ok({ bitcoin: { usd: 1 } }));
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));
    const signal = new AbortController().signal;

    await svc.cryptoPrice('bitcoin', 'USD', signal);

    expect(price).toHaveBeenCalledWith(['bitcoin'], 'USD', signal);
  });

  it('reports not_found when the coin is absent from the response', async () => {
    const price = vi.fn().mockResolvedValue(ok({ ethereum: { usd: 3_000 } }));
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    const res = await svc.cryptoPrice('dogecoin', 'USD');

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('not_found');
    expect(res.error.message).toContain('dogecoin');
  });

  it('reports not_found when the coin exists but not in that currency', async () => {
    const price = vi.fn().mockResolvedValue(ok({ bitcoin: { usd: 64_000 } }));
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    const res = await svc.cryptoPrice('bitcoin', 'CHF');

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('not_found');
    expect(res.error.message).toContain('CHF');
  });

  it('passes a client failure through unchanged', async () => {
    const failure = err(appError('rate_limit', 'slow down'));
    const price = vi.fn().mockResolvedValue(failure);
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    expect(await svc.cryptoPrice('bitcoin', 'USD')).toEqual(failure);
  });
});

describe('priceService.cryptoPrices', () => {
  it('maps every coin that carries the requested currency', async () => {
    const price = vi
      .fn()
      .mockResolvedValue(ok({ bitcoin: { eur: 59_000 }, ethereum: { eur: 2_800 } }));
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    const res = await svc.cryptoPrices(['bitcoin', 'ethereum'], 'EUR');

    expect(res).toEqual(ok({ bitcoin: 59_000, ethereum: 2_800 }));
  });

  it('keeps the coins it can price and drops the ones it cannot', async () => {
    // A partial provider answer must not fail the whole batch: the caller
    // renders what resolved and marks the rest unavailable.
    const price = vi.fn().mockResolvedValue(ok({ bitcoin: { usd: 64_000 }, obscure: { eur: 1 } }));
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    expect(await svc.cryptoPrices(['bitcoin', 'obscure'], 'USD')).toEqual(ok({ bitcoin: 64_000 }));
  });

  it('short-circuits an empty request without calling the client', async () => {
    const price = vi.fn();
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    expect(await svc.cryptoPrices([], 'USD')).toEqual(ok({}));
    expect(price).not.toHaveBeenCalled();
  });

  it('passes a client failure through unchanged', async () => {
    const failure = err(appError('network', 'offline'));
    const price = vi.fn().mockResolvedValue(failure);
    const svc = createPriceService(deps({ coinGecko: { price } as unknown as CoinGeckoClient }));

    expect(await svc.cryptoPrices(['bitcoin'], 'USD')).toEqual(failure);
  });
});

describe('priceService.stockPrice', () => {
  it('unwraps the quote to a bare price', async () => {
    const quoteFn = vi.fn().mockResolvedValue(ok(quote('VOO', 512.34)));
    const svc = createPriceService(deps({ market: { quote: quoteFn } as unknown as MarketClient }));

    expect(await svc.stockPrice('VOO')).toEqual(ok(512.34));
    expect(quoteFn).toHaveBeenCalledWith('VOO', undefined);
  });

  it('reports not_found for a non-finite price', async () => {
    // `marketQuoteSchema` rejects NaN/Infinity today, so this guard is
    // unreachable through the real client. Kept as a contract test: it fires
    // the moment the schema is loosened to a passthrough or a coerced number.
    const quoteFn = vi.fn().mockResolvedValue(ok({ ...quote('VOO', 0), price: Number.NaN }));
    const svc = createPriceService(deps({ market: { quote: quoteFn } as unknown as MarketClient }));

    const res = await svc.stockPrice('VOO');

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('not_found');
    expect(res.error.message).toContain('VOO');
  });

  it('keeps a zero price rather than treating it as missing', async () => {
    const quoteFn = vi.fn().mockResolvedValue(ok(quote('DEAD', 0)));
    const svc = createPriceService(deps({ market: { quote: quoteFn } as unknown as MarketClient }));

    expect(await svc.stockPrice('DEAD')).toEqual(ok(0));
  });

  it('passes a client failure through unchanged', async () => {
    const failure = err(appError('http', 'upstream 503'));
    const quoteFn = vi.fn().mockResolvedValue(failure);
    const svc = createPriceService(deps({ market: { quote: quoteFn } as unknown as MarketClient }));

    expect(await svc.stockPrice('VOO')).toEqual(failure);
  });
});

describe('priceService.stockPrices', () => {
  it('keys the batch by upper-cased symbol', async () => {
    // Providers echo back whatever case was asked for; holdings are keyed
    // upper-case, so a lower-case key would silently never match.
    const quotes = vi.fn().mockResolvedValue(ok({ quotes: [quote('voo', 512), quote('VT', 118)] }));
    const svc = createPriceService(deps({ market: { quotes } as unknown as MarketClient }));

    expect(await svc.stockPrices(['voo', 'VT'])).toEqual(ok({ VOO: 512, VT: 118 }));
  });

  it('drops symbols with a non-finite price and keeps the rest', async () => {
    const quotes = vi
      .fn()
      .mockResolvedValue(
        ok({ quotes: [quote('VOO', 512), { ...quote('BAD', 0), price: Infinity }] }),
      );
    const svc = createPriceService(deps({ market: { quotes } as unknown as MarketClient }));

    expect(await svc.stockPrices(['VOO', 'BAD'])).toEqual(ok({ VOO: 512 }));
  });

  it('returns an empty map when the provider knows none of the symbols', async () => {
    const quotes = vi.fn().mockResolvedValue(ok({ quotes: [] }));
    const svc = createPriceService(deps({ market: { quotes } as unknown as MarketClient }));

    expect(await svc.stockPrices(['NOPE'])).toEqual(ok({}));
  });

  it('short-circuits an empty request without calling the client', async () => {
    const quotes = vi.fn();
    const svc = createPriceService(deps({ market: { quotes } as unknown as MarketClient }));

    expect(await svc.stockPrices([])).toEqual(ok({}));
    expect(quotes).not.toHaveBeenCalled();
  });

  it('passes a client failure through unchanged', async () => {
    const failure = err(appError('parse', 'bad shape'));
    const quotes = vi.fn().mockResolvedValue(failure);
    const svc = createPriceService(deps({ market: { quotes } as unknown as MarketClient }));

    expect(await svc.stockPrices(['VOO'])).toEqual(failure);
  });
});

describe('priceService.rates', () => {
  const latestDto = {
    result: 'success',
    base_code: 'EUR',
    conversion_rates: { EUR: 1, USD: 1.08, CAD: 1.47 },
  };

  it('maps the provider payload into a RatesTable stamped with now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T10:00:00Z'));
    const latest = vi.fn().mockResolvedValue(ok(latestDto));
    const svc = createPriceService(
      deps({ exchangeRate: { latest } as unknown as ExchangeRateClient }),
    );

    const res = await svc.rates('EUR');

    expect(res).toEqual(
      ok({
        base: 'EUR',
        rates: { EUR: 1, USD: 1.08, CAD: 1.47 },
        asOf: Date.parse('2026-03-04T10:00:00Z'),
      }),
    );
    vi.useRealTimers();
  });

  it('trusts the provider base over the requested one', async () => {
    // The provider may answer on a different base than asked (plan or alias
    // fallback). Conversion is base-relative, so the table must carry the base
    // the rates actually belong to.
    const latest = vi.fn().mockResolvedValue(ok({ ...latestDto, base_code: 'USD' }));
    const svc = createPriceService(
      deps({ exchangeRate: { latest } as unknown as ExchangeRateClient }),
    );

    const res = await svc.rates('EUR');

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.base).toBe('USD');
  });

  it('turns a provider-level error result into an http AppError', async () => {
    const latest = vi
      .fn()
      .mockResolvedValue(ok({ ...latestDto, result: 'error', 'error-type': 'invalid-key' }));
    const svc = createPriceService(
      deps({ exchangeRate: { latest } as unknown as ExchangeRateClient }),
    );

    const res = await svc.rates('EUR');

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('http');
    expect(res.error.message).toContain('invalid-key');
  });

  it('says unknown when the error result carries no error-type', async () => {
    const latest = vi.fn().mockResolvedValue(ok({ ...latestDto, result: 'error' }));
    const svc = createPriceService(
      deps({ exchangeRate: { latest } as unknown as ExchangeRateClient }),
    );

    const res = await svc.rates('EUR');

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('unknown');
  });

  it('passes a client failure through unchanged', async () => {
    const failure = err(appError('not_configured', 'no API key'));
    const latest = vi.fn().mockResolvedValue(failure);
    const svc = createPriceService(
      deps({ exchangeRate: { latest } as unknown as ExchangeRateClient }),
    );

    expect(await svc.rates('EUR')).toEqual(failure);
  });
});

describe('priceService.allocation', () => {
  it('delegates to the market client, signal included', async () => {
    const getAllocation = vi.fn().mockResolvedValue(ok(allocation));
    const svc = createPriceService(deps({ market: { getAllocation } as unknown as MarketClient }));
    const signal = new AbortController().signal;

    expect(await svc.allocation('VOO', signal)).toEqual(ok(allocation));
    expect(getAllocation).toHaveBeenCalledWith('VOO', signal);
  });

  it('passes a client failure through unchanged', async () => {
    const failure = err(appError('not_found', 'no allocation for AAPL'));
    const getAllocation = vi.fn().mockResolvedValue(failure);
    const svc = createPriceService(deps({ market: { getAllocation } as unknown as MarketClient }));

    expect(await svc.allocation('AAPL')).toEqual(failure);
  });
});
