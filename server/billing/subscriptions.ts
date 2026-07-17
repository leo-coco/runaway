import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { user as userTable } from '../db/schema.js';
import { billingEnv } from './env.js';
import { stripe } from './stripe.js';

/**
 * Bridges Stripe subscription state onto the freemium columns the entitlement
 * resolver reads (`tier` / `premiumUntil`). The Stripe → DB write in the webhook is
 * the single source of truth for a grant; checkout only starts the flow.
 */

/** A subscription counts as an active Premium grant only while billing is live. */
const isEntitled = (status: Stripe.Subscription.Status): boolean =>
  status === 'active' || status === 'trialing';

/**
 * The current period end for a subscription. As of the pinned Stripe API version
 * this lives on the subscription item, not the subscription, so read it off the
 * first item. Unix seconds → Date; null when absent.
 */
const periodEnd = (sub: Stripe.Subscription): Date | null => {
  const end = sub.items.data[0]?.current_period_end;
  return typeof end === 'number' ? new Date(end * 1000) : null;
};

/** The customer id off a subscription, whether expanded or a bare id string. */
export const customerIdOf = (sub: Stripe.Subscription): string =>
  typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

/** The single regular Premium price; Stripe promotion codes supply any discount. */
export const priceIdForCheckout = (): string => billingEnv().STRIPE_PRICE_ID;

/** Resolve the app user linked to a Stripe customer, or null if none is stored. */
export const findUserIdByCustomer = async (customerId: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.stripeCustomerId, customerId));
  return row?.id ?? null;
};

/**
 * Reuse the user's Stripe customer or create one, persisting the id. `metadata.userId`
 * lets webhook events map back to the user even before the row is written.
 */
export const getOrCreateCustomer = async (appUser: {
  id: string;
  email: string;
}): Promise<string> => {
  const [row] = await db
    .select({ stripeCustomerId: userTable.stripeCustomerId })
    .from(userTable)
    .where(eq(userTable.id, appUser.id));
  if (row?.stripeCustomerId) return row.stripeCustomerId;

  const customer = await stripe().customers.create({
    email: appUser.email,
    metadata: { userId: appUser.id },
  });
  await db
    .update(userTable)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(userTable.id, appUser.id));
  return customer.id;
};

/**
 * Write a subscription's effective grant onto the user row. Premium while the
 * subscription is active/trialing (with `premiumUntil` = current period end);
 * otherwise the grant lapses back to free. Idempotent — safe to replay for the
 * same event.
 */
export const applySubscriptionState = async (
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> => {
  const entitled = isEntitled(sub.status);
  await db
    .update(userTable)
    .set({
      tier: entitled ? 'premium' : 'free',
      premiumUntil: entitled ? periodEnd(sub) : null,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerIdOf(sub),
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, userId));
};
