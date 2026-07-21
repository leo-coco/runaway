import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type * as DrizzleOrm from 'drizzle-orm';
import { DEFAULT_TIER_CONFIG } from '../../src/domain/entitlements.js';
import type { Entitlements } from '../../src/domain/entitlements.js';

/**
 * In-process API smoke: the critical journey a user relies on, driven through
 * the composed router (as `server/app.ts` wires it) against the in-memory fake
 * db. Not a substitute for the deployed Playwright smoke (`e2e/smoke.spec.ts`) —
 * this proves the handlers + routing + auth gate agree without needing a deploy,
 * so a broken journey fails CI before it can ship.
 *
 * Same mock seams as the route tests: real handlers, real owner-scoped `where`
 * clauses (fakeDb), with Better Auth, entitlements, crypto and live pricing
 * mocked at their module edges.
 */

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof DrizzleOrm>();
  const { fakeEq, fakeAnd, fakeDesc, fakeCount } = await import('./fakeDb.js');
  return { ...actual, eq: fakeEq, and: fakeAnd, desc: fakeDesc, count: fakeCount };
});

vi.mock('../db/client.js', async () => {
  const { fakeDb } = await import('./fakeDb.js');
  return { db: fakeDb.db };
});

const getSession = vi.fn();
vi.mock('../auth.js', () => ({ auth: { api: { getSession } } }));

const getEntitlements = vi.fn();
const loadTierConfig = vi.fn();
vi.mock('../entitlements.js', () => ({
  toAuthUser: (u: { id: string; email: string }) => ({ id: u.id, email: u.email }),
  getEntitlements,
  loadTierConfig,
}));

vi.mock('../crypto/dataCrypto.js', () => ({
  encrypt: (s: string) => ({ v: 1, kid: 'test', iv: '', ct: s, tag: '' }),
  encryptJson: (o: unknown) => ({ v: 1, kid: 'test', iv: '', ct: JSON.stringify(o), tag: '' }),
  decrypt: (e: { ct: string }) => e.ct,
  decryptJson: (e: { ct: string }) => JSON.parse(e.ct),
  isEnvelope: (x: unknown) => typeof x === 'object' && x !== null && (x as { v?: unknown }).v === 1,
}));

// Live Stripe pricing is a network edge; the entitlements route only decorates
// with it, so pass the resolved pricing straight through.
vi.mock('../billing/pricing.js', () => ({
  liveStripePricing: (p: unknown) => Promise.resolve(p),
}));

const { plansRoutes } = await import('../routes/plans.js');
const { entitlementsRoutes } = await import('../routes/entitlements.js');
const { fakeDb } = await import('./fakeDb.js');
const { plans } = await import('../db/schema.js');

/** Compose the same prefixes `server/app.ts` mounts for the smoke journey. */
const app = new Hono();
app.route('/api/plans', plansRoutes);
app.route('/api/entitlements', entitlementsRoutes);
app.get('/api/health', (c) => c.json({ ok: true }));

const USER_ID = 'smoke-user';
const UNLIMITED: Entitlements = {
  tier: 'premium',
  limits: { maxPlans: null, maxAssets: null, maxAccounts: null },
  features: {
    monteCarlo: true,
    withdrawalOrdering: true,
    accountsTax: true,
    phasedSpending: true,
    realEstate: true,
  },
  pricing: { annual: 69, currency: 'USD' },
};

const putPlan = (id: string, name: string) =>
  app.request(`/api/plans/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, schemaVersion: 1, data: { id, holdings: [], accounts: [] } }),
  });

beforeEach(() => {
  fakeDb.reset();
  getSession.mockReset();
  getEntitlements.mockReset();
  loadTierConfig.mockReset();
  getSession.mockResolvedValue({ user: { id: USER_ID, email: 'smoke@example.com' } });
  getEntitlements.mockResolvedValue(UNLIMITED);
  loadTierConfig.mockResolvedValue(DEFAULT_TIER_CONFIG);
});

describe('API smoke journey', () => {
  it('health check responds ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects the plans API without a session (auth gate)', async () => {
    getSession.mockResolvedValue(null);
    const res = await app.request('/api/plans');
    expect(res.status).toBe(401);
  });

  it('serves free entitlements to a guest before sign-in', async () => {
    getSession.mockResolvedValue(null);
    loadTierConfig.mockResolvedValue({
      ...DEFAULT_TIER_CONFIG,
      free: {
        ...DEFAULT_TIER_CONFIG.free,
        limits: { ...DEFAULT_TIER_CONFIG.free.limits, maxAccounts: 5 },
      },
    });
    const res = await app.request('/api/entitlements');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Entitlements;
    expect(body.tier).toBe('free');
    expect(body.limits.maxAccounts).toBe(5);
    expect(body.pricing).toBeDefined();
  });

  it('creates a plan, reloads it, lists it, then deletes it', async () => {
    // Create (save).
    const created = await putPlan('plan-smoke', 'My smoke plan');
    expect(created.status).toBe(200);
    expect(((await created.json()) as { name: string }).name).toBe('My smoke plan');

    // Reload (read back the persisted plan).
    const reloaded = await app.request('/api/plans/plan-smoke');
    expect(reloaded.status).toBe(200);
    const plan = (await reloaded.json()) as { id: string; name: string; data: { id: string } };
    expect(plan).toMatchObject({ id: 'plan-smoke', name: 'My smoke plan' });
    expect(plan.data.id).toBe('plan-smoke');

    // List (dashboard/sidebar load).
    const list = await app.request('/api/plans');
    expect(list.status).toBe(200);
    expect(((await list.json()) as { id: string }[]).map((p) => p.id)).toEqual(['plan-smoke']);

    // Delete.
    const removed = await app.request('/api/plans/plan-smoke', { method: 'DELETE' });
    expect(removed.status).toBe(204);
    expect(fakeDb.rows(plans)).toHaveLength(0);
  });

  it('persists an update to an existing plan (idempotent upsert)', async () => {
    await putPlan('plan-smoke', 'First name');
    const updated = await putPlan('plan-smoke', 'Renamed');
    expect(updated.status).toBe(200);

    const reloaded = await app.request('/api/plans/plan-smoke');
    expect(((await reloaded.json()) as { name: string }).name).toBe('Renamed');
    expect(fakeDb.rows(plans)).toHaveLength(1);
  });
});
