import { Hono } from 'hono';
import { auth } from './auth.js';
import { plansRoutes } from './routes/plans.js';
import { marketRoutes } from './routes/market.js';
import { entitlementsRoutes } from './routes/entitlements.js';
import { adminRoutes } from './routes/admin.js';

/** The single Hono app, shared by the Vercel function and the local dev server. */
export const app = new Hono();

// Better Auth owns everything under /api/auth/*.
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Application API.
app.route('/api/plans', plansRoutes);

// Freemium: caller's effective entitlements (guests get free defaults).
app.route('/api/entitlements', entitlementsRoutes);

// Admin: tier config + manual tier grants (admin-gated inside).
app.route('/api/admin', adminRoutes);

// Market-data proxy (keeps provider API keys server-side).
app.route('/api/market', marketRoutes);

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
