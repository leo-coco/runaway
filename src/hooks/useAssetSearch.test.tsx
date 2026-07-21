import { http, HttpResponse } from 'msw';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COINGECKO_BASE, MARKET_BASE, renderHookWithServices } from '@/test/harness';
import { coinGeckoSearchPayload, marketSearchPayload } from '@/test/fixtures/upstream';
import { server } from '@/test/msw/server';
import { useAssetSearch } from './useAssetSearch';

type JsonBody = Parameters<typeof HttpResponse.json>[0];

/** Registers both search providers and reports how often each was called. */
const stubProviders = (
  crypto: JsonBody | { status: number } = coinGeckoSearchPayload,
  equities: JsonBody | { status: number } = marketSearchPayload,
) => {
  const calls = { crypto: 0, equities: 0 };
  const respond = (body: JsonBody | { status: number }) =>
    body && typeof body === 'object' && 'status' in body && typeof body.status === 'number'
      ? HttpResponse.json({}, { status: body.status })
      : HttpResponse.json(body as JsonBody);

  server.use(
    http.get(`${COINGECKO_BASE}/search`, () => {
      calls.crypto += 1;
      return respond(crypto);
    }),
    http.get(`${MARKET_BASE}/search`, () => {
      calls.equities += 1;
      return respond(equities);
    }),
  );
  return calls;
};

describe('useAssetSearch gating', () => {
  it('stays idle and issues no request below two characters', async () => {
    const calls = stubProviders();

    const { result } = renderHookWithServices(() => useAssetSearch('b'));

    await vi.waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.data).toBeUndefined();
    expect(calls).toEqual({ crypto: 0, equities: 0 });
  });

  it('ignores surrounding whitespace when deciding to search', async () => {
    const calls = stubProviders();

    renderHookWithServices(() => useAssetSearch(' b '));

    await vi.waitFor(() => expect(calls).toEqual({ crypto: 0, equities: 0 }));
  });

  it('queries both providers once the query reaches two characters', async () => {
    const calls = stubProviders();

    const { result } = renderHookWithServices(() => useAssetSearch('bi'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toEqual({ crypto: 1, equities: 1 });
  });
});

describe('useAssetSearch results', () => {
  it('merges crypto and equity hits into namespaced instruments', async () => {
    stubProviders();

    const { result } = renderHookWithServices(() => useAssetSearch('bitcoin'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ids = result.current.data?.map((i) => i.id);
    expect(ids).toEqual([
      'coingecko:bitcoin',
      'coingecko:wrapped-bitcoin',
      'equity:VOO',
      'equity:AAPL',
      'equity:XEQT.TO',
    ]);
  });

  it('classifies venues into asset classes and keeps the native currency', async () => {
    stubProviders();

    const { result } = renderHookWithServices(() => useAssetSearch('bitcoin'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const byId = new Map(result.current.data?.map((i) => [i.id, i]));
    expect(byId.get('coingecko:bitcoin')).toMatchObject({
      assetClass: 'crypto',
      symbol: 'BTC',
      nativeCurrency: 'USD',
    });
    expect(byId.get('equity:AAPL')).toMatchObject({ assetClass: 'us_equity', quoteType: 'EQUITY' });
    expect(byId.get('equity:XEQT.TO')).toMatchObject({
      assetClass: 'ca_equity',
      nativeCurrency: 'CAD',
    });
  });

  it('drops an instrument whose currency the app cannot represent', async () => {
    stubProviders(
      { coins: [] },
      {
        results: [
          { symbol: 'TSM', name: 'TSMC', exchange: 'Taipei', currency: 'TWD' },
          { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'PCX', currency: 'USD' },
        ],
      },
    );

    const { result } = renderHookWithServices(() => useAssetSearch('t'.padEnd(3, 's')));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((i) => i.id)).toEqual(['equity:VOO']);
  });

  it('still returns equity hits when the crypto provider fails', async () => {
    stubProviders({ status: 500 });

    const { result } = renderHookWithServices(() => useAssetSearch('vanguard'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.every((i) => i.id.startsWith('equity:'))).toBe(true);
    expect(result.current.data).not.toHaveLength(0);
  });

  it('still returns crypto hits when the equity provider fails', async () => {
    stubProviders(coinGeckoSearchPayload, { status: 503 });

    const { result } = renderHookWithServices(() => useAssetSearch('bitcoin'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.every((i) => i.id.startsWith('coingecko:'))).toBe(true);
  });

  it('surfaces a typed AppError only when both providers fail', async () => {
    stubProviders({ status: 500 }, { status: 500 });

    const { result } = renderHookWithServices(() => useAssetSearch('bitcoin'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ kind: 'http' });
  });

  it('reports provider throttling as a rate_limit error', async () => {
    stubProviders({ status: 429 }, { status: 429 });

    const { result } = renderHookWithServices(() => useAssetSearch('bitcoin'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ kind: 'rate_limit' });
  });

  it('refetches against the new key when the query changes', async () => {
    const calls = stubProviders();
    let query = 'bi';

    const { result, rerender } = renderHookWithServices(() => useAssetSearch(query));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    query = 'bit';
    rerender();

    await waitFor(() => expect(calls.crypto).toBe(2));
    expect(calls.equities).toBe(2);
  });

  it('serves a re-render of the same query from cache without refetching', async () => {
    const calls = stubProviders();

    const { result, rerender } = renderHookWithServices(() => useAssetSearch('bi'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender();
    rerender();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toEqual({ crypto: 1, equities: 1 });
  });
});
