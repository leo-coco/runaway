import { http, HttpResponse } from 'msw';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Instrument } from '@/domain/asset';
import { COINGECKO_BASE, MARKET_BASE, renderHookWithServices } from '@/test/harness';
import { server } from '@/test/msw/server';
import { useSearchPrices } from './useSearchPrices';

const crypto = (coinId: string, symbol: string): Instrument => ({
  id: `coingecko:${coinId}`,
  symbol,
  name: symbol,
  assetClass: 'crypto',
  exchange: 'Crypto',
  nativeCurrency: 'USD',
});

const equity = (
  symbol: string,
  nativeCurrency: Instrument['nativeCurrency'] = 'USD',
): Instrument => ({
  id: `equity:${symbol}`,
  symbol,
  name: symbol,
  assetClass: 'us_equity',
  exchange: 'PCX',
  nativeCurrency,
});

const quote = (symbol: string, price: number, currency = 'USD') => ({
  symbol,
  price,
  currency,
  exchange: 'PCX',
  asOf: 1_753_042_800_000,
});

/** Records the query params each provider was called with. */
const stubPrices = (
  cryptoBody: Record<string, Record<string, number>> = {},
  quotes: ReturnType<typeof quote>[] = [],
) => {
  const seen = { cryptoIds: [] as string[], quoteSymbols: [] as string[] };
  server.use(
    http.get(`${COINGECKO_BASE}/simple/price`, ({ request }) => {
      seen.cryptoIds.push(new URL(request.url).searchParams.get('ids') ?? '');
      return HttpResponse.json(cryptoBody);
    }),
    http.get(`${MARKET_BASE}/quotes`, ({ request }) => {
      seen.quoteSymbols.push(new URL(request.url).searchParams.get('symbols') ?? '');
      return HttpResponse.json({ quotes });
    }),
  );
  return seen;
};

describe('useSearchPrices request shaping', () => {
  it('issues no request for an empty instrument list', async () => {
    const seen = stubPrices();

    const { result } = renderHookWithServices(() => useSearchPrices([]));

    await vi.waitFor(() => expect(result.current.size).toBe(0));
    expect(seen).toEqual({ cryptoIds: [], quoteSymbols: [] });
  });

  it('batches every crypto instrument into a single provider request', async () => {
    const seen = stubPrices({ bitcoin: { usd: 61234.5 }, ethereum: { usd: 2841.07 } });
    const instruments = [crypto('bitcoin', 'BTC'), crypto('ethereum', 'ETH')];

    const { result } = renderHookWithServices(() => useSearchPrices(instruments));

    await waitFor(() => expect(result.current.get('coingecko:bitcoin')?.status).toBe('success'));
    expect(seen.cryptoIds).toEqual(['bitcoin,ethereum']);
    expect(seen.quoteSymbols).toEqual([]);
  });

  it('batches every equity instrument into a single quotes request', async () => {
    const seen = stubPrices({}, [quote('VOO', 542.31), quote('AAPL', 201.5)]);
    const instruments = [equity('VOO'), equity('AAPL')];

    const { result } = renderHookWithServices(() => useSearchPrices(instruments));

    await waitFor(() => expect(result.current.get('equity:VOO')?.status).toBe('success'));
    expect(seen.quoteSymbols).toEqual(['VOO,AAPL']);
    expect(seen.cryptoIds).toEqual([]);
  });

  it('queries both providers for a mixed list', async () => {
    const seen = stubPrices({ bitcoin: { usd: 61234.5 } }, [quote('VOO', 542.31)]);
    const instruments = [crypto('bitcoin', 'BTC'), equity('VOO')];

    const { result } = renderHookWithServices(() => useSearchPrices(instruments));

    await waitFor(() => expect(result.current.get('equity:VOO')?.status).toBe('success'));
    await waitFor(() => expect(result.current.get('coingecko:bitcoin')?.status).toBe('success'));
    expect(seen.cryptoIds).toEqual(['bitcoin']);
    expect(seen.quoteSymbols).toEqual(['VOO']);
  });

  it('keys the query on the id set, not its order, so a reorder does not refetch', async () => {
    const seen = stubPrices({ bitcoin: { usd: 1 }, ethereum: { usd: 2 } });
    let instruments = [crypto('bitcoin', 'BTC'), crypto('ethereum', 'ETH')];

    const { result, rerender } = renderHookWithServices(() => useSearchPrices(instruments));
    await waitFor(() => expect(result.current.get('coingecko:bitcoin')?.status).toBe('success'));

    instruments = [crypto('ethereum', 'ETH'), crypto('bitcoin', 'BTC')];
    rerender();

    await waitFor(() => expect(result.current.get('coingecko:ethereum')?.status).toBe('success'));
    expect(seen.cryptoIds).toEqual(['bitcoin,ethereum']);
  });
});

