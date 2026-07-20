import { beforeEach, describe, expect, it, vi } from 'vitest';

const quoteMock = vi.fn();
const searchMock = vi.fn();
const quoteSummaryMock = vi.fn();
const getSession = vi.fn();

vi.mock('../auth.js', () => ({ auth: { api: { getSession } } }));

vi.mock('yahoo-finance2', () => ({
  default: class {
    quote = quoteMock;
    search = searchMock;
    quoteSummary = quoteSummaryMock;
  },
}));

/**
 * In-memory stand-in for the Postgres-backed cache, faithful to the contract
 * getCached is tested against in server/lib/cachedFetch.test.ts: fresh rows skip
 * the fetcher, and a throwing fetcher replays the last known-good payload.
 */
const store = new Map<string, { payload: unknown; expiresAt: number }>();

vi.mock('../lib/cachedFetch.js', () => ({
  getCached: async (key: string, ttlMs: number, fetcher: () => Promise<unknown>) => {
    const row = store.get(key);
    if (row && row.expiresAt > Date.now()) return { value: row.payload, status: 'hit' };
    try {
      const value = await fetcher();
      store.set(key, { payload: value, expiresAt: Date.now() + ttlMs });
      return { value, status: 'miss' };
    } catch (cause) {
      if (row) return { value: row.payload, status: 'stale' };
      throw cause;
    }
  },
}));

