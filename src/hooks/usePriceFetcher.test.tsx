// Must precede the `@/store` import: the persisted store needs a Storage global.
import '@/test/installLocalStorage';

import { http, HttpResponse } from 'msw';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Holding, Instrument } from '@/domain/asset';
import { useAppStore } from '@/store';
import { COINGECKO_BASE, MARKET_BASE, renderHookWithServices } from '@/test/harness';
import { server } from '@/test/msw/server';
import { usePriceFetcher } from './usePriceFetcher';

let seq = 0;
const uniqueId = () => `h-test-${(seq += 1)}`;

const instrument = (
  id: string,
  nativeCurrency: Instrument['nativeCurrency'] = 'USD',
): Instrument => ({
  id,
  symbol: id.split(':')[1] ?? id,
  name: id,
  assetClass: id.startsWith('coingecko:') ? 'crypto' : 'us_equity',
  exchange: 'PCX',
  nativeCurrency,
});

/** Adds a holding to the first plan and returns it plus that plan's id. */
const seedHolding = (
  instrumentId: string,
  nativeCurrency: Instrument['nativeCurrency'] = 'USD',
) => {
  const planId = useAppStore.getState().plans[0]!.id;
  const holding: Holding = {
    id: uniqueId(),
    instrument: instrument(instrumentId, nativeCurrency),
    quantity: 1,
    pricePerUnit: 0,
    expectedCagrPct: 5,
    monthlyContribution: 0,
    accountId: null,
  };
  act(() => useAppStore.getState().addHolding(planId, holding));
  return { planId, holding };
};

const storedPrice = (planId: string, holdingId: string) =>
  useAppStore
    .getState()
    .plans.find((p) => p.id === planId)
    ?.holdings.find((h) => h.id === holdingId)?.pricePerUnit;

const quote = (symbol: string, price: number) => ({
  symbol,
  price,
  currency: 'USD',
  exchange: 'PCX',
  asOf: 1_753_042_800_000,
});

describe('usePriceFetcher fetchPrice', () => {
  it('starts with no status for any holding', () => {
    const { planId } = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));

    expect(result.current.statuses).toEqual({});
    expect(result.current.isFetchingAll).toBe(false);
  });

  it('writes an equity price back to the store and reports success', async () => {
    server.use(http.get(`${MARKET_BASE}/quote`, () => HttpResponse.json(quote('VOO', 542.31))));
    const { planId, holding } = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchPrice(holding));

    expect(result.current.statuses[holding.id]).toEqual({ status: 'success' });
    expect(storedPrice(planId, holding.id)).toBe(542.31);
  });

  it('writes a crypto price in the holding native currency', async () => {
    server.use(
      http.get(`${COINGECKO_BASE}/simple/price`, ({ request }) => {
        const vs = new URL(request.url).searchParams.get('vs_currencies');
        return HttpResponse.json({ bitcoin: { [vs ?? 'usd']: 61234.5 } });
      }),
    );
    const { planId, holding } = seedHolding('coingecko:bitcoin', 'CAD');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchPrice(holding));

    expect(storedPrice(planId, holding.id)).toBe(61234.5);
  });

  it('refuses a holding whose instrument has no linked provider, without a request', async () => {
    let called = false;
    server.use(
      http.get(`${MARKET_BASE}/quote`, () => {
        called = true;
        return HttpResponse.json(quote('VOO', 1));
      }),
    );
    const { planId, holding } = seedHolding('custom-asset');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchPrice(holding));

    expect(result.current.statuses[holding.id]).toMatchObject({
      status: 'error',
      error: { kind: 'not_found' },
    });
    expect(called).toBe(false);
    expect(storedPrice(planId, holding.id)).toBe(0);
  });

  it('records a typed error and leaves the stored price untouched when the provider fails', async () => {
    server.use(http.get(`${MARKET_BASE}/quote`, () => HttpResponse.json({}, { status: 503 })));
    const { planId, holding } = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchPrice(holding));

    expect(result.current.statuses[holding.id]).toMatchObject({
      status: 'error',
      error: { kind: 'http' },
    });
    expect(storedPrice(planId, holding.id)).toBe(0);
  });

  it('surfaces a rate-limited provider as a rate_limit error', async () => {
    server.use(http.get(`${MARKET_BASE}/quote`, () => HttpResponse.json({}, { status: 429 })));
    const { planId, holding } = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchPrice(holding));

    expect(result.current.statuses[holding.id]).toMatchObject({
      status: 'error',
      error: { kind: 'rate_limit' },
    });
  });

  it('deduplicates repeat fetches of the same symbol through the query cache', async () => {
    let calls = 0;
    server.use(
      http.get(`${MARKET_BASE}/quote`, () => {
        calls += 1;
        return HttpResponse.json(quote('VOO', 542.31));
      }),
    );
    const { planId, holding } = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchPrice(holding));
    await act(() => result.current.fetchPrice(holding));

    expect(calls).toBe(1);
    expect(result.current.statuses[holding.id]).toEqual({ status: 'success' });
  });
});

