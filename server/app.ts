import { Hono } from 'hono';
import { auth } from './auth.js';
import { plansRoutes } from './routes/plans.js';
import { marketRoutes } from './routes/market.js';

/** The single Hono app, shared by the Vercel function and the local dev server. */
export const app = new Hono();

// Better Auth owns everything under /api/auth/*.
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Application API.
app.route('/api/plans', plansRoutes);

// Cached, server-side proxy for market data (FX + Alpha Vantage). Public: the
// data is not user-specific and keeps provider keys off the client.
app.route('/api/market', marketRoutes);

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
