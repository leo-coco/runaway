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

// Market-data proxy (keeps provider API keys server-side).
app.route('/api/market', marketRoutes);

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
