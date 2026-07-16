import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DrizzleOrm from 'drizzle-orm';
import type { Entitlements, TierLimits } from '../../src/domain/entitlements.js';

/**
 * Drives the real Hono handlers so the 403 wiring, the growth-only cap
 * comparisons and the owner-scoped SQL conditions are exercised. The db is an
 * in-memory fake (server/test/fakeDb.ts) that evaluates the routes' actual
 * `where` clauses, so cross-user isolation is tested for real. The other
 * impure edges are mocked: Better Auth's session lookup and the server
 * `getEntitlements` resolver. The real `atLimit` from the domain model runs.
 */

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof DrizzleOrm>();
  const { fakeEq, fakeAnd, fakeDesc, fakeCount } = await import('../test/fakeDb.js');
  return { ...actual, eq: fakeEq, and: fakeAnd, desc: fakeDesc, count: fakeCount };
});

vi.mock('../db/client.js', async () => {
  const { fakeDb } = await import('../test/fakeDb.js');
  return { db: fakeDb.db };
});

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
const { fakeDb } = await import('../test/fakeDb.js');
const { plans } = await import('../db/schema.js');

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

const ent = (limits: TierLimits): Entitlements => ({
  tier: limits.maxPlans === null ? 'premium' : 'free',
  limits,
  features: {
    monteCarlo: false,
    withdrawalOrdering: false,
    accountsTax: false,
    phasedSpending: false,
    realEstate: false,
  },
  pricing: { annual: 59, currency: 'USD', introPrice: 20, introActive: true },
});

const FREE_LIMITS: TierLimits = { maxPlans: 1, maxAssets: 2, maxAccounts: 1 };

const envelope = (s: string) => ({ v: 1, kid: 'test', iv: '', ct: s, tag: '' });

/** A stored, encrypted plan row as the PUT handler would have written it. */
const storedRow = (
  over: {
    id?: string;
    userId?: string;
    name?: string;
    holdings?: unknown[];
    accounts?: unknown[];
    updatedAt?: Date;
  } = {},
) => {
  const id = over.id ?? 'plan-1';
  return {
    id,
    userId: over.userId ?? USER_ID,
    name: JSON.stringify(envelope(over.name ?? 'Existing')),
    schemaVersion: 1,
    data: envelope(
      JSON.stringify({ id, holdings: over.holdings ?? [], accounts: over.accounts ?? [] }),
    ),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: over.updatedAt ?? new Date('2026-01-02T00:00:00Z'),
  };
};

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
  fakeDb.reset();
  getSession.mockReset();
  getEntitlements.mockReset();
  getSession.mockResolvedValue({ user: { id: USER_ID, email: 'u@example.com' } });
  getEntitlements.mockResolvedValue(ent(FREE_LIMITS));
});