describe('usePriceFetcher fetchAll', () => {
  it('collapses several equity holdings into one batched request', async () => {
    const symbolParams: string[] = [];
    server.use(
      http.get(`${MARKET_BASE}/quotes`, ({ request }) => {
        symbolParams.push(new URL(request.url).searchParams.get('symbols') ?? '');
        return HttpResponse.json({ quotes: [quote('VOO', 542.31), quote('AAPL', 201.5)] });
      }),
    );
    const a = seedHolding('equity:VOO');
    const b = seedHolding('equity:AAPL');

    const { result } = renderHookWithServices(() => usePriceFetcher(a.planId));
    await act(() => result.current.fetchAll([a.holding, b.holding]));

    expect(symbolParams).toEqual(['VOO,AAPL']);
    expect(storedPrice(a.planId, a.holding.id)).toBe(542.31);
    expect(storedPrice(b.planId, b.holding.id)).toBe(201.5);
  });

  it('requests a duplicated symbol only once but prices both holdings', async () => {
    let calls = 0;
    server.use(
      http.get(`${MARKET_BASE}/quotes`, ({ request }) => {
        calls += 1;
        expect(new URL(request.url).searchParams.get('symbols')).toBe('VOO');
        return HttpResponse.json({ quotes: [quote('VOO', 542.31)] });
      }),
    );
    const a = seedHolding('equity:VOO');
    const b = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(a.planId));
    await act(() => result.current.fetchAll([a.holding, b.holding]));

    expect(calls).toBe(1);
    expect(storedPrice(a.planId, a.holding.id)).toBe(542.31);
    expect(storedPrice(b.planId, b.holding.id)).toBe(542.31);
  });

  it('prices a lowercase symbol ref against the normalised batch result', async () => {
    server.use(
      // The provider echoes the casing it was sent; the price layer upper-cases
      // the keys, so the batch lookup has to normalise its side too.
      http.get(`${MARKET_BASE}/quotes`, () =>
        HttpResponse.json({ quotes: [quote('voo', 542.31)] }),
      ),
    );
    const { planId, holding } = seedHolding('equity:voo');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchAll([holding]));

    expect(result.current.statuses[holding.id]).toEqual({ status: 'success' });
    expect(storedPrice(planId, holding.id)).toBe(542.31);
  });

  it('marks only the symbols the provider omitted as not_found', async () => {
    server.use(
      http.get(`${MARKET_BASE}/quotes`, () =>
        HttpResponse.json({ quotes: [quote('VOO', 542.31)] }),
      ),
    );
    const found = seedHolding('equity:VOO');
    const missing = seedHolding('equity:NOTREAL');

    const { result } = renderHookWithServices(() => usePriceFetcher(found.planId));
    await act(() => result.current.fetchAll([found.holding, missing.holding]));

    expect(result.current.statuses[found.holding.id]).toEqual({ status: 'success' });
    expect(result.current.statuses[missing.holding.id]).toMatchObject({
      status: 'error',
      error: { kind: 'not_found' },
    });
    expect(storedPrice(missing.planId, missing.holding.id)).toBe(0);
  });

  it('fails every equity holding together when the batch request fails', async () => {
    server.use(http.get(`${MARKET_BASE}/quotes`, () => HttpResponse.json({}, { status: 502 })));
    const a = seedHolding('equity:VOO');
    const b = seedHolding('equity:AAPL');

    const { result } = renderHookWithServices(() => usePriceFetcher(a.planId));
    await act(() => result.current.fetchAll([a.holding, b.holding]));

    for (const h of [a.holding, b.holding]) {
      expect(result.current.statuses[h.id]).toMatchObject({
        status: 'error',
        error: { kind: 'http' },
      });
    }
  });

  it('keeps crypto per-holding while batching the equities alongside it', async () => {
    let cryptoCalls = 0;
    server.use(
      http.get(`${COINGECKO_BASE}/simple/price`, () => {
        cryptoCalls += 1;
        return HttpResponse.json({ bitcoin: { usd: 61234.5 } });
      }),
      http.get(`${MARKET_BASE}/quotes`, () =>
        HttpResponse.json({ quotes: [quote('VOO', 542.31)] }),
      ),
    );
    const coin = seedHolding('coingecko:bitcoin');
    const stock = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(coin.planId));
    await act(() => result.current.fetchAll([coin.holding, stock.holding]));

    expect(cryptoCalls).toBe(1);
    expect(storedPrice(coin.planId, coin.holding.id)).toBe(61234.5);
    expect(storedPrice(stock.planId, stock.holding.id)).toBe(542.31);
  });

  it('shares the batch result so a later single fetch hits the cache', async () => {
    let singleCalls = 0;
    server.use(
      http.get(`${MARKET_BASE}/quotes`, () =>
        HttpResponse.json({ quotes: [quote('VOO', 542.31)] }),
      ),
      http.get(`${MARKET_BASE}/quote`, () => {
        singleCalls += 1;
        return HttpResponse.json(quote('VOO', 999));
      }),
    );
    const { planId, holding } = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchAll([holding]));
    await act(() => result.current.fetchPrice(holding));

    expect(singleCalls).toBe(0);
    expect(storedPrice(planId, holding.id)).toBe(542.31);
  });

  it('clears isFetchingAll once the run settles, including on failure', async () => {
    server.use(http.get(`${MARKET_BASE}/quotes`, () => HttpResponse.json({}, { status: 500 })));
    const { planId, holding } = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchAll([holding]));

    await waitFor(() => expect(result.current.isFetchingAll).toBe(false));
  });

  it('does nothing and settles when given no holdings', async () => {
    const { planId } = seedHolding('equity:VOO');

    const { result } = renderHookWithServices(() => usePriceFetcher(planId));
    await act(() => result.current.fetchAll([]));

    expect(result.current.statuses).toEqual({});
    expect(result.current.isFetchingAll).toBe(false);
  });
});
