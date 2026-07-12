import { ASSET_CLASSES, type AssetClass } from '@/domain/assetClass';
import { classCorrelation } from '@/domain/volatility';
import {
  runMonteCarlo,
  type MonteCarloAsset,
  type MonteCarloInput,
  type MonteCarloOptions,
} from './monteCarlo';

/**
 * Goal-seek levers. Each is an "all else equal" adjustment to the plan, expressed
 * in plan currency / years. The sandbox lets the user combine them; `evalSuccess`
 * measures the resulting Monte Carlo success rate for any combination.
 */
export interface Levers {
  /** Absolute annual spending (plan currency). */
  readonly spending: number;
  /** Extra monthly savings added during accumulation (plan currency). */
  readonly extraMonthlySavings: number;
  /** Years to push retirement later. */
  readonly retireDelayYears: number;
  /** One-off capital invested today (plan currency). */
  readonly extraCapital: number;
  /** Fraction (0..1) of crypto moved into a stable bucket. */
  readonly deriskFraction: number;
}

export const neutralLevers = (baseSpending: number): Levers => ({
  spending: baseSpending,
  extraMonthlySavings: 0,
  retireDelayYears: 0,
  extraCapital: 0,
  deriskFraction: 0,
});

const toClass = (c: string | undefined): AssetClass =>
  c && (ASSET_CLASSES as readonly string[]).includes(c) ? (c as AssetClass) : 'other';

// A synthetic "stable" bucket that de-risked crypto is moved into.
const STABLE_DRIFT_PCT = 4;
const STABLE_SIGMA_PCT = 8;

/**
 * Produce a modified Monte Carlo input + options reflecting the lever values.
 * Capital and extra savings are spread across holdings by current weight; de-risk
 * moves a slice of every crypto holding into a low-volatility stable asset (and
 * rebuilds the correlation matrix from classes); retiring later shifts the
 * retirement year and shortens the funded horizon by the same amount.
 */
export const applyLevers = (
  baseInput: MonteCarloInput,
  baseOpts: MonteCarloOptions,
  levers: Levers,
): { input: MonteCarloInput; options: MonteCarloOptions } => {
  const totalStart = baseInput.assets.reduce((s, a) => s + a.startValue, 0) || 1;
  const capital = Math.max(0, levers.extraCapital);
  const extraAnnualSavings = Math.max(0, levers.extraMonthlySavings) * 12;

  let assets: MonteCarloAsset[] = baseInput.assets.map((a) => {
    const w = a.startValue / totalStart;
    return {
      ...a,
      startValue: a.startValue + capital * w,
      annualContribution: a.annualContribution + extraAnnualSavings * w,
    };
  });

  let correlation = baseInput.correlation;
  const f = Math.min(Math.max(levers.deriskFraction, 0), 1);
  if (f > 0) {
    let moved = 0;
    assets = assets.map((a) => {
      if (toClass(a.assetClass) === 'crypto') {
        const m = a.startValue * f;
        moved += m;
        return { ...a, startValue: a.startValue - m };
      }
      return a;
    });
    if (moved > 0.5) {
      assets = [
        ...assets,
        {
          startValue: moved,
          driftPct: STABLE_DRIFT_PCT,
          sigmaPct: STABLE_SIGMA_PCT,
          annualContribution: 0,
          accountId: assets[0]?.accountId ?? null,
          symbol: 'Stable',
          assetClass: 'other',
        },
      ];
      correlation = assets.map((ai, i) =>
        assets.map((aj, j) =>
          i === j ? 1 : classCorrelation(toClass(ai.assetClass), toClass(aj.assetClass)),
        ),
      );
    }
  }

  const delay = Math.max(0, Math.round(levers.retireDelayYears));
  const input: MonteCarloInput = {
    ...baseInput,
    assets,
    correlation,
    annualSpending: Math.max(0, levers.spending),
    retirementYear: baseInput.retirementYear + delay,
  };
  const options: MonteCarloOptions = {
    ...baseOpts,
    retirementHorizon: Math.max(1, baseOpts.retirementHorizon - delay),
  };
  return { input, options };
};

/** Monte Carlo success rate (0..1) for a given lever combination. */
export const evalSuccess = (
  baseInput: MonteCarloInput,
  baseOpts: MonteCarloOptions,
  levers: Levers,
  iterations: number,
): number => {
  const { input, options } = applyLevers(baseInput, baseOpts, levers);
  return runMonteCarlo(input, { ...options, iterations }).successRate;
};

/** The four levers a user can drive in the sandbox (crypto de-risk is internal). */
export type ActiveLeverKey =
  | 'spending'
  | 'extraMonthlySavings'
  | 'retireDelayYears'
  | 'extraCapital';

/** Upper bounds for the auto-balance sweep (the full-effort end of each lever). */
export interface LeverBounds {
  readonly baseSpending: number;
  readonly maxSavings: number;
  readonly maxRetireYears: number;
  readonly maxCapital: number;
}

/**
 * Auto-balance: move every UNLOCKED lever together along a single effort dial
 * λ ∈ [0,1] (λ=0 = no effort, λ=1 = each unlocked lever at full effort) and solve
 * for the smallest λ that reaches the target. Locked levers keep their current
 * value. Because success rises monotonically with λ, a bisection finds it exactly.
 * Returns the resulting lever mix, its success, and whether the target was reached.
 */
export const balanceToTarget = (
  baseInput: MonteCarloInput,
  baseOpts: MonteCarloOptions,
  target: number,
  locked: Record<ActiveLeverKey, boolean>,
  current: Levers,
  bounds: LeverBounds,
  iterations: number,
): { levers: Levers; success: number; reached: boolean } => {
  const make = (lambda: number): Levers => ({
    ...current,
    spending: locked.spending ? current.spending : bounds.baseSpending * (1 - lambda),
    extraMonthlySavings: locked.extraMonthlySavings
      ? current.extraMonthlySavings
      : lambda * bounds.maxSavings,
    retireDelayYears: locked.retireDelayYears
      ? current.retireDelayYears
      : Math.round(lambda * bounds.maxRetireYears),
    extraCapital: locked.extraCapital ? current.extraCapital : lambda * bounds.maxCapital,
  });
  const f = (lambda: number) => evalSuccess(baseInput, baseOpts, make(lambda), iterations);

  if (f(1) < target) {
    const levers = make(1);
    return { levers, success: f(1), reached: false };
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= target) hi = mid;
    else lo = mid;
  }
  const levers = make(hi);
  return { levers, success: evalSuccess(baseInput, baseOpts, levers, iterations), reached: true };
};
