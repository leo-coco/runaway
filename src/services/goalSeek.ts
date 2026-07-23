import { ASSET_CLASSES, type AssetClass } from '@/domain/assetClass';
import { classCorrelation } from '@/domain/volatility';
import type { Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import { convertChecked, type RatesTable } from './currencyService';
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

/** True when the engine may draw this asset down (illiquid assets never fund spending). */
const isDrawable = (a: MonteCarloAsset): boolean => a.drawable !== false;

/**
 * Produce a modified Monte Carlo input + options reflecting the lever values.
 * Capital and extra savings are spread across DRAWABLE holdings by current
 * weight — money the user newly commits has to be able to fund retirement, and
 * routing a share of it into an illiquid asset would quietly discard it; de-risk
 * moves a slice of every crypto holding into a low-volatility stable asset (and
 * rebuilds the correlation matrix from classes); retiring later shifts the
 * retirement year and shortens the funded horizon by the same amount.
 */
export const applyLevers = (
  baseInput: MonteCarloInput,
  baseOpts: MonteCarloOptions,
  levers: Levers,
): { input: MonteCarloInput; options: MonteCarloOptions } => {
  const drawableStart = baseInput.assets.reduce(
    (s, a) => s + (isDrawable(a) ? a.startValue : 0),
    0,
  );
  const capital = Math.max(0, levers.extraCapital);
  const extraAnnualSavings = Math.max(0, levers.extraMonthlySavings) * 12;

  // With no drawable balance to weight by (an all-illiquid portfolio), there is
  // no sensible split — spread the new money evenly over the drawable assets.
  const drawableCount = baseInput.assets.filter(isDrawable).length;
  const weightOf = (a: MonteCarloAsset): number => {
    if (!isDrawable(a)) return 0;
    if (drawableStart > 0) return a.startValue / drawableStart;
    return drawableCount > 0 ? 1 / drawableCount : 0;
  };

  let assets: MonteCarloAsset[] = baseInput.assets.map((a) => {
    const w = weightOf(a);
    return {
      ...a,
      startValue: a.startValue + capital * w,
      annualContribution: a.annualContribution + extraAnnualSavings * w,
    };
  });

  let correlation = baseInput.correlation;
  const f = Math.min(Math.max(levers.deriskFraction, 0), 1);
  if (f > 0) {
    // De-risked crypto stays in the account (and the liquidity bucket) it came
    // from: selling BTC inside a 401k does not move the proceeds to a taxable
    // account, and the drawdown engine taxes the stable bucket by its accountId.
    const moved = new Map<
      string,
      { amount: number; accountId: string | null; drawable?: boolean }
    >();
    assets = assets.map((a) => {
      if (toClass(a.assetClass) !== 'crypto') return a;
      const m = a.startValue * f;
      const key = `${a.accountId ?? ''}|${a.drawable === false ? 'held' : 'drawable'}`;
      const bucket = moved.get(key) ?? { amount: 0, accountId: a.accountId, drawable: a.drawable };
      bucket.amount += m;
      moved.set(key, bucket);
      return { ...a, startValue: a.startValue - m };
    });
    const stable: MonteCarloAsset[] = [...moved.values()]
      .filter((b) => b.amount > 0.5)
      .map((b) => ({
        startValue: b.amount,
        driftPct: STABLE_DRIFT_PCT,
        sigmaPct: STABLE_SIGMA_PCT,
        annualContribution: 0,
        accountId: b.accountId,
        drawable: b.drawable,
        symbol: 'Stable',
        assetClass: 'other',
      }));
    if (stable.length > 0) {
      assets = [...assets, ...stable];
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

export interface HoldingPatch {
  readonly holdingId: string;
  readonly patch: Partial<Pick<Holding, 'quantity' | 'costBasis' | 'monthlyContribution'>>;
}

/**
 * Real portfolio patches for the `extraCapital`/`extraMonthlySavings` levers,
 * using the same drawable-weighted split {@link applyLevers} uses for the
 * preview — so what "Apply" commits matches what the success-rate preview showed.
 */
export const leversToHoldingPatches = (
  plan: Plan,
  rates: RatesTable | undefined,
  baseInput: MonteCarloInput,
  levers: Levers,
): readonly HoldingPatch[] => {
  const capital = Math.max(0, levers.extraCapital);
  const extraAnnualSavings = Math.max(0, levers.extraMonthlySavings) * 12;
  if (capital <= 0 && extraAnnualSavings <= 0) return [];

  const drawable = baseInput.assets.filter(isDrawable);
  const drawableStart = drawable.reduce((s, a) => s + a.startValue, 0);
  const weightOf = (a: MonteCarloAsset): number => {
    if (drawableStart > 0) return a.startValue / drawableStart;
    return drawable.length > 0 ? 1 / drawable.length : 0;
  };

  const patches: HoldingPatch[] = [];
  for (const a of drawable) {
    if (!a.holdingId) continue;
    const holding = plan.holdings.find((h) => h.id === a.holdingId);
    if (!holding) continue;
    const w = weightOf(a);
    if (w <= 0) continue;

    const native = holding.instrument.nativeCurrency;
    const toNative = (planAmount: number) =>
      native === plan.currency || !rates
        ? planAmount
        : convertChecked(planAmount, plan.currency, native, rates);

    let quantity: number | undefined;
    let costBasis: number | undefined;
    if (capital > 0) {
      const deltaQty = holding.pricePerUnit > 0 ? toNative(capital * w) / holding.pricePerUnit : 0;
      if (deltaQty > 0) {
        quantity = holding.quantity + deltaQty;
        if (holding.costBasis !== undefined) {
          costBasis =
            (holding.costBasis * holding.quantity + holding.pricePerUnit * deltaQty) / quantity;
        }
      }
    }
    let monthlyContribution: number | undefined;
    if (extraAnnualSavings > 0) {
      const deltaMonthly = toNative((extraAnnualSavings * w) / 12);
      if (deltaMonthly > 0) monthlyContribution = holding.monthlyContribution + deltaMonthly;
    }
    if (quantity !== undefined || monthlyContribution !== undefined) {
      patches.push({
        holdingId: holding.id,
        patch: {
          ...(quantity !== undefined && { quantity }),
          ...(costBasis !== undefined && { costBasis }),
          ...(monthlyContribution !== undefined && { monthlyContribution }),
        },
      });
    }
  }
  return patches;
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

export interface BalanceResult {
  readonly levers: Levers;
  readonly success: number;
  readonly reached: boolean;
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
): BalanceResult => {
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

  const fullEffort = f(1);
  if (fullEffort < target) {
    return { levers: make(1), success: fullEffort, reached: false };
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
