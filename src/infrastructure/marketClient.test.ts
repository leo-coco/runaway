import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketClient } from './marketClient';

const responseFor = (url: string | URL | Request): Response => {
  const parsed = new URL(String(url), 'https://example.test');
  const symbols = (parsed.searchParams.get('symbols') ?? '').split(',').filter(Boolean);
  return Response.json({
    quotes: symbols.map((symbol) => ({
      symbol,
      price: 1,
      currency: 'USD',
      exchange: 'Test',
      asOf: 1,
    })),
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('market client batch quotes', () => {
  it('splits more than 20 symbols into server-compatible batches', async () => {
    const fetchMock = vi.fn(responseFor);
    vi.stubGlobal('fetch', fetchMock);
    const symbols = Array.from({ length: 45 }, (_, i) => `SYM${i}`);

    const result = await createMarketClient().quotes(symbols);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.quotes).toHaveLength(45);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.map(
        ([url]) =>
          new URL(String(url), 'https://example.test').searchParams.get('symbols')?.split(',')
            .length,
      ),
    ).toEqual([20, 20, 5]);
  });

  it('does not make another batch request after a batch fails', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(responseFor)
      .mockResolvedValueOnce(new Response(null, { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const symbols = Array.from({ length: 45 }, (_, i) => `SYM${i}`);

    const result = await createMarketClient().quotes(symbols);

    expect(result).toMatchObject({ ok: false, error: { kind: 'http' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
