import { handle } from 'hono/vercel';
import app from '../server/app';

/**
 * Vercel entry: a single Edge function that catches every /api/* request and
 * hands it to the Hono app. Edge suits us — Neon HTTP + Better Auth are both
 * fetch/Web-Crypto based, no Node-only APIs.
 */
export const config = { runtime: 'edge' };

export default handle(app);
