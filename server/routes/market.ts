import { Hono } from 'hono';
import { serverEnv } from '../env.js';

/**
 * Market-data proxy. Keeps the Alpha Vantage and ExchangeRate-API keys
 * server-side (they used to be VITE_-prefixed and thus inlined into the client
 * bundle). The browser now talks only to same-origin /api/market/* endpoints.
 *
 * Endpoints are named by functional domain (equities, fx), not by provider, so
 * the upstream vendor can be swapped without changing the client contract.
 *
 * Each handler forwards the upstream JSON body verbatim and mirrors the upstream
 * status code, so the client's getJson (Zod validation + 429/http/parse error
 * handling) behaves exactly as before.
 */
export const marketRoutes = new Hono();

/** Pass an upstream response through untouched (body + status + JSON type). */
const passthrough = async (upstream: Response): Promise<Response> => {
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
};

const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

marketRoutes.get('/equities/search', async (c) => {
  const keywords = c.req.query('keywords') ?? '';
  const url = `${ALPHA_VANTAGE_BASE}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(
    keywords,
  )}&apikey=${serverEnv().ALPHA_VANTAGE_API_KEY}`;
  return passthrough(await fetch(url, { headers: { Accept: 'application/json' } }));
});

marketRoutes.get('/equities/quote', async (c) => {
  const symbol = c.req.query('symbol') ?? '';
  const url = `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    symbol,
  )}&apikey=${serverEnv().ALPHA_VANTAGE_API_KEY}`;
  return passthrough(await fetch(url, { headers: { Accept: 'application/json' } }));
});

marketRoutes.get('/fx/latest/:base', async (c) => {
  const base = c.req.param('base');
  const url = `https://v6.exchangerate-api.com/v6/${serverEnv().EXCHANGERATE_API_KEY}/latest/${encodeURIComponent(
    base,
  )}`;
  return passthrough(await fetch(url, { headers: { Accept: 'application/json' } }));
});
