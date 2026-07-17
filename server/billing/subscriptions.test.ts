import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type * as DrizzleOrm from 'drizzle-orm';

/**
 * Unit-tests the Stripe→DB mapping (subscription status/period → tier/premiumUntil)
 * and the Checkout price selection, against the in-memory fake db. The Stripe client is
 * mocked; only customer creation touches it.
 */

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
process.env.STRIPE_PRICE_ID = 'price_regular';

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof DrizzleOrm>();
  const { fakeEq, fakeAnd, fakeDesc, fakeCount } = await import('../test/fakeDb.js');
  return { ...actual, eq: fakeEq, and: fakeAnd, desc: fakeDesc, count: fakeCount };
});

vi.mock('../db/client.js', async () => {
  const { fakeDb } = await import('../test/fakeDb.js');
  return { db: fakeDb.db };
});

const customersCreate = vi.fn();
vi.mock('./stripe.js', () => ({ stripe: () => ({ customers: { create: customersCreate } }) }));

const { applySubscriptionState, priceIdForCheckout, getOrCreateCustomer, findUserIdByCustomer } =
  await import('./subscriptions.js');
const { fakeDb } = await import('../test/fakeDb.js');
const { user: userTable } = await import('../db/schema.js');

const PERIOD_END = 1893456000; // 2030-01-01T00:00:00Z, Unix seconds.

const makeSub = (over: Partial<Stripe.Subscription> = {}): Stripe.Subscription =>
  ({
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    metadata: {},
    items: { data: [{ current_period_end: PERIOD_END }] },
    ...over,
  }) as unknown as Stripe.Subscription;

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'user@example.com',
  name: 'User One',
  tier: 'free',
  premiumUntil: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  ...over,
});

beforeEach(() => {
  fakeDb.reset();
  customersCreate.mockReset();
  fakeDb.seed(userTable, [userRow()]);
});

describe('applySubscriptionState', () => {
  it.each(['active', 'trialing'] as const)('grants premium while %s', async (status) => {
    await applySubscriptionState('user-1', makeSub({ status }));
    const row = fakeDb.rows(userTable)[0]!;
    expect(row.tier).toBe('premium');
    expect(row.premiumUntil).toEqual(new Date(PERIOD_END * 1000));
    expect(row.stripeSubscriptionId).toBe('sub_1');
    expect(row.stripeCustomerId).toBe('cus_1');
  });

  it.each(['canceled', 'unpaid', 'past_due', 'incomplete_expired'] as const)(
    'lapses to free when %s',
    async (status) => {
      fakeDb.seed(userTable, [
        userRow({ tier: 'premium', premiumUntil: new Date(PERIOD_END * 1000) }),
      ]);
      await applySubscriptionState('user-1', makeSub({ status }));
      const row = fakeDb.rows(userTable)[0]!;
      expect(row.tier).toBe('free');
      expect(row.premiumUntil).toBeNull();
    },
  );

  it('reads the period end off the customer (bare id) subscription', async () => {
    await applySubscriptionState('user-1', makeSub({ customer: 'cus_9' }));
    expect(fakeDb.rows(userTable)[0]!.stripeCustomerId).toBe('cus_9');
  });
});

describe('priceIdForCheckout', () => {
  it('uses the regular price; Stripe applies any promotion code separately', () => {
    expect(priceIdForCheckout()).toBe('price_regular');
  });
});

describe('getOrCreateCustomer', () => {
  it('creates and persists a customer when none is stored', async () => {
    customersCreate.mockResolvedValue({ id: 'cus_new' });
    const id = await getOrCreateCustomer({ id: 'user-1', email: 'user@example.com' });
    expect(id).toBe('cus_new');
    expect(customersCreate).toHaveBeenCalledWith({
      email: 'user@example.com',
      metadata: { userId: 'user-1' },
    });
    expect(fakeDb.rows(userTable)[0]!.stripeCustomerId).toBe('cus_new');
  });

  it('reuses an existing customer without calling Stripe', async () => {
    fakeDb.seed(userTable, [userRow({ stripeCustomerId: 'cus_existing' })]);
    const id = await getOrCreateCustomer({ id: 'user-1', email: 'user@example.com' });
    expect(id).toBe('cus_existing');
    expect(customersCreate).not.toHaveBeenCalled();
  });
});

describe('findUserIdByCustomer', () => {
  it('resolves the user linked to a customer id', async () => {
    fakeDb.seed(userTable, [userRow({ stripeCustomerId: 'cus_1' })]);
    expect(await findUserIdByCustomer('cus_1')).toBe('user-1');
    expect(await findUserIdByCustomer('cus_missing')).toBeNull();
  });
});
