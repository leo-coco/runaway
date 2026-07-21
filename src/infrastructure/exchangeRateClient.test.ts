import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { exchangeRateLatestPayload } from '@/test/fixtures/upstream';
import { server } from '@/test/msw/server';
import { createExchangeRateClient } from './exchangeRateClient';

const ROUTE = '/api/market/fx/latest/:base';
const client = createExchangeRateClient();

type JsonBody = Parameters<typeof HttpResponse.json>[0];

const onLatest = (body: JsonBody, init?: ResponseInit) =>
  server.use(http.get(ROUTE, () => HttpResponse.json(body, init)));

describe('exchangeRate latest', () => {
  it('keeps only the modelled fields from a full upstream payload', async () => {
    onLatest(exchangeRateLatestPayload);

    const result = await client.latest('USD');

    expect(result).toEqual({
      ok: true,
      value: {
        result: 'success',
        base_code: 'USD',
        conversion_rates: { USD: 1, EUR: 0.9214, CAD: 1.3705, GBP: 0.7788 },
      },
    });
  });

  it('goes through the same-origin proxy so the api key stays server-side', async () => {
    let seenUrl = '';
    server.use(
      http.get(ROUTE, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json(exchangeRateLatestPayload);
      }),
    );

    await client.latest('USD');

    expect(new URL(seenUrl).pathname).toBe('/api/market/fx/latest/USD');
    expect(seenUrl).not.toContain('exchangerate-api.com');
    expect(new URL(seenUrl).search).toBe('');
  });

  it('encodes the base currency into the path', async () => {
    let seenPath = '';
    server.use(
      http.get(ROUTE, ({ request }) => {
        seenPath = new URL(request.url).pathname;
        return HttpResponse.json(exchangeRateLatestPayload);
      }),
    );

    await client.latest('a/b');

    expect(seenPath).toBe('/api/market/fx/latest/a%2Fb');
  });

  it('retains the upstream error-type when the provider reports a failure', async () => {
    onLatest({
      result: 'error',
      base_code: 'USD',
      conversion_rates: {},
      'error-type': 'unsupported-code',
    });

    const result = await client.latest('USD');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe('error');
      expect(result.value['error-type']).toBe('unsupported-code');
    }
  });

  it('rejects a payload with a non-numeric conversion rate', async () => {
    onLatest({ result: 'success', base_code: 'USD', conversion_rates: { EUR: '0.92' } });

    expect(await client.latest('USD')).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('rejects a payload missing conversion_rates', async () => {
    onLatest({ result: 'success', base_code: 'USD' });

    expect(await client.latest('USD')).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('maps a proxy outage to an http error', async () => {
    onLatest({}, { status: 502 });

    expect(await client.latest('USD')).toMatchObject({ ok: false, error: { kind: 'http' } });
  });
});
