import { Hono } from 'hono';
import { auth } from '../auth.js';
import { getEntitlements, loadTierConfig, toAuthUser } from '../entitlements.js';
import { resolveEntitlements } from '../../src/domain/entitlements.js';

/**
 * Public entitlements endpoint. Returns the caller's effective limits/features and
 * the live pricing. Works for guests too (free defaults) so the client can render
 * paywalls/pricing before sign-in. No session gate.
 */
export const entitlementsRoutes = new Hono();

entitlementsRoutes.get('/', async (c) => {
  const res = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!res?.user) {
    const config = await loadTierConfig();
    return c.json(resolveEntitlements(null, null, config));
  }
  return c.json(await getEntitlements(toAuthUser(res.user)));
});
