import { lifeExpectancyYear } from '@/domain/retirementSettings';
import type { Plan } from '@/domain/plan';
import { DEFAULT_MC_OPTIONS, buildMonteCarloInput, runMonteCarlo } from './monteCarlo';
import type { RatesTable } from './currencyService';

/**
 * Monte Carlo success rate (0..1) for a plan, using the SAME engine, model,
 * horizon and — crucially — FX rates as the full Monte Carlo lens, so the figure
 * shown in the sidebar/list matches the one on the Monte Carlo page (only the
 * iteration count / seed differ). Returns null when the plan has no holdings.
 *
 * Passing `rates` is essential: without them a multi-currency plan's portfolio is
 * left in mixed native units, throwing the spending-to-portfolio ratio — and the
 * success rate — well off.
 */
export const estimatePlanSuccess = (
  plan: Plan,
  rates: RatesTable | undefined,
  iterations: number,
  seed = 0x5eed1234,
): number | null => {
  if (plan.holdings.length === 0) return null;
  const startYear = new Date().getFullYear();
  const endYear = lifeExpectancyYear(
    plan.settings.currentAge,
    startYear,
    plan.settings.lifeExpectancyAge,
  );
  const input = buildMonteCarloInput(plan, rates, startYear, Math.max(1, endYear - startYear));
  return runMonteCarlo(input, {
    ...DEFAULT_MC_OPTIONS,
    iterations,
    seed,
    retirementHorizon: Math.max(1, endYear - plan.settings.retirementYear + 1),
    model: plan.settings.monteCarloModel ?? 'bootstrap',
    btcCycle: plan.settings.btcHalvingCycle ?? false,
    histStartYear: plan.settings.histStartYear,
  }).successRate;
};
