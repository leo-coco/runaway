import { describe, it, expect } from 'vitest';
import { createSeedPlan } from '@/store/seed';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import type { RatesTable } from './currencyService';
import { DEFAULT_MC_OPTIONS, buildMonteCarloInput, runMonteCarlo } from './monteCarlo';
import { estimatePlanSuccess } from './planSuccess';

// 1 USD = 1.35 CAD. The seed plan is priced in USD but holds CAD (TSX) assets,
// so conversion materially changes the portfolio value.
const RATES: RatesTable = {
  base: 'USD',
  rates: { USD: 1, CAD: 1.35, EUR: 0.92, GBP: 0.79 },
  asOf: Date.now(),
};

/**
 * Deliberately small. Nothing here measures a converged success rate — these
 * tests assert determinism and a range, and `monteCarlo.test.ts` owns the
 * statistical properties. At 3000 the two multi-run tests cost ~1.15s each
 * under coverage locally and timed out against vitest's 5s default on CI.
 */
const ITERS = 200;
const SEED = 0x5eed1234;

describe('estimatePlanSuccess', () => {
  it('returns null for a plan with no holdings', () => {
    const plan = { ...createSeedPlan(), holdings: [] };
    expect(estimatePlanSuccess(plan, RATES, ITERS)).toBeNull();
  });

  it('produces a probability in [0, 1]', () => {
    const plan = createSeedPlan();
    const rate = estimatePlanSuccess(plan, RATES, ITERS, SEED);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThanOrEqual(0);
    expect(rate!).toBeLessThanOrEqual(1);
  });

  it('regression: applying FX rates materially changes the success rate', () => {
    // The original sidebar bug: it estimated success WITHOUT rates, leaving a
    // multi-currency portfolio in mixed native units. With identical seed and
    // iteration count the only difference is FX — and it must move the number,
    // otherwise the sidebar figure cannot agree with the FX-aware Monte Carlo lens.
    const plan = createSeedPlan();
    const withRates = estimatePlanSuccess(plan, RATES, ITERS, SEED)!;
    const withoutRates = estimatePlanSuccess(plan, undefined, ITERS, SEED)!;
    expect(Math.abs(withRates - withoutRates)).toBeGreaterThan(0.01);
  });

  it('reproduces exactly what the Monte Carlo page computes for the same plan/rates/seed', () => {
    // The sidebar shows the figure the plan page published; this proves the helper
    // and the page compute the SAME number when given the same engine parameters
    // (same FX rates, horizon, model, btc cycle, iterations and seed).
    const plan = createSeedPlan();
    const startYear = new Date().getFullYear();
    const endYear = lifeExpectancyYear(
      plan.settings.currentAge,
      startYear,
      plan.settings.lifeExpectancyAge,
    );
    const input = buildMonteCarloInput(plan, RATES, startYear, Math.max(1, endYear - startYear));
    const pageRate = runMonteCarlo(input, {
      ...DEFAULT_MC_OPTIONS,
      iterations: ITERS,
      seed: SEED,
      retirementHorizon: Math.max(1, endYear - plan.settings.retirementYear + 1),
      model: plan.settings.monteCarloModel ?? 'bootstrap',
      btcCycle: plan.settings.btcHalvingCycle ?? false,
      histStartYear: plan.settings.histStartYear,
    }).successRate;

    expect(estimatePlanSuccess(plan, RATES, ITERS, SEED)).toBe(pageRate);
  });
});
