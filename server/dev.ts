import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './app';

/**
 * Local dev API server. Vite proxies /api to this port (see vite.config.ts), so
 * the browser only ever talks to the Vite origin — no CORS in dev.
 */
const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API dev server on http://localhost:${info.port}`);
});
