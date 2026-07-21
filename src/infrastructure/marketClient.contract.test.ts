import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  marketAllocationEquityPayload,
  marketAllocationPayload,
  marketQuotePayload,
  marketSearchPayload,
} from '@/test/fixtures/upstream';
import { server } from '@/test/msw/server';
import { createMarketClient } from './marketClient';

/**
 * The DTO contract between the client and our own /api/market proxy. The
 * batching behaviour of `quotes` is covered separately in marketClient.test.ts.
 */
const BASE = '/api/market/equities';
const client = createMarketClient();

type JsonBody = Parameters<typeof HttpResponse.json>[0];

const on = (path: string, body: JsonBody, init?: ResponseInit) =>
  server.use(http.get(`${BASE}/${path}`, () => HttpResponse.json(body, init)));

describe('market search', () => {
  it('parses results with and without an instrument type', async () => {
    on('search', marketSearchPayload);

    const result = await client.search('vanguard');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results).toHaveLength(3);
      expect(result.value.results[0]?.type).toBe('ETF');
      expect(result.value.results[2]?.type).toBeUndefined();
    }
  });

  it('rejects an instrument type outside the allocation-driving enum', async () => {
    on('search', {
      results: [
        { symbol: 'BTC', name: 'Bitcoin', exchange: 'CCC', currency: 'USD', type: 'CRYPTO' },
      ],
    });

    expect(await client.search('btc')).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('rejects a result missing its currency', async () => {
    on('search', { results: [{ symbol: 'VOO', name: 'Vanguard', exchange: 'PCX' }] });

    expect(await client.search('voo')).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('accepts an empty result set', async () => {
    on('search', { results: [] });

    expect(await client.search('zzzz')).toEqual({ ok: true, value: { results: [] } });
  });
});

describe('market quote', () => {
  it('parses a well-formed quote', async () => {
    on('quote', marketQuotePayload);

    expect(await client.quote('VOO')).toEqual({ ok: true, value: marketQuotePayload });
  });

  it('rejects a price sent as a string', async () => {
    on('quote', { ...marketQuotePayload, price: '542.31' });

    expect(await client.quote('VOO')).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('rejects a quote with no asOf timestamp', async () => {
    const { asOf: _asOf, ...withoutAsOf } = marketQuotePayload;
    on('quote', withoutAsOf);

    expect(await client.quote('VOO')).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('rejects an asOf sent as an ISO string rather than epoch ms', async () => {
    on('quote', { ...marketQuotePayload, asOf: '2026-07-20T19:00:00.000Z' });

    expect(await client.quote('VOO')).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });
});

describe('market allocation', () => {
  it('parses a fund with a full composition breakdown', async () => {
    on('allocation', marketAllocationPayload);

    expect(await client.getAllocation('VOO')).toEqual({
      ok: true,
      value: marketAllocationPayload,
    });
  });

  it('parses a plain equity, where every composition field is null', async () => {
    on('allocation', marketAllocationEquityPayload);

    const result = await client.getAllocation('AAPL');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stockPct).toBeNull();
      expect(result.value.sectorWeightings).toEqual([]);
    }
  });

  it('rejects a null sectorWeightings — the array is required even when empty', async () => {
    on('allocation', { ...marketAllocationEquityPayload, sectorWeightings: null });

    expect(await client.getAllocation('AAPL')).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });

  it('rejects a sector weighting missing its weight', async () => {
    on('allocation', {
      ...marketAllocationPayload,
      sectorWeightings: [{ sector: 'technology' }],
    });

    expect(await client.getAllocation('VOO')).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });

  it('rejects an omitted composition field rather than defaulting it to null', async () => {
    const { bondPct: _bondPct, ...withoutBond } = marketAllocationPayload;
    on('allocation', withoutBond);

    expect(await client.getAllocation('VOO')).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });
});

describe('market quotes batch contract', () => {
  it('parses a batch where the provider omitted an unknown symbol', async () => {
    on('quotes', { quotes: [marketQuotePayload] });

    const result = await client.quotes(['VOO', 'NOTREAL']);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.quotes.map((q) => q.symbol)).toEqual(['VOO']);
  });

  it('rejects a batch where one quote is malformed', async () => {
    on('quotes', { quotes: [marketQuotePayload, { symbol: 'AAPL', price: 200 }] });

    expect(await client.quotes(['VOO', 'AAPL'])).toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });
});
