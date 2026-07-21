import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DEFAULT_TIER_CONFIG, resolveEntitlements } from '@/domain/entitlements';

/**
 * Shared msw server for tests that exercise the network boundary
 * (src/infrastructure/**). Lifecycle is wired in src/test/setup.ts.
 *
 * Only one default handler exists, for /api/entitlements: useEntitlements() is
 * called from nearly every rendered surface (App, Sidebar, ...), so without it
 * almost every component test would need its own server.use(...) just to avoid
 * an unhandled-request error unrelated to what the test actually checks. Every
 * other route has no default: tests declare the responses they need via
 * `server.use(...)`, and anything else unhandled fails the run (see setup.ts).
 */
const defaultEntitlementsHandler = http.get('/api/entitlements', () =>
  HttpResponse.json(resolveEntitlements(null, null, DEFAULT_TIER_CONFIG)),
);

export const server = setupServer(defaultEntitlementsHandler);
