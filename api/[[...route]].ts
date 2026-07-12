import { handle } from 'hono/vercel';
import app from '../server/app.js';

/**
 * Vercel entry: a single Node.js serverless function that catches every
 * /api/* request and hands it to the Hono app. Node runtime is required
 * because Better Auth's drizzle adapter pulls in modules the Edge runtime
 * doesn't support (see @better-auth/core/db/adapter and friends).
 *
 * We export the Web-standard `fetch` handler (not `export default handle(app)`):
 * on the Node runtime Vercel treats a bare default export as a Node
 * `(req, res) => void` handler and ignores any returned Response, so a
 * fetch-style handler that *returns* a Response would hang until timeout.
 * The `{ fetch }` shape is the documented way to serve every HTTP method from
 * one function (https://vercel.com/docs/functions/functions-api-reference).
 */
export const config = { runtime: 'nodejs' };

export default { fetch: handle(app) };