describe('useSearchPrices per-instrument status', () => {
  it('reports loading before the response arrives', () => {
    stubPrices({ bitcoin: { usd: 61234.5 } });

    const { result } = renderHookWithServices(() => useSearchPrices([crypto('bitcoin', 'BTC')]));

    expect(result.current.get('coingecko:bitcoin')).toMatchObject({
      status: 'loading',
      currency: 'USD',
    });
  });

  it('returns the price in the instrument native currency on success', async () => {
    stubPrices({}, [quote('XEQT.TO', 33.12, 'CAD')]);

    const { result } = renderHookWithServices(() => useSearchPrices([equity('XEQT.TO', 'CAD')]));

    await waitFor(() =>
      expect(result.current.get('equity:XEQT.TO')).toEqual({
        status: 'success',
        value: 33.12,
        currency: 'CAD',
      }),
    );
  });

  it('marks an instrument the provider omitted as error, not loading', async () => {
    stubPrices({ bitcoin: { usd: 61234.5 } });
    const instruments = [crypto('bitcoin', 'BTC'), crypto('not-a-coin', 'NAC')];

    const { result } = renderHookWithServices(() => useSearchPrices(instruments));

    await waitFor(() => expect(result.current.get('coingecko:bitcoin')?.status).toBe('success'));
    expect(result.current.get('coingecko:not-a-coin')).toMatchObject({
      status: 'error',
      value: undefined,
    });
  });

  it('matches a lowercase symbol echoed by the provider against the instrument ref', async () => {
    // The provider echoes the casing it was sent, so a lowercase ref comes back
    // lowercase; the price layer is what normalises both sides to upper case.
    stubPrices({}, [quote('voo', 542.31)]);

    const { result } = renderHookWithServices(() => useSearchPrices([equity('voo')]));

    await waitFor(() => expect(result.current.get('equity:voo')?.value).toBe(542.31));
  });

  it('marks every crypto instrument as error when the provider fails', async () => {
    server.use(
      http.get(`${COINGECKO_BASE}/simple/price`, () => HttpResponse.json({}, { status: 500 })),
    );

    const { result } = renderHookWithServices(() => useSearchPrices([crypto('bitcoin', 'BTC')]));

    await waitFor(() => expect(result.current.get('coingecko:bitcoin')?.status).toBe('error'));
  });

  it('leaves equity statuses independent of a crypto provider failure', async () => {
    server.use(
      http.get(`${COINGECKO_BASE}/simple/price`, () => HttpResponse.json({}, { status: 500 })),
      http.get(`${MARKET_BASE}/quotes`, () =>
        HttpResponse.json({ quotes: [quote('VOO', 542.31)] }),
      ),
    );
    const instruments = [crypto('bitcoin', 'BTC'), equity('VOO')];

    const { result } = renderHookWithServices(() => useSearchPrices(instruments));

    await waitFor(() => expect(result.current.get('equity:VOO')?.status).toBe('success'));
    expect(result.current.get('coingecko:bitcoin')?.status).toBe('error');
  });

  it('ignores an instrument whose id carries no known provider namespace', async () => {
    const seen = stubPrices();
    const custom: Instrument = { ...equity('VOO'), id: 'custom-asset' };

    const { result } = renderHookWithServices(() => useSearchPrices([custom]));

    await vi.waitFor(() => expect(result.current.has('custom-asset')).toBe(false));
    expect(seen).toEqual({ cryptoIds: [], quoteSymbols: [] });
  });
});
