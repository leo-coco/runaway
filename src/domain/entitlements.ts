/**
 * Freemium tier model. Shared by the client (feature gating, upgrade prompts) and
 * the server (authoritative limit enforcement, session entitlements). The concrete
 * limits/features/pricing live in a DB `tier_config` row the admin edits at runtime;
 * DEFAULT_TIER_CONFIG is the seed + fallback when the row is missing.
 *
 * Naming: "tier" is deliberately distinct from the overloaded "plan" (a retirement
 * plan). A user has a `tier`; a plan is a saved retirement model.
 */

export type TierId = 'free' | 'premium';

/** `null` means unlimited (only ever used by premium). */
export interface TierLimits {
  readonly maxPlans: number | null;
  readonly maxAssets: number | null;
  readonly maxAccounts: number | null;
}

/**
 * Calc-affecting capabilities gated by tier. These gate editing UI + navigation
 * and, for `monteCarlo`, whether the simulation is computed at all. They do NOT
 * switch tax on/off in the projection engine: free still models tax on whatever
 * account(s) it has. `accountsTax` is a single gate on the Accounts & Tax card:
 * either the user can manage account kinds/tax settings and hold more than one
 * account, or they can't — there's no half-access, so this isn't split into two
 * flags.
 */
export interface TierFeatures {
  readonly monteCarlo: boolean;
  readonly withdrawalOrdering: boolean;
  readonly accountsTax: boolean;
  /** Phased ("go-go / slow-go / no-go") retirement spending mode. */
  readonly phasedSpending: boolean;
  /** Primary residence / real-estate modelling (the Home card + modal). */
  readonly realEstate: boolean;
}

export interface TierPricing {
  /** Regular annual price. */
  readonly annual: number;
  readonly currency: string;
}

export interface TierDefinition {
  readonly limits: TierLimits;
  readonly features: TierFeatures;
}

export interface TierConfig {
  readonly free: TierDefinition;
  readonly premium: TierDefinition;
  readonly pricing: TierPricing;
}

/** The effective entitlements for one user, resolved from tier + config. */
export interface Entitlements {
  readonly tier: TierId;
  readonly limits: TierLimits;
  readonly features: TierFeatures;
  readonly pricing: TierPricing;
}

export const DEFAULT_TIER_CONFIG: TierConfig = {
  free: {
    limits: { maxPlans: 1, maxAssets: 2, maxAccounts: 1 },
    features: {
      monteCarlo: false,
      withdrawalOrdering: false,
      accountsTax: false,
      phasedSpending: false,
      realEstate: false,
    },
  },
  premium: {
    limits: { maxPlans: null, maxAssets: null, maxAccounts: null },
    features: {
      monteCarlo: true,
      withdrawalOrdering: true,
      accountsTax: true,
      phasedSpending: true,
      realEstate: true,
    },
  },
  pricing: { annual: 69, currency: 'USD' },
};

/** The standard annual price; Stripe promotion codes may lower it at Checkout. */
export const effectivePrice = (pricing: TierPricing): number => pricing.annual;

/** A premiumUntil in the past means the grant has lapsed back to free. */
const isLapsed = (premiumUntil: string | Date | null | undefined): boolean => {
  if (premiumUntil == null) return false; // no expiry = non-expiring grant
  const until = premiumUntil instanceof Date ? premiumUntil : new Date(premiumUntil);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() < Date.now();
};

/**
 * Resolve a user's effective entitlements. A user is premium only when their tier
 * is `premium` AND the grant has not lapsed; otherwise they get the free tier.
 * Guests (no tier) resolve to free.
 */
export const resolveEntitlements = (
  tier: string | null | undefined,
  premiumUntil: string | Date | null | undefined,
  config: TierConfig = DEFAULT_TIER_CONFIG,
): Entitlements => {
  const effective: TierId = tier === 'premium' && !isLapsed(premiumUntil) ? 'premium' : 'free';
  const def = config[effective];
  return {
    tier: effective,
    limits: def.limits,
    // Backfill any feature keys the stored config predates (e.g. flags added after
    // the row was seeded) from the defaults for this tier, so a stale tier_config
    // never silently reads a new flag as `undefined`/locked.
    features: { ...DEFAULT_TIER_CONFIG[effective].features, ...def.features },
    pricing: config.pricing,
  };
};

/** True when `count` is at/over a limit (`null` limit = unlimited, never reached). */
export const atLimit = (count: number, limit: number | null): boolean =>
  limit !== null && count >= limit;
