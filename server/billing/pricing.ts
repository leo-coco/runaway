import type { TierPricing } from '../../src/domain/entitlements.js';
import { isBillingConfigured, billingEnv } from './env.js';
import { stripe } from './stripe.js';

/**
 * Stripe is the source of truth for the amount shown to customers. Retain the
 * tier-config value only as a safe fallback while billing is disabled or Stripe
 * is temporarily unavailable.
 */
export const liveStripePricing = async (fallback: TierPricing): Promise<TierPricing> => {
  if (!isBillingConfigured()) return fallback;

  try {
    const price = await stripe().prices.retrieve(billingEnv().STRIPE_PRICE_ID);
    if (price.unit_amount === null) return fallback;
    return { annual: price.unit_amount / 100, currency: price.currency.toUpperCase() };
  } catch {
    return fallback;
  }
};
