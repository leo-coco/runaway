import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type * as DrizzleOrm from 'drizzle-orm';

/**
 * Drives the real billing handlers (checkout, portal, webhook) and the real
 * Stripe→DB helpers against the in-memory fake db. The Stripe SDK, the session
 * lookup and serverEnv are mocked; billing env is set via process.env so the
 * real billing/env.ts validates.
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

const getSession = vi.fn();
vi.mock('../auth.js', () => ({ auth: { api: { getSession } } }));

vi.mock('../env.js', () => ({ serverEnv: () => ({ BETTER_AUTH_URL: 'http://localhost:5173' }) }));

const stripeMock = {
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
  webhooks: { constructEventAsync: vi.fn() },
};
vi.mock('../billing/stripe.js', () => ({ stripe: () => stripeMock }));

const { billingRoutes } = await import('./billing.js');
const { fakeDb } = await import('../test/fakeDb.js');
const { user: userTable } = await import('../db/schema.js');

const PERIOD_END = 1893456000; // 2030-01-01T00:00:00Z, Unix seconds.

const session = { id: 'user-1', email: 'user@example.com', role: 'user', tier: 'free' };

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

const makeSub = (over: Partial<Stripe.Subscription> = {}): Stripe.Subscription =>
  ({
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    metadata: { userId: 'user-1' },
    items: { data: [{ current_period_end: PERIOD_END }] },
    ...over,
  }) as unknown as Stripe.Subscription;

const post = (path: string, opts: { body?: string; headers?: Record<string, string> } = {}) =>
  billingRoutes.request(path, {
    method: 'POST',
    headers: opts.headers,
    body: opts.body,
  });

beforeEach(() => {
  fakeDb.reset();
  getSession.mockReset().mockResolvedValue({ user: session });
  stripeMock.customers.create.mockReset();
  stripeMock.checkout.sessions.create.mockReset();
  stripeMock.billingPortal.sessions.create.mockReset();
  stripeMock.subscriptions.retrieve.mockReset();
  stripeMock.webhooks.constructEventAsync.mockReset();
  fakeDb.seed(userTable, [userRow()]);
});

describe('POST /checkout', () => {
  it('401s without a session', async () => {
    getSession.mockResolvedValue(null);
    expect((await post('/checkout')).status).toBe(401);
  });

  it('503s when billing is unconfigured', async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      expect((await post('/checkout')).status).toBe(503);
    } finally {
      process.env.STRIPE_SECRET_KEY = saved;
    }
  });

  it('creates a customer when absent and returns the checkout url', async () => {
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe/x' });

    const res = await post('/checkout');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe/x' });
    expect(stripeMock.customers.create).toHaveBeenCalledOnce();
    expect(fakeDb.rows(userTable)[0]!.stripeCustomerId).toBe('cus_new');

    const arg = stripeMock.checkout.sessions.create.mock.calls[0]![0];
    expect(arg.line_items[0].price).toBe('price_regular');
    expect(arg.allow_promotion_codes).toBe(true);
    expect(arg.metadata).toEqual({ userId: 'user-1' });
    expect(arg.success_url).toBe('http://localhost:5173/fr/app?checkout=success');
    expect(arg.cancel_url).toBe('http://localhost:5173/fr/app?checkout=cancel');
  });

  it('returns the customer to the English app route when checkout specifies English', async () => {
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe/x' });

    await post('/checkout', {
      body: JSON.stringify({ locale: 'en' }),
      headers: { 'content-type': 'application/json' },
    });

    const arg = stripeMock.checkout.sessions.create.mock.calls[0]![0];
    expect(arg.success_url).toBe('http://localhost:5173/en/app?checkout=success');
  });

  it('reuses an existing customer', async () => {
    fakeDb.seed(userTable, [userRow({ stripeCustomerId: 'cus_existing' })]);
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe/x' });

    await post('/checkout');
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create.mock.calls[0]![0].customer).toBe('cus_existing');
  });
});

describe('POST /portal', () => {
  it('400s without a stored customer', async () => {
    expect((await post('/portal')).status).toBe(400);
  });

  it('returns the portal url for a customer', async () => {
    fakeDb.seed(userTable, [userRow({ stripeCustomerId: 'cus_1' })]);
    stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: 'https://portal.stripe/x' });

    const res = await post('/portal');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://portal.stripe/x' });
    expect(stripeMock.billingPortal.sessions.create.mock.calls[0]![0].customer).toBe('cus_1');
  });
});

describe('POST /webhook', () => {
  const send = (event?: Stripe.Event) => {
    if (event) stripeMock.webhooks.constructEventAsync.mockResolvedValue(event);
    return post('/webhook', { body: '{}', headers: { 'stripe-signature': 'sig' } });
  };

  it('400s a missing signature', async () => {
    expect((await post('/webhook', { body: '{}' })).status).toBe(400);
  });

  it('400s an invalid signature', async () => {
    stripeMock.webhooks.constructEventAsync.mockRejectedValue(new Error('bad sig'));
    expect((await send()).status).toBe(400);
  });

  it('grants premium on checkout.session.completed', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub());
    const res = await send({
      type: 'checkout.session.completed',
      data: { object: { metadata: { userId: 'user-1' }, subscription: 'sub_1' } },
    } as unknown as Stripe.Event);

    expect(res.status).toBe(200);
    const row = fakeDb.rows(userTable)[0]!;
    expect(row.tier).toBe('premium');
    expect(row.premiumUntil).toEqual(new Date(PERIOD_END * 1000));
  });

  it('grants premium on customer.subscription.updated', async () => {
    await send({
      type: 'customer.subscription.updated',
      data: { object: makeSub() },
    } as unknown as Stripe.Event);
    expect(fakeDb.rows(userTable)[0]!.tier).toBe('premium');
  });

  it('downgrades on customer.subscription.deleted', async () => {
    fakeDb.seed(userTable, [
      userRow({ tier: 'premium', premiumUntil: new Date(PERIOD_END * 1000) }),
    ]);
    await send({
      type: 'customer.subscription.deleted',
      data: { object: makeSub({ status: 'canceled' }) },
    } as unknown as Stripe.Event);

    const row = fakeDb.rows(userTable)[0]!;
    expect(row.tier).toBe('free');
    expect(row.premiumUntil).toBeNull();
  });

  it('resolves the user by customer id when metadata is absent', async () => {
    fakeDb.seed(userTable, [userRow({ stripeCustomerId: 'cus_1' })]);
    await send({
      type: 'customer.subscription.updated',
      data: { object: makeSub({ metadata: {} }) },
    } as unknown as Stripe.Event);
    expect(fakeDb.rows(userTable)[0]!.tier).toBe('premium');
  });

  it('ignores unrelated event types', async () => {
    const res = await send({
      type: 'payment_intent.succeeded',
      data: { object: {} },
    } as unknown as Stripe.Event);
    expect(res.status).toBe(200);
    expect(fakeDb.rows(userTable)[0]!.tier).toBe('free');
  });
});
