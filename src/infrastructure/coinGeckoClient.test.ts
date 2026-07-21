import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { coinGeckoPricePayload, coinGeckoSearchPayload } from '@/test/fixtures/upstream';
import { server } from '@/test/msw/server';
import { createCoinGeckoClient } from './coinGeckoClient';

const BASE = 'https://coingecko.test/api/v3';
const client = createCoinGeckoClient(BASE);

type JsonBody = Parameters<typeof HttpResponse.json>[0];

const onSearch = (body: JsonBody) =>
  server.use(http.get(`${BASE}/search`, () => HttpResponse.json(body)));
const onPrice = (body: JsonBody) =>
  server.use(http.get(`${BASE}/simple/price`, () => HttpResponse.json(body)));

describe('coinGecko search', () => {
  it('keeps only the modelled fields from a full upstream payload', async () => {
    onSearch(coinGeckoSearchPayload);

    const result = await client.search('bitcoin');

    expect(result).toEqual({
      ok: true,
      value: {
        coins: [
          { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', market_cap_rank: 1 },
          { id: 'wrapped-bitcoin', symbol: 'WBTC', name: 'Wrapped Bitcoin', market_cap_rank: null },
        ],
      },
    });
  });

  it('accepts a coin with no market_cap_rank key at all', async () => {
    onSearch({ coins: [{ id: 'obscure', symbol: 'OBS', name: 'Obscure' }] });

    const result = await client.search('obscure');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.coins[0]?.market_cap_rank).toBeUndefined();
  });

  it('accepts an empty result set', async () => {
    onSearch({ coins: [] });

    const result = await client.search('nothing-matches-this');

    expect(result).toEqual({ ok: true, value: { coins: [] } });
  });

  it('url-encodes the query', async () => {
    let seenQuery: string | null = null;
    server.use(
      http.get(`${BASE}/search`, ({ request }) => {
        seenQuery = new URL(request.url).searchParams.get('query');
        return HttpResponse.json({ coins: [] });
      }),
    );

    await client.search('bitcoin cash & friends');

    expect(seenQuery).toBe('bitcoin cash & friends');
  });

  it('rejects a payload missing the coins array', async () => {
    onSearch({ exchanges: [], categories: [] });

    expect(await client.search('bitcoin')).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });

  it('rejects a coin whose id is not a string', async () => {
    onSearch({ coins: [{ id: 42, symbol: 'BTC', name: 'Bitcoin' }] });

    expect(await client.search('bitcoin')).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });

  it('rejects a coin missing a required field', async () => {
    onSearch({ coins: [{ id: 'bitcoin', symbol: 'BTC' }] });

    expect(await client.search('bitcoin')).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });
});

describe('coinGecko price', () => {
  it('parses the nested coin/currency record', async () => {
    onPrice(coinGeckoPricePayload);

    const result = await client.price(['bitcoin', 'ethereum'], 'EUR');

    expect(result).toEqual({ ok: true, value: coinGeckoPricePayload });
  });

  it('joins the ids and lowercases the currency in the request', async () => {
    let seen: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/simple/price`, ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({});
      }),
    );

    await client.price(['bitcoin', 'ethereum'], 'EUR');

    expect(seen!.get('ids')).toBe('bitcoin,ethereum');
    expect(seen!.get('vs_currencies')).toBe('eur');
  });

  it('accepts an empty record when no id resolved', async () => {
    onPrice({});

    expect(await client.price(['not-a-coin'], 'usd')).toEqual({ ok: true, value: {} });
  });

  it('rejects a non-numeric price', async () => {
    onPrice({ bitcoin: { eur: '61234.5' } });

    expect(await client.price(['bitcoin'], 'eur')).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });

  it('rejects a price that is not nested under a currency', async () => {
    onPrice({ bitcoin: 61234.5 });

    expect(await client.price(['bitcoin'], 'eur')).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });

  it('surfaces provider throttling as a rate_limit error', async () => {
    server.use(http.get(`${BASE}/simple/price`, () => HttpResponse.json({}, { status: 429 })));

    expect(await client.price(['bitcoin'], 'eur')).toMatchObject({
      ok: false,
      error: { kind: 'rate_limit' },
    });
  });
});
