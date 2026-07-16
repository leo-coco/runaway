import Stripe from 'stripe';
import { billingEnv } from './env.js';

let cached: Stripe | null = null;

/**
 * Lazy Stripe client singleton. Built on first use from the validated billing env
 * so importing this module never forces Stripe to be configured (see billing/env.ts).
 * The API version is left to the SDK default (pinned by the installed stripe
 * package) so it always matches the types this code is compiled against.
 */
export const stripe = (): Stripe => {
  if (cached) return cached;
  cached = new Stripe(billingEnv().STRIPE_SECRET_KEY);
  return cached;
};