// FX needs the server env only for the upstream key; keep the rest of env
// parsing out of the test.
vi.mock('../env.js', () => ({
  serverEnv: () => ({ EXCHANGERATE_API_KEY: 'test-fx-key' }),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { marketRoutes } = await import('./market.js');

const yahooQuote = (symbol: string, price: number, currency: string) => ({
  symbol,
  regularMarketPrice: price,
  currency,
  fullExchangeName: 'Toronto',
  regularMarketTime: new Date('2026-07-15T20:00:00Z'),
});

beforeEach(() => {
  store.clear();
  quoteMock.mockReset();
  searchMock.mockReset();
  quoteSummaryMock.mockReset();
  fetchMock.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('equity authentication', () => {
  it.each([
    '/equities/search?keywords=vfv',
    '/equities/quote?symbol=VFV.TO',
    '/equities/quotes?symbols=VFV.TO',
    '/equities/allocation?symbol=VFV.TO',
  ])('rejects anonymous requests to %s', async (path) => {
    getSession.mockResolvedValue(null);

    const res = await marketRoutes.request(path);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(searchMock).not.toHaveBeenCalled();
    expect(quoteMock).not.toHaveBeenCalled();
    expect(quoteSummaryMock).not.toHaveBeenCalled();
  });
});

describe('GET /equities/quote', () => {
  it('maps a quote to the neutral DTO', async () => {
    quoteMock.mockResolvedValue([yahooQuote('VFV.TO', 188.32, 'CAD')]);

    const res = await marketRoutes.request('/equities/quote?symbol=VFV.TO');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      symbol: 'VFV.TO',
      price: 188.32,
      currency: 'CAD',
      exchange: 'Toronto',
      asOf: Date.parse('2026-07-15T20:00:00Z'),
    });
  });

  it('converts minor-unit (GBp) quotes to the major unit', async () => {
    // Yahoo prices some LSE listings in pence; taking 1025 as GBP would
    // overstate the holding 100x.
    quoteMock.mockResolvedValue([yahooQuote('ISF.L', 1025, 'GBp')]);

    const res = await marketRoutes.request('/equities/quote?symbol=ISF.L');

    await expect(res.json()).resolves.toMatchObject({ price: 10.25, currency: 'GBP' });
  });

  it('reports an unknown symbol as 404, not as an upstream failure', async () => {
    quoteMock.mockResolvedValue([]);

    const res = await marketRoutes.request('/equities/quote?symbol=NOPE');

    expect(res.status).toBe(404);
    expect(store.has('equity:NOPE')).toBe(false);
  });

  it('reports a genuine upstream failure as 502', async () => {
    quoteMock.mockRejectedValue(new Error('socket hang up'));

    const res = await marketRoutes.request('/equities/quote?symbol=VFV.TO');

    expect(res.status).toBe(502);
  });

  it('replays the last good quote when upstream fails', async () => {
    quoteMock.mockResolvedValueOnce([yahooQuote('VFV.TO', 188.32, 'CAD')]);
    await marketRoutes.request('/equities/quote?symbol=VFV.TO');
    store.set('equity:VFV.TO', { payload: { symbol: 'VFV.TO', price: 188.32 }, expiresAt: 0 });
    quoteMock.mockRejectedValue(new Error('yahoo is down'));

    const res = await marketRoutes.request('/equities/quote?symbol=VFV.TO');

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache')).toBe('stale');
  });
});

describe('GET /equities/quotes', () => {
  it('accepts exactly 20 unique symbols', async () => {
    const symbols = Array.from({ length: 20 }, (_, i) => `SYM${i}`);
    quoteMock.mockResolvedValue(symbols.map((symbol) => yahooQuote(symbol, 1, 'USD')));

    const res = await marketRoutes.request(`/equities/quotes?symbols=${symbols.join(',')}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { quotes: { symbol: string }[] };
    expect(body.quotes).toHaveLength(20);
    expect(quoteMock).toHaveBeenCalledWith(symbols);
  });

  it('rejects more than 20 unique symbols without calling the provider', async () => {
    const symbols = Array.from({ length: 21 }, (_, i) => `SYM${i}`).join(',');

    const res = await marketRoutes.request(`/equities/quotes?symbols=${symbols}`);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'A maximum of 20 unique symbols is allowed',
    });
    expect(quoteMock).not.toHaveBeenCalled();
  });

  it('counts duplicate symbols only once toward the batch limit', async () => {
    const symbols = [...Array.from({ length: 20 }, (_, i) => `SYM${i}`), 'SYM0'];
    quoteMock.mockResolvedValue(symbols.slice(0, 20).map((symbol) => yahooQuote(symbol, 1, 'USD')));

    const res = await marketRoutes.request(`/equities/quotes?symbols=${symbols.join(',')}`);

    expect(res.status).toBe(200);
    expect(quoteMock).toHaveBeenCalledWith(symbols.slice(0, 20));
  });

  it('fetches every symbol in a single upstream call', async () => {
    quoteMock.mockResolvedValue([
      yahooQuote('VFV.TO', 188.32, 'CAD'),
      yahooQuote('VOO', 691.1, 'USD'),
    ]);

    const res = await marketRoutes.request('/equities/quotes?symbols=VFV.TO,VOO');

    expect(res.status).toBe(200);
    expect(quoteMock).toHaveBeenCalledTimes(1);
    expect(quoteMock).toHaveBeenCalledWith(['VFV.TO', 'VOO']);
    const body = (await res.json()) as { quotes: { symbol: string }[] };
    expect(body.quotes.map((q) => q.symbol)).toEqual(['VFV.TO', 'VOO']);
  });

  it('caches per symbol, so a later batch only fetches the new ones', async () => {
    quoteMock.mockResolvedValueOnce([yahooQuote('VFV.TO', 188.32, 'CAD')]);
    await marketRoutes.request('/equities/quotes?symbols=VFV.TO');
    quoteMock.mockResolvedValueOnce([yahooQuote('VOO', 691.1, 'USD')]);

    const res = await marketRoutes.request('/equities/quotes?symbols=VFV.TO,VOO');

    // VFV.TO was already cached by the single-symbol route's key.
    expect(res.headers.get('x-cache')).toBe('miss');
    const body = (await res.json()) as { quotes: { symbol: string }[] };
    expect(body.quotes.map((q) => q.symbol).sort()).toEqual(['VFV.TO', 'VOO']);
  });

  it('serves cached symbols without any upstream call', async () => {
    quoteMock.mockResolvedValue([
      yahooQuote('VFV.TO', 188.32, 'CAD'),
      yahooQuote('VOO', 691.1, 'USD'),
    ]);
    await marketRoutes.request('/equities/quotes?symbols=VFV.TO,VOO');
    quoteMock.mockClear();

    const res = await marketRoutes.request('/equities/quotes?symbols=VFV.TO,VOO');

    expect(res.headers.get('x-cache')).toBe('hit');
    expect(quoteMock).not.toHaveBeenCalled();
  });

  it('omits unknown symbols rather than failing the whole batch', async () => {
    quoteMock.mockResolvedValue([yahooQuote('VOO', 691.1, 'USD')]);

    const res = await marketRoutes.request('/equities/quotes?symbols=VOO,NOPE');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { quotes: { symbol: string }[] };
    expect(body.quotes.map((q) => q.symbol)).toEqual(['VOO']);
  });
});

describe('GET /fx/latest/:base', () => {
  const ratesDto = {
    result: 'success',
    base_code: 'USD',
    conversion_rates: { USD: 1, CAD: 1.35, EUR: 0.92 },
  };
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('serves rates without a session (public route) and keeps the key server-side', async () => {
    getSession.mockResolvedValue(null);
    fetchMock.mockResolvedValue(jsonResponse(ratesDto));

    const res = await marketRoutes.request('/fx/latest/usd');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(ratesDto);
    // The key rides in the upstream URL only; the base is uppercased.
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe('https://v6.exchangerate-api.com/v6/test-fx-key/latest/USD');
  });

  it('caches per base currency', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ratesDto));
    await marketRoutes.request('/fx/latest/USD');
    fetchMock.mockClear();

    const res = await marketRoutes.request('/fx/latest/USD');

    expect(res.headers.get('x-cache')).toBe('hit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a provider error DTO as an upstream failure and does not cache it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...ratesDto, result: 'error', 'error-type': 'invalid-key' }),
    );

    const res = await marketRoutes.request('/fx/latest/USD');

    expect(res.status).toBe(502);
    expect(store.has('fx:USD')).toBe(false);
  });

  it('maps an upstream 429 to 429', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 429));

    const res = await marketRoutes.request('/fx/latest/USD');

    expect(res.status).toBe(429);
  });

  it('replays the last good rates when upstream fails', async () => {
    store.set('fx:USD', { payload: ratesDto, expiresAt: 0 }); // expired but known-good
    fetchMock.mockRejectedValue(new Error('provider down'));

    const res = await marketRoutes.request('/fx/latest/USD');

    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache')).toBe('stale');
    await expect(res.json()).resolves.toEqual(ratesDto);
  });
});

describe('GET /equities/search', () => {
  it('drops options and other non-investable noise', async () => {
    searchMock.mockResolvedValue({
      quotes: [
        { isYahooFinance: true, quoteType: 'ETF', symbol: 'VFV.TO', shortname: 'Vanguard S&P 500' },
        { isYahooFinance: true, quoteType: 'OPTION', symbol: 'VFVA261218P00140000' },
        { isYahooFinance: true, quoteType: 'FUTURE', symbol: 'ES=F' },
        { isYahooFinance: false, name: 'Some Startup' },
      ],
    });
    quoteMock.mockResolvedValue([yahooQuote('VFV.TO', 188.32, 'CAD')]);

    const res = await marketRoutes.request('/equities/search?keywords=vfv');

    await expect(res.json()).resolves.toEqual({
      results: [
        {
          symbol: 'VFV.TO',
          name: 'Vanguard S&P 500',
          exchange: 'Toronto',
          currency: 'CAD',
          type: 'ETF',
        },
      ],
    });
  });

  it('drops nameless Morningstar-id funds', async () => {
    searchMock.mockResolvedValue({
      quotes: [
        { isYahooFinance: true, quoteType: 'MUTUALFUND', symbol: '0P0001KRJP.TW' },
        { isYahooFinance: true, quoteType: 'ETF', symbol: 'GRE.PA', shortname: 'Amundi Greece' },
      ],
    });
    quoteMock.mockResolvedValue([yahooQuote('GRE.PA', 25.1, 'EUR')]);

    const res = await marketRoutes.request('/equities/search?keywords=amundi');

    const body = (await res.json()) as { results: { symbol: string }[] };
    expect(body.results.map((r) => r.symbol)).toEqual(['GRE.PA']);
  });

  it('drops results that have no quote, since currency comes from it', async () => {
    searchMock.mockResolvedValue({
      quotes: [{ isYahooFinance: true, quoteType: 'EQUITY', symbol: 'GHOST', shortname: 'Ghost' }],
    });
    quoteMock.mockResolvedValue([]);

    const res = await marketRoutes.request('/equities/search?keywords=ghost');

    await expect(res.json()).resolves.toEqual({ results: [] });
  });

  it('short queries do not reach the provider', async () => {
    const res = await marketRoutes.request('/equities/search?keywords=a');

    await expect(res.json()).resolves.toEqual({ results: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });
});

describe('GET /equities/allocation', () => {
  it('maps topHoldings + fundProfile fractions to percentages', async () => {
    quoteSummaryMock.mockResolvedValue({
      topHoldings: {
        stockPosition: 0.9931,
        bondPosition: 0,
        cashPosition: 0.0054,
        otherPosition: 0.0015,
        preferredPosition: 0,
        convertiblePosition: 0,
        sectorWeightings: [{ technology: 0.3607 }, { healthcare: 0 }, { energy: 0.03 }],
      },
      fundProfile: { categoryName: 'Large Blend', family: 'Vanguard' },
    });

    const res = await marketRoutes.request('/equities/allocation?symbol=VTI');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      stockPct: 99.3,
      bondPct: 0,
      cashPct: 0.5,
      otherPct: 0.2,
      preferredPct: 0,
      convertiblePct: 0,
      categoryName: 'Large Blend',
      fundFamily: 'Vanguard',
      // The zero-weight sector is dropped.
      sectorWeightings: [
        { sector: 'technology', weightPct: 36.1 },
        { sector: 'energy', weightPct: 3 },
      ],
    });
  });

  it('returns null-ish fields for a plain equity, which carries neither module', async () => {
    quoteSummaryMock.mockResolvedValue({});

    const res = await marketRoutes.request('/equities/allocation?symbol=AAPL');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      stockPct: null,
      bondPct: null,
      cashPct: null,
      otherPct: null,
      preferredPct: null,
      convertiblePct: null,
      categoryName: null,
      fundFamily: null,
      sectorWeightings: [],
    });
  });

  it('reports a genuine upstream failure as 502', async () => {
    quoteSummaryMock.mockRejectedValue(new Error('socket hang up'));

    const res = await marketRoutes.request('/equities/allocation?symbol=VTI');

    expect(res.status).toBe(502);
  });

  it('retries a same-name sibling listing when this one has no composition', async () => {
    // The requested listing carries no fund module; a sibling on another
    // exchange (same exact name) does.
    quoteSummaryMock.mockImplementation((sym: string) => {
      if (sym === 'VGRO.TO') {
        return Promise.resolve({
          topHoldings: { stockPosition: 0.8, bondPosition: 0.2 },
          fundProfile: { categoryName: 'Global Allocation', family: 'Vanguard' },
        });
      }
      return Promise.resolve({});
    });
    searchMock.mockResolvedValue({
      quotes: [
        { isYahooFinance: true, symbol: 'VGRO.NE', shortname: 'Vanguard Growth ETF Portfolio' },
        { isYahooFinance: true, symbol: 'VGRO.TO', shortname: 'Vanguard Growth ETF Portfolio' },
        // Same ticker family, different fund name → must not be substituted.
        { isYahooFinance: true, symbol: 'VGRO.L', shortname: 'Unrelated Growth Fund' },
      ],
    });

    const res = await marketRoutes.request('/equities/allocation?symbol=VGRO.NE');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stockPct: number; bondPct: number; fundFamily: string };
    expect(body.stockPct).toBe(80);
    expect(body.bondPct).toBe(20);
    expect(body.fundFamily).toBe('Vanguard');
    expect(quoteSummaryMock).toHaveBeenCalledWith('VGRO.TO', expect.anything());
    expect(quoteSummaryMock).not.toHaveBeenCalledWith('VGRO.L', expect.anything());
  });

  it('falls back to the null-filled shape when no sibling has data', async () => {
    quoteSummaryMock.mockResolvedValue({});
    searchMock.mockResolvedValue({
      quotes: [
        { isYahooFinance: true, symbol: 'FUND.A', shortname: 'Example Fund' },
        { isYahooFinance: true, symbol: 'FUND.B', shortname: 'Example Fund' },
      ],
    });

    const res = await marketRoutes.request('/equities/allocation?symbol=FUND.A');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ stockPct: null, bondPct: null });
  });

  it('a clean empty is cached even when the sibling search fails', async () => {
    quoteSummaryMock.mockResolvedValue({});
    searchMock.mockRejectedValue(new Error('search socket hang up'));

    const res = await marketRoutes.request('/equities/allocation?symbol=AAPL');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ stockPct: null });
  });

  it('requires a symbol', async () => {
    const res = await marketRoutes.request('/equities/allocation?symbol=');

    expect(res.status).toBe(400);
    expect(quoteSummaryMock).not.toHaveBeenCalled();
  });
});