describe('authentication', () => {
  it.each(['GET', 'PUT', 'DELETE'] as const)('%s requires a session', async (method) => {
    getSession.mockResolvedValue(null);
    const res =
      method === 'GET'
        ? await plansRoutes.request('/')
        : method === 'PUT'
          ? await putPlan('plan-1')
          : await plansRoutes.request('/plan-1', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

describe('cross-user isolation', () => {
  beforeEach(() => {
    fakeDb.seed(plans, [
      storedRow({ id: 'mine', name: 'Mine' }),
      storedRow({ id: 'theirs', userId: OTHER_USER_ID, name: 'Theirs' }),
    ]);
  });

  it('GET / lists only the caller’s plans, decrypted', async () => {
    const res = await plansRoutes.request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string; data: { id: string } }[];
    expect(body.map((p) => p.id)).toEqual(['mine']);
    expect(body[0]!.name).toBe('Mine');
    expect(body[0]!.data.id).toBe('mine');
  });

  it('GET / orders plans by most recently updated first', async () => {
    fakeDb.seed(plans, [
      storedRow({ id: 'old', updatedAt: new Date('2026-01-01T00:00:00Z') }),
      storedRow({ id: 'new', updatedAt: new Date('2026-06-01T00:00:00Z') }),
    ]);
    const res = await plansRoutes.request('/');
    const body = (await res.json()) as { id: string }[];
    expect(body.map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('GET /:id returns the caller’s plan but 404s on someone else’s', async () => {
    const own = await plansRoutes.request('/mine');
    expect(own.status).toBe(200);
    expect(((await own.json()) as { name: string }).name).toBe('Mine');

    const foreign = await plansRoutes.request('/theirs');
    expect(foreign.status).toBe(404);
  });

  it('DELETE /:id removes the caller’s plan only', async () => {
    const res = await plansRoutes.request('/mine', { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(fakeDb.rows(plans).map((r) => r.id)).toEqual(['theirs']);
  });

  it('DELETE /:id on someone else’s plan is a no-op', async () => {
    const res = await plansRoutes.request('/theirs', { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(fakeDb.rows(plans).map((r) => r.id)).toContain('theirs');
  });

  it('PUT on someone else’s plan id cannot overwrite their row (409)', async () => {
    // Unlimited caps so the request reaches the insert instead of 403ing on the
    // plan limit — the point here is the owner-scoped conflict clause.
    getEntitlements.mockResolvedValue(ent({ maxPlans: null, maxAssets: null, maxAccounts: null }));
    const before = fakeDb.rows(plans).find((r) => r.id === 'theirs');
    const res = await putPlan('theirs');
    expect(res.status).toBe(409);
    expect(fakeDb.rows(plans).find((r) => r.id === 'theirs')).toEqual(before);
  });
});

describe('PUT validation', () => {
  it('rejects a malformed body', async () => {
    const res = await plansRoutes.request('/plan-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, data: { id: 'plan-1' } }), // no name
    });
    expect(res.status).toBe(400);
  });

  it('rejects a body whose plan id differs from the URL', async () => {
    const res = await plansRoutes.request('/plan-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', schemaVersion: 1, data: { id: 'plan-2' } }),
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT storage', () => {
  it('creates a plan encrypted at rest and responds with the decrypted row', async () => {
    const res = await putPlan('plan-1', [asset(1)]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; data: { id: string } };
    expect(body.name).toBe('My Plan');
    expect(body.data.id).toBe('plan-1');

    const [row] = fakeDb.rows(plans);
    // Name is a stringified envelope, data an envelope object — never plaintext.
    expect(JSON.parse(row!.name as string)).toMatchObject({ v: 1, ct: 'My Plan' });
    expect(row!.data).toMatchObject({ v: 1 });
  });

  it('still reads legacy plaintext rows written before encryption', async () => {
    fakeDb.seed(plans, [
      {
        id: 'legacy',
        userId: USER_ID,
        name: 'Legacy name',
        schemaVersion: 1,
        data: { id: 'legacy', holdings: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await plansRoutes.request('/legacy');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; data: { id: string } };
    expect(body.name).toBe('Legacy name');
    expect(body.data.id).toBe('legacy');
  });
});

describe('PUT tier enforcement', () => {
  it('blocks creating a new plan when already at the plan limit', async () => {
    fakeDb.seed(plans, [storedRow({ id: 'plan-1' })]); // already at maxPlans = 1
    const res = await putPlan('plan-2');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'limit', limit: 'plans', max: 1 });
    expect(fakeDb.rows(plans).map((r) => r.id)).toEqual(['plan-1']);
  });

  it('allows creating a new plan when under the plan limit', async () => {
    const res = await putPlan('plan-1');
    expect(res.status).toBe(200);
    expect(fakeDb.rows(plans)).toHaveLength(1);
  });

  it('the plan cap counts only the caller’s plans, not other users’', async () => {
    fakeDb.seed(plans, [storedRow({ id: 'theirs', userId: OTHER_USER_ID })]);
    const res = await putPlan('plan-1');
    expect(res.status).toBe(200);
  });

  it('blocks a create whose asset count exceeds the cap', async () => {
    const res = await putPlan('plan-1', [asset(1), asset(2), asset(3)]); // 3 > maxAssets 2
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'limit', limit: 'assets', max: 2 });
  });

  it('blocks a create whose account count exceeds the cap', async () => {
    const res = await putPlan('plan-1', [], [{ id: 'a1' }, { id: 'a2' }]); // 2 > maxAccounts 1
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'limit', limit: 'accounts', max: 1 });
  });

  it('lets a lapsed-premium user re-save an existing over-cap plan (growth-only)', async () => {
    // Existing plan already has 5 assets / 3 accounts (built while premium).
    fakeDb.seed(plans, [
      storedRow({
        holdings: [asset(1), asset(2), asset(3), asset(4), asset(5)],
        accounts: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
      }),
    ]);
    // Save the SAME shape: over cap but not growing -> allowed, no data loss.
    const res = await putPlan(
      'plan-1',
      [asset(1), asset(2), asset(3), asset(4), asset(5)],
      [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    );
    expect(res.status).toBe(200);
  });

  it('blocks growing an existing over-cap plan even further', async () => {
    fakeDb.seed(plans, [storedRow({ holdings: [asset(1), asset(2), asset(3)] })]); // 3 assets
    const res = await putPlan('plan-1', [asset(1), asset(2), asset(3), asset(4)]); // grows 3 -> 4
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'limit', limit: 'assets' });
  });

  it('never blocks a premium user (unlimited limits)', async () => {
    getEntitlements.mockResolvedValue(ent({ maxPlans: null, maxAssets: null, maxAccounts: null }));
    fakeDb.seed(
      plans,
      Array.from({ length: 50 }, (_, i) => storedRow({ id: `p${i}` })),
    );
    const res = await putPlan(
      'plan-new',
      Array.from({ length: 20 }, (_, i) => asset(i)),
      [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    );
    expect(res.status).toBe(200);
  });
});
