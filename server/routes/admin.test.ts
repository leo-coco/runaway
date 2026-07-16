import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DrizzleOrm from 'drizzle-orm';
import { DEFAULT_TIER_CONFIG, type TierConfig } from '../../src/domain/entitlements.js';

/**
 * Drives the real admin handlers, the real admin gate (isAdmin) and the real
 * tier-config load/save from server/entitlements.ts against the in-memory fake
 * db. Only the session lookup is mocked.
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

const getSession = vi.fn();
vi.mock('../auth.js', () => ({ auth: { api: { getSession } } }));

const { adminRoutes } = await import('./admin.js');
const { fakeDb } = await import('../test/fakeDb.js');
const { user: userTable, tierConfig } = await import('../db/schema.js');

const admin = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
const regular = { id: 'user-1', email: 'user@example.com', role: 'user' };

const userRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'user-1',
  email: 'user@example.com',
  name: 'User One',
  emailVerified: true,
  image: null,
  language: 'en',
  taxResidence: 'US',
  role: 'user',
  tier: 'free',
  premiumUntil: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const putConfig = (body: unknown) =>
  adminRoutes.request('/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const patchUser = (id: string, body: unknown) =>
  adminRoutes.request(`/users/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  fakeDb.reset();
  getSession.mockReset();
  getSession.mockResolvedValue({ user: admin });
});

describe('admin gate', () => {
  it('401s without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await adminRoutes.request('/config');
    expect(res.status).toBe(401);
  });

  it.each([
    ['GET', '/config'],
    ['PUT', '/config'],
    ['GET', '/users'],
    ['PATCH', '/users/user-1'],
  ])('403s a non-admin on %s %s', async (method, path) => {
    getSession.mockResolvedValue({ user: regular });
    const res = await adminRoutes.request(path, { method });
    expect(res.status).toBe(403);
  });
});

describe('GET /config', () => {
  it('seeds and returns the default config when none is stored', async () => {
    const res = await adminRoutes.request('/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULT_TIER_CONFIG);
    // First read seeds the row so the admin editor always has one to update.
    expect(fakeDb.rows(tierConfig).map((r) => r.id)).toEqual(['default']);
  });

  it('backfills feature flags a stored row predates', async () => {
    const { realEstate: _dropped, ...olderFlags } = DEFAULT_TIER_CONFIG.free.features;
    const stored = {
      ...DEFAULT_TIER_CONFIG,
      free: { ...DEFAULT_TIER_CONFIG.free, features: olderFlags },
    };
    fakeDb.seed(tierConfig, [{ id: 'default', data: stored, updatedAt: new Date() }]);

    const res = await adminRoutes.request('/config');
    const body = (await res.json()) as TierConfig;
    expect(body.free.features).toEqual(DEFAULT_TIER_CONFIG.free.features);
  });
});

describe('PUT /config', () => {
  it('rejects an invalid config', async () => {
    const res = await putConfig({
      ...DEFAULT_TIER_CONFIG,
      pricing: { ...DEFAULT_TIER_CONFIG.pricing, annual: -5 },
    });
    expect(res.status).toBe(400);
  });

  it('persists and returns the new config', async () => {
    const next: TierConfig = {
      ...DEFAULT_TIER_CONFIG,
      pricing: { annual: 79, currency: 'EUR', introPrice: 29, introActive: false },
    };
    const res = await putConfig(next);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(next);

    // Stored, and served back on the next read.
    const read = await adminRoutes.request('/config');
    expect(((await read.json()) as TierConfig).pricing.annual).toBe(79);
  });
});

describe('GET /users', () => {
  it('lists users newest first with only the admin-relevant fields', async () => {
    fakeDb.seed(userTable, [
      userRow({ id: 'old', email: 'old@example.com', createdAt: new Date('2026-01-01') }),
      userRow({ id: 'new', email: 'new@example.com', createdAt: new Date('2026-06-01') }),
    ]);

    const res = await adminRoutes.request('/users');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body.map((u) => u.id)).toEqual(['new', 'old']);
    expect(Object.keys(body[0]!).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'premiumUntil',
      'role',
      'tier',
    ]);
  });
});

describe('PATCH /users/:id', () => {
  beforeEach(() => {
    fakeDb.seed(userTable, [userRow()]);
  });

  it('updates tier and role', async () => {
    const res = await patchUser('user-1', { tier: 'premium', role: 'admin' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'user-1', tier: 'premium', role: 'admin' });
    expect(fakeDb.rows(userTable)[0]).toMatchObject({ tier: 'premium', role: 'admin' });
  });

  it('grants premium until a date and can clear it again', async () => {
    const until = '2027-01-01T00:00:00.000Z';
    await patchUser('user-1', { premiumUntil: until });
    expect(fakeDb.rows(userTable)[0]!.premiumUntil).toEqual(new Date(until));

    await patchUser('user-1', { premiumUntil: null });
    expect(fakeDb.rows(userTable)[0]!.premiumUntil).toBeNull();
  });

  it('rejects an invalid patch', async () => {
    const res = await patchUser('user-1', { tier: 'gold' });
    expect(res.status).toBe(400);
    expect(fakeDb.rows(userTable)[0]!.tier).toBe('free');
  });

  it('404s on an unknown user', async () => {
    const res = await patchUser('nope', { tier: 'premium' });
    expect(res.status).toBe(404);
  });
});
