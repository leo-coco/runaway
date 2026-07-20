import { describe, expect, it } from 'vitest';
import { DEFAULT_TIER_CONFIG } from '@/domain/entitlements';
import type { TierFeatures } from '@/domain/entitlements';
import { DASHBOARD_GUIDE_STEPS, accessibleSteps } from './tourSteps';

const FREE: TierFeatures = DEFAULT_TIER_CONFIG.free.features;
const PREMIUM: TierFeatures = DEFAULT_TIER_CONFIG.premium.features;

const ids = (features: TierFeatures) =>
  accessibleSteps(DASHBOARD_GUIDE_STEPS, features).map((s) => s.id);

/**
 * The welcome guide must never walk a viewer through a feature their tier can't
 * use. Every step that demonstrates a premium capability declares `requires`, and
 * `accessibleSteps` drops it for a free viewer — so the guide only ever offers
 * what's actually reachable.
 */
describe('dashboard guide is filtered to the viewer tier', () => {
  it('drops every premium-gated step for a free viewer', () => {
    const free = ids(FREE);
    // Accounts & tax, withdrawal ordering, phased spending, and real estate are
    // premium-only.
    for (const gated of [
      'accountsButton',
      'accounts',
      'accountsPresets',
      'withdrawalButton',
      'withdrawal',
      'spending',
      'realEstateButton',
      'realEstate',
    ]) {
      expect(free, `${gated} should be hidden from free`).not.toContain(gated);
    }
  });

  it('keeps the free-relevant steps for a free viewer', () => {
    const free = ids(FREE);
    // Includes the ungated additions: the hero runway, the net-worth donut, the
    // one-off expenses/income flow, the edit-asset button, and the portfolio
    // chart/assets table — all reachable on the free tier.
    for (const open of [
      'dashboardIntro',
      'runway',
      'timeline',
      'addAssetButton',
      'editAssetButton',
      'allocation',
      'savings',
      'spendingButton',
      'expensesIncomesButton',
      'expensesIncomes',
      'scenario',
      'currency',
      'portfolioGraph',
      'assetsTable',
      'dashboardOutro',
    ]) {
      expect(free, `${open} should stay for free`).toContain(open);
    }
  });

  it('shows every step to a premium viewer', () => {
    expect(ids(PREMIUM)).toEqual(DASHBOARD_GUIDE_STEPS.map((s) => s.id));
  });

  it('every premium-gated step names a feature that is off for free', () => {
    for (const step of DASHBOARD_GUIDE_STEPS) {
      if (step.requires) {
        expect(FREE[step.requires], `${step.id} requires ${step.requires}`).toBe(false);
      }
    }
  });
});
