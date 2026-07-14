import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entitlements, TierLimits } from '../../src/domain/entitlements.js';

/**
 * Drives the real Hono `PUT /:id` handler so the actual 403 wiring and the
 * growth-only cap comparisons are exercised. Only the three impure edges are
 * mocked: the Drizzle client, Better Auth's session lookup, and the server
 * `getEntitlements` resolver. The real `atLimit` from the domain model runs.
 */

// --- db mock: each select().from().where() resolves the next queued value. ---
// Within one PUT the handler queries in a fixed order: existing-plan lookup,
// then (only when creating) the plan count.
const selectWhere = vi.fn();
const insertReturning = vi.fn();
vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => ({ returning: insertReturning }) }),
    }),
  },
}));

// --- auth mock: a valid session for a fixed user. ---
const getSession = vi.fn();
vi.mock('../auth.js', () => ({ auth: { api: { getSession } } }));

// --- entitlements mock: toAuthUser passthrough; getEntitlements is set per test. ---
const getEntitlements = vi.fn();
vi.mock('../entitlements.js', () => ({
  toAuthUser: (u: { id: string; email: string }) => ({ id: u.id, email: u.email }),
  getEntitlements,
}));

// --- crypto mock: passthrough envelopes so the handler runs without a real key.
// Encryption itself is covered in server/crypto/dataCrypto.test.ts.
vi.mock('../crypto/dataCrypto.js', () => ({
  encrypt: (s: string) => ({ v: 1, kid: 'test', iv: '', ct: s, tag: '' }),
  encryptJson: (o: unknown) => ({ v: 1, kid: 'test', iv: '', ct: JSON.stringify(o), tag: '' }),
  decrypt: (e: { ct: string }) => e.ct,
  decryptJson: (e: { ct: string }) => JSON.parse(e.ct),
  isEnvelope: (x: unknown) => typeof x === 'object' && x !== null && (x as { v?: unknown }).v === 1,
}));

// Imported after vi.mock so the mocks are wired in.
const { plansRoutes } = await import('./plans.js');

const USER_ID = 'user-1';

const ent = (limits: TierLimits): Entitlements => ({
  tier: limits.maxPlans === null ? 'premium' : 'free',
  limits,
  features: {
    monteCarlo: false,
    withdrawalOrdering: false,
    taxOptimization: false,
    multiAccount: false,
    phasedSpending: false,
    realEstate: false,
  },
  pricing: { annual: 59, currency: 'USD', introPrice: 20, introActive: true },
});

const FREE_LIMITS: TierLimits = { maxPlans: 1, maxAssets: 2, maxAccounts: 1 };

/** A stored plan row as Drizzle would return it. */
const storedRow = (over: { holdings?: unknown[]; accounts?: unknown[] } = {}) => ({
  id: 'plan-1',
  userId: USER_ID,
  name: 'Existing',
  schemaVersion: 1,
  data: { id: 'plan-1', holdings: over.holdings ?? [], accounts: over.accounts ?? [] },
  createdAt: new Date(),
  updatedAt: new Date(),
});

/** Fire the PUT with a body of the given holdings/accounts counts. */
const putPlan = (id: string, holdings: unknown[] = [], accounts: unknown[] = []) =>
  plansRoutes.request(`/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'My Plan',
      schemaVersion: 1,
      data: { id, holdings, accounts },
    }),
  });

const asset = (i: number) => ({ id: `h${i}` });

beforeEach(() => {
  selectWhere.mockReset();
  insertReturning.mockReset();
  getSession.mockReset();
  getEntitlements.mockReset();
  getSession.mockResolvedValue({ user: { id: USER_ID, email: 'u@example.com' } });
  getEntitlements.mockResolvedValue(ent(FREE_LIMITS));
  // Default: the upsert returns a row so the happy path can respond.
  insertReturning.mockResolvedValue([storedRow()]);
});

describe('PUT /:id tier enforcement', () => {
  it('401s without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await putPlan('plan-1');
    expect(res.status).toBe(401);
  });

  it('blocks creating a new plan when already at the plan limit', async () => {
    selectWhere
      .mockResolvedValueOnce([]) // existing lookup: none (this is a create)
      .mockResolvedValueOnce([{ n: 1 }]); // count: already at maxPlans = 1
    const res = await putPlan('plan-2');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'limit', limit: 'plans', max: 1 });
    expect(insertReturning).not.toHaveBeenCalled();
  });

  it('allows creating a new plan when under the plan limit', async () => {
    selectWhere
      .mockResolvedValueOnce([]) // no existing row
      .mockResolvedValueOnce([{ n: 0 }]); // count under the limit
    const res = await putPlan('plan-1');
    expect(res.status).toBe(200);
    expect(insertReturning).toHaveBeenCalledOnce();
  });

  it('blocks a create whose asset count exceeds the cap', async () => {
    selectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 0 }]);
    const res = await putPlan('plan-1', [asset(1), asset(2), asset(3)]); // 3 > maxAssets 2
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'limit', limit: 'assets', max: 2 });
  });

  it('blocks a create whose account count exceeds the cap', async () => {
    selectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 0 }]);
    const res = await putPlan('plan-1', [], [{ id: 'a1' }, { id: 'a2' }]); // 2 > maxAccounts 1
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'limit', limit: 'accounts', max: 1 });
  });

  it('lets a lapsed-premium user re-save an existing over-cap plan (growth-only)', async () => {
    // Existing plan already has 5 assets / 3 accounts (built while premium).
    const existing = storedRow({
      holdings: [asset(1), asset(2), asset(3), asset(4), asset(5)],
      accounts: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    });
    selectWhere.mockResolvedValueOnce([existing]); // update path: no count query
    // Save the SAME shape: over cap but not growing -> allowed, no data loss.
    const res = await putPlan(
      'plan-1',
      [asset(1), asset(2), asset(3), asset(4), asset(5)],
      [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    );
    expect(res.status).toBe(200);
    expect(insertReturning).toHaveBeenCalledOnce();
  });

  it('blocks growing an existing over-cap plan even further', async () => {
    const existing = storedRow({ holdings: [asset(1), asset(2), asset(3)] }); // 3 assets
    selectWhere.mockResolvedValueOnce([existing]);
    const res = await putPlan('plan-1', [asset(1), asset(2), asset(3), asset(4)]); // grows 3 -> 4
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'limit', limit: 'assets' });
  });

  it('never blocks a premium user (unlimited limits)', async () => {
    getEntitlements.mockResolvedValue(ent({ maxPlans: null, maxAssets: null, maxAccounts: null }));
    selectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 50 }]);
    const res = await putPlan(
      'plan-1',
      Array.from({ length: 20 }, (_, i) => asset(i)),
      [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    );
    expect(res.status).toBe(200);
    expect(insertReturning).toHaveBeenCalledOnce();
  });
});
