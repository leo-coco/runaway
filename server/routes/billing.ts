import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '../db/client.js';
import { user as userTable } from '../db/schema.js';
import { auth } from '../auth.js';
import { serverEnv } from '../env.js';
import { toAuthUser, type AuthUser } from '../entitlements.js';
import { isBillingConfigured, billingEnv } from '../billing/env.js';
import { stripe } from '../billing/stripe.js';
import {
  applySubscriptionState,
  customerIdOf,
  findUserIdByCustomer,
  getOrCreateCustomer,
  priceIdForCheckout,
} from '../billing/subscriptions.js';

type Vars = { user: AuthUser };

export const billingRoutes = new Hono<{ Variables: Vars }>();

/** Require a valid session. Applied to the user-facing endpoints, never the webhook. */
const requireSession: MiddlewareHandler<{ Variables: Vars }> = async (c, next) => {
  if (!isBillingConfigured()) return c.json({ error: 'Billing not configured' }, 503);
  const res = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!res?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', toAuthUser(res.user));
  await next();
};

billingRoutes.use('/checkout', requireSession);
billingRoutes.use('/portal', requireSession);

/** Where Stripe returns the user after checkout/portal. The query marker lets the
 * client invalidate its cached entitlements on landing. */
const appUrl = (path: string) => new URL(path, serverEnv().BETTER_AUTH_URL).toString();

/** The SPA is served below a locale-aware Astro route. Only accept the two
 * supported locales rather than trusting an arbitrary redirect path from the client. */
const accountPath = (locale: unknown): string => `/${locale === 'en' ? 'en' : 'fr'}/app/account`;

const appPath = (locale: unknown): string => `/${locale === 'en' ? 'en' : 'fr'}/app`;

const checkoutLocale = async (c: { req: { json: () => Promise<unknown> } }): Promise<unknown> => {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? (body as { locale?: unknown }).locale : undefined;
  } catch {
    return undefined;
  }
};

// Start a subscription: create/reuse the customer, open a Checkout Session.
billingRoutes.post('/checkout', async (c) => {
  const user = c.get('user');
  const customerId = await getOrCreateCustomer({ id: user.id, email: user.email });
  const locale = await checkoutLocale(c);
  const path = appPath(locale);

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceIdForCheckout(), quantity: 1 }],
    allow_promotion_codes: true,
    // Carried onto the subscription so its lifecycle events map back to the user
    // without a customer lookup.
    subscription_data: { metadata: { userId: user.id } },
    metadata: { userId: user.id },
    success_url: appUrl(`${path}?checkout=success`),
    cancel_url: appUrl(`${path}?checkout=cancel`),
  });

  if (!session.url) return c.json({ error: 'Checkout unavailable' }, 502);
  return c.json({ url: session.url });
});

// Open the Stripe-hosted billing portal to manage/cancel the subscription.
billingRoutes.post('/portal', async (c) => {
  const user = c.get('user');
  const path = accountPath(await checkoutLocale(c));
  const [row] = await db
    .select({ stripeCustomerId: userTable.stripeCustomerId })
    .from(userTable)
    .where(eq(userTable.id, user.id));
  if (!row?.stripeCustomerId) return c.json({ error: 'No subscription' }, 400);

  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: appUrl(path),
  });
  return c.json({ url: session.url });
});

/** Map a subscription event back to the app user (metadata first, then customer). */
const userIdForSubscription = async (sub: Stripe.Subscription): Promise<string | null> => {
  const fromMeta = sub.metadata?.userId;
  if (fromMeta) return fromMeta;
  return findUserIdByCustomer(customerIdOf(sub));
};

// Stripe webhook: the authoritative writer of tier/premiumUntil. Unauthenticated;
// trust comes from the signature over the raw body.
billingRoutes.post('/webhook', async (c) => {
  if (!isBillingConfigured()) return c.json({ error: 'Billing not configured' }, 503);
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.json({ error: 'Missing signature' }, 400);

  const raw = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      raw,
      signature,
      billingEnv().STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return c.json({ error: 'Invalid signature' }, 400);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const subId = typeof session.subscription === 'string' ? session.subscription : null;
      if (userId && subId) {
        const sub = await stripe().subscriptions.retrieve(subId);
        await applySubscriptionState(userId, sub);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = await userIdForSubscription(sub);
      if (userId) await applySubscriptionState(userId, sub);
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
});
