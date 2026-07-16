import { z } from 'zod';

/**
 * Stripe env, validated lazily and SEPARATELY from server/env.ts. The main env
 * schema throws on load if any var is missing, which would take down auth, market
 * and plans in any environment that hasn't configured Stripe. Billing is optional
 * infrastructure, so its keys live here: `isBillingConfigured()` lets routes 503
 * gracefully when unset, and `billingEnv()` only throws once a billing endpoint is
 * actually exercised with a partial config.
 */
const schema = z.object({
  /** Stripe secret key (sk_live_… / sk_test_…). */
  STRIPE_SECRET_KEY: z.string().min(1),
  /** Webhook signing secret (whsec_…) for verifying event signatures. */
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  /** Recurring Price id for the regular annual Premium subscription. */
  STRIPE_PRICE_ID: z.string().min(1),
  /** Recurring Price id charged while the intro offer is active (pricing.introActive). */
  STRIPE_INTRO_PRICE_ID: z.string().min(1),
});

export type BillingEnv = z.infer<typeof schema>;

/** The env vars billing reads; used to detect a complete config without throwing. */
const KEYS = schema.keyof().options;

/** True when every Stripe var is present, so billing routes can serve instead of 503. */
export const isBillingConfigured = (): boolean =>
  KEYS.every((key) => (process.env[key] ?? '').length > 0);

let cached: BillingEnv | null = null;

/** Parse + cache the Stripe env. Throws a readable error if partially configured. */
export const billingEnv = (): BillingEnv => {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid Stripe environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
};
