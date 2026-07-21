/**
 * Payload shapes as the upstream providers actually return them, including the
 * fields our schemas don't model. Keeping the extra keys is the point: it proves
 * the schemas tolerate a provider adding fields, and fail only on the ones we
 * depend on.
 */

/** CoinGecko GET /search. */
export const coinGeckoSearchPayload = {
  coins: [
    {
      id: 'bitcoin',
      name: 'Bitcoin',
      api_symbol: 'bitcoin',
      symbol: 'BTC',
      market_cap_rank: 1,
      thumb: 'https://example.test/thumb/1.png',
      large: 'https://example.test/large/1.png',
    },
    {
      id: 'wrapped-bitcoin',
      name: 'Wrapped Bitcoin',
      api_symbol: 'wrapped-bitcoin',
      symbol: 'WBTC',
      market_cap_rank: null,
      thumb: 'https://example.test/thumb/2.png',
      large: 'https://example.test/large/2.png',
    },
  ],
  exchanges: [{ id: 'binance', name: 'Binance' }],
  categories: [{ id: 1, name: 'Smart Contract Platform' }],
  nfts: [],
};

/** CoinGecko GET /simple/price?ids=bitcoin,ethereum&vs_currencies=eur. */
export const coinGeckoPricePayload = {
  bitcoin: { eur: 61234.5 },
  ethereum: { eur: 2841.07 },
};

/** ExchangeRate-API GET /v6/{key}/latest/{base}, proxied by /api/market/fx. */
export const exchangeRateLatestPayload = {
  result: 'success',
  documentation: 'https://www.exchangerate-api.com/docs',
  terms_of_use: 'https://www.exchangerate-api.com/terms',
  time_last_update_unix: 1_753_056_001,
  time_last_update_utc: 'Mon, 21 Jul 2026 00:00:01 +0000',
  time_next_update_unix: 1_753_142_401,
  time_next_update_utc: 'Tue, 22 Jul 2026 00:00:01 +0000',
  base_code: 'USD',
  conversion_rates: { USD: 1, EUR: 0.9214, CAD: 1.3705, GBP: 0.7788 },
};

/** Our own /api/market/equities/search DTO. */
export const marketSearchPayload = {
  results: [
    { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'PCX', currency: 'USD', type: 'ETF' },
    { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NMS', currency: 'USD', type: 'EQUITY' },
    // Instrument kinds the server doesn't classify arrive without `type`.
    { symbol: 'XEQT.TO', name: 'iShares Core Equity ETF', exchange: 'TOR', currency: 'CAD' },
  ],
};

/** Our own /api/market/equities/quote DTO. */
export const marketQuotePayload = {
  symbol: 'VOO',
  price: 542.31,
  currency: 'USD',
  exchange: 'PCX',
  asOf: 1_753_042_800_000,
};

/** Our own /api/market/equities/allocation DTO, for a fund. */
export const marketAllocationPayload = {
  stockPct: 99.4,
  bondPct: 0,
  cashPct: 0.6,
  otherPct: 0,
  preferredPct: 0,
  convertiblePct: 0,
  categoryName: 'Large Blend',
  fundFamily: 'Vanguard',
  sectorWeightings: [
    { sector: 'technology', weightPct: 33.1 },
    { sector: 'financial_services', weightPct: 13.4 },
  ],
};

/** Allocation for a plain equity: no fund modules upstream, so every field is null. */
export const marketAllocationEquityPayload = {
  stockPct: null,
  bondPct: null,
  cashPct: null,
  otherPct: null,
  preferredPct: null,
  convertiblePct: null,
  categoryName: null,
  fundFamily: null,
  sectorWeightings: [],
};
