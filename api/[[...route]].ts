import { handle } from 'hono/vercel';
import app from '../server/app';

/**
 * Vercel entry: a single Node.js serverless function that catches every
 * /api/* request and hands it to the Hono app. Node runtime is required
 * because Better Auth's drizzle adapter pulls in modules the Edge runtime
 * doesn't support (see @better-auth/core/db/adapter and friends).
 */
export const config = { runtime: 'nodejs' };

export default handle(app);
