import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DrizzleOrm from 'drizzle-orm';
import { DEFAULT_TIER_CONFIG, type TierConfig } from '../src/domain/entitlements.js';

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof DrizzleOrm>();
  const { fakeEq } = await import('./test/fakeDb.js');
  return { ...actual, eq: fakeEq };
});

vi.mock('./db/client.js', async () => {
  const { fakeDb } = await import('./test/fakeDb.js');
  return { db: fakeDb.db };
});

const { getEntitlements } = await import('./entitlements.js');
const { fakeDb } = await import('./test/fakeDb.js');
const { user: userTable, tierConfig } = await import('./db/schema.js');

const configWithFiveFreeAccounts: TierConfig = {
  ...DEFAULT_TIER_CONFIG,
  free: {
    ...DEFAULT_TIER_CONFIG.free,
    limits: { ...DEFAULT_TIER_CONFIG.free.limits, maxAccounts: 5 },
  },
};

beforeEach(() => {
  fakeDb.reset();
  fakeDb.seed(tierConfig, [
    { id: 'default', data: configWithFiveFreeAccounts, updatedAt: new Date() },
  ]);
});

describe('getEntitlements', () => {
  it('uses the live DB tier and configured Free limit instead of stale session Premium data', async () => {
    fakeDb.seed(userTable, [{ id: 'user-1', tier: 'free', premiumUntil: null }]);

    const entitlements = await getEntitlements({
      id: 'user-1',
      email: 'user@example.com',
      tier: 'premium',
      premiumUntil: null,
    });

    expect(entitlements.tier).toBe('free');
    expect(entitlements.limits.maxAccounts).toBe(5);
  });

  it('recognizes a live DB Premium upgrade even when the session still says Free', async () => {
    fakeDb.seed(userTable, [{ id: 'user-1', tier: 'premium', premiumUntil: null }]);

    const entitlements = await getEntitlements({
      id: 'user-1',
      email: 'user@example.com',
      tier: 'free',
      premiumUntil: null,
    });

    expect(entitlements.tier).toBe('premium');
    expect(entitlements.limits.maxAccounts).toBeNull();
  });

  it('fails closed as Free when an authenticated session has no user row', async () => {
    const entitlements = await getEntitlements({
      id: 'deleted-user',
      email: 'deleted@example.com',
      tier: 'premium',
      premiumUntil: null,
    });

    expect(entitlements.tier).toBe('free');
    expect(entitlements.limits.maxAccounts).toBe(5);
  });
});
