import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { server } from '@/test/msw/server';
import { getJson } from './httpClient';

const URL_UNDER_TEST = '/test/resource';
const schema = z.object({ id: z.string(), count: z.number() });

type JsonBody = Parameters<typeof HttpResponse.json>[0];

const respondWith = (body: JsonBody, init?: ResponseInit) =>
  server.use(http.get(URL_UNDER_TEST, () => HttpResponse.json(body, init)));

describe('getJson success', () => {
  it('returns the parsed body on 200', async () => {
    respondWith({ id: 'abc', count: 3 });

    const result = await getJson(URL_UNDER_TEST, schema);

    expect(result).toEqual({ ok: true, value: { id: 'abc', count: 3 } });
  });

  it('strips fields the schema does not declare', async () => {
    respondWith({ id: 'abc', count: 3, injected: 'should not survive' });

    const result = await getJson(URL_UNDER_TEST, schema);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty('injected');
  });

  it('sends an Accept: application/json header', async () => {
    let seen: string | null = null;
    server.use(
      http.get(URL_UNDER_TEST, ({ request }) => {
        seen = request.headers.get('accept');
        return HttpResponse.json({ id: 'abc', count: 3 });
      }),
    );

    await getJson(URL_UNDER_TEST, schema);

    expect(seen).toBe('application/json');
  });
});

describe('getJson error taxonomy', () => {
  it('maps 429 to a rate_limit error', async () => {
    respondWith({}, { status: 429 });

    const result = await getJson(URL_UNDER_TEST, schema);

    expect(result).toMatchObject({ ok: false, error: { kind: 'rate_limit' } });
  });

  it('maps other non-2xx responses to an http error naming the status', async () => {
    respondWith({}, { status: 503 });

    const result = await getJson(URL_UNDER_TEST, schema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('http');
      expect(result.error.message).toContain('503');
    }
  });

  it('maps a body that is not JSON to a parse error', async () => {
    server.use(http.get(URL_UNDER_TEST, () => HttpResponse.text('<html>gateway</html>')));

    const result = await getJson(URL_UNDER_TEST, schema);

    expect(result).toMatchObject({ ok: false, error: { kind: 'parse' } });
    if (!result.ok) expect(result.error.message).toContain('malformed');
  });

  it('maps a body that does not match the schema to a parse error', async () => {
    respondWith({ id: 'abc', count: 'three' });

    const result = await getJson(URL_UNDER_TEST, schema);

    expect(result).toMatchObject({ ok: false, error: { kind: 'parse' } });
    if (!result.ok) expect(result.error.message).toContain('unexpected format');
  });

  it('maps a transport failure to a network error', async () => {
    server.use(http.get(URL_UNDER_TEST, () => HttpResponse.error()));

    const result = await getJson(URL_UNDER_TEST, schema);

    expect(result).toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('aborts and reports a timeout once timeoutMs elapses', async () => {
    server.use(
      http.get(URL_UNDER_TEST, async () => {
        await delay(300);
        return HttpResponse.json({ id: 'abc', count: 3 });
      }),
    );

    const result = await getJson(URL_UNDER_TEST, schema, { timeoutMs: 20 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('network');
      expect(result.error.message).toContain('timed out');
    }
  });

  it('gives up when the caller aborts through the supplied signal', async () => {
    server.use(
      http.get(URL_UNDER_TEST, async () => {
        await delay(300);
        return HttpResponse.json({ id: 'abc', count: 3 });
      }),
    );
    const controller = new AbortController();
    const pending = getJson(URL_UNDER_TEST, schema, { signal: controller.signal });
    controller.abort();

    expect(await pending).toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('never throws — every failure comes back as an Err', async () => {
    server.use(http.get(URL_UNDER_TEST, () => HttpResponse.error()));

    await expect(getJson(URL_UNDER_TEST, schema)).resolves.toMatchObject({ ok: false });
  });
});
