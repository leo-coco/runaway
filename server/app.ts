import { Hono } from 'hono';
import { auth } from './auth';
import { plansRoutes } from './routes/plans';

/** The single Hono app, shared by the Vercel function and the local dev server. */
export const app = new Hono();

// Better Auth owns everything under /api/auth/*.
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Application API.
app.route('/api/plans', plansRoutes);

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
