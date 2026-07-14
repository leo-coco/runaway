import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIER_CONFIG,
  atLimit,
  effectivePrice,
  resolveEntitlements,
  type TierConfig,
} from './entitlements';

const DAY = 24 * 60 * 60 * 1000;

describe('resolveEntitlements', () => {
  it('resolves an active premium user to the premium tier', () => {
    const ent = resolveEntitlements('premium', null);
    expect(ent.tier).toBe('premium');
    expect(ent.limits).toEqual({ maxPlans: null, maxAssets: null, maxAccounts: null });
    expect(ent.features).toEqual({
      monteCarlo: true,
      withdrawalOrdering: true,
      accountsTax: true,
      phasedSpending: true,
      realEstate: true,
    });
  });

  it('keeps a premium grant with no expiry (null premiumUntil) as premium', () => {
    // null = non-expiring grant, not "lapsed".
    expect(resolveEntitlements('premium', null).tier).toBe('premium');
    expect(resolveEntitlements('premium', undefined).tier).toBe('premium');
  });

  it('keeps premium while the grant is still in the future', () => {
    const future = new Date(Date.now() + 30 * DAY);
    expect(resolveEntitlements('premium', future).tier).toBe('premium');
    expect(resolveEntitlements('premium', future.toISOString()).tier).toBe('premium');
  });

  it('downgrades a lapsed premium grant back to free (the correctness invariant)', () => {
    const past = new Date(Date.now() - DAY);
    const ent = resolveEntitlements('premium', past);
    expect(ent.tier).toBe('free');
    expect(ent.limits).toEqual({ maxPlans: 1, maxAssets: 2, maxAccounts: 1 });
    expect(ent.features.monteCarlo).toBe(false);
    // ISO-string form of the same past instant lapses identically.
    expect(resolveEntitlements('premium', past.toISOString()).tier).toBe('free');
  });

  it('treats free, guests, and unknown tiers as free', () => {
    expect(resolveEntitlements('free', null).tier).toBe('free');
    expect(resolveEntitlements(null, null).tier).toBe('free');
    expect(resolveEntitlements(undefined, null).tier).toBe('free');
    expect(resolveEntitlements('bogus', null).tier).toBe('free');
  });

  it('ignores premiumUntil for a non-premium tier', () => {
    // A future date cannot promote a free user.
    const future = new Date(Date.now() + 30 * DAY);
    expect(resolveEntitlements('free', future).tier).toBe('free');
  });

  it('treats an unparseable premiumUntil as not lapsed (fails open to the grant)', () => {
    expect(resolveEntitlements('premium', 'not-a-date').tier).toBe('premium');
  });

  it('reads limits/features/pricing from a custom config, not the defaults', () => {
    const custom: TierConfig = {
      free: {
        limits: { maxPlans: 3, maxAssets: 10, maxAccounts: 2 },
        features: {
          monteCarlo: true,
          withdrawalOrdering: false,
          accountsTax: true,
          phasedSpending: false,
          realEstate: false,
        },
      },
      premium: DEFAULT_TIER_CONFIG.premium,
      pricing: { annual: 99, currency: 'EUR', introPrice: 49, introActive: false },
    };
    const ent = resolveEntitlements('free', null, custom);
    expect(ent.limits.maxPlans).toBe(3);
    expect(ent.features.monteCarlo).toBe(true);
    expect(ent.pricing).toEqual(custom.pricing);
  });
});

describe('atLimit', () => {
  it('is false below the limit', () => {
    expect(atLimit(0, 2)).toBe(false);
    expect(atLimit(1, 2)).toBe(false);
  });

  it('is true at or above the limit', () => {
    expect(atLimit(2, 2)).toBe(true);
    expect(atLimit(3, 2)).toBe(true);
  });

  it('is never at limit when the limit is null (unlimited)', () => {
    expect(atLimit(0, null)).toBe(false);
    expect(atLimit(1_000_000, null)).toBe(false);
  });

  it('treats a zero limit as always at limit', () => {
    expect(atLimit(0, 0)).toBe(true);
  });
});

describe('effectivePrice', () => {
  it('returns the intro price when the intro is active', () => {
    expect(effectivePrice(DEFAULT_TIER_CONFIG.pricing)).toBe(20);
  });

  it('returns the annual price when the intro is not active', () => {
    expect(
      effectivePrice({ annual: 59, currency: 'USD', introPrice: 20, introActive: false }),
    ).toBe(59);
  });
});
