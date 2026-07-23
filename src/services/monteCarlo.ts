import type { Plan } from '@/domain/plan';
import type { MonteCarloModel } from '@/domain/retirementSettings';
import { ASSET_CLASSES, type AssetClass } from '@/domain/assetClass';
import { accountEffectiveRate, accountTaxProfile } from '@/domain/account';
import type { Country, Province } from '@/domain/country';
import { scenarioAdjustmentPts } from '@/domain/scenario';
import { DEFAULT_GROWTH_FADE, fadedCagrPct, type GrowthFadeConfig } from '@/domain/growthFade';
import {
  realSpendingMultiplier,
  type PhasedSpendingConfig,
  type SpendingMode,
} from '@/domain/spendingModel';
import {
  expenseIncomeAmountsForYear,
  saleReinvestModeForYear,
  type ExpenseIncome,
  type YearExpenseIncome,
} from '@/domain/expenseIncome';
import { applyForcedFlows, deferredBalance, type ConversionPlan } from '@/domain/taxAdvantaged';
import type { Account, AccountKind } from '@/domain/account';
import { homeFlows } from '@/domain/home';
import { rentalPropertiesFlows } from '@/domain/rentalProperty';
import { incomeTax } from '@/domain/tax';
import {
  CLASS_CRASH_BETA,
  classCorrelation,
  classReturnHistory,
  volatilityFor,
} from '@/domain/volatility';
import {
  HIST_REAL_INFLATION,
  HIST_REAL_LEN,
  HIST_REAL_LOG_DRIFT,
  HIST_REAL_RETURN,
  HIST_REAL_START_YEAR,
} from '@/domain/historicalReturns';
import { valueHoldings } from './portfolioService';
import { bracketFxFactor } from './currencyService';
import {
  CASH_RESERVE_HOLDING_ID,
  CASH_RESERVE_SYMBOL,
  futureValueOfContributions,
  reinvestSurplus,
  withdrawNet,
  type ProjectionAccountInput,
  type WithdrawableAsset,
} from './retirementCalculator';
import type { RatesTable } from './currencyService';

export interface MonteCarloAsset {
  readonly startValue: number;
  /** Expected annual return (drift), percent — the user's CAGR (+ scenario adj). */
  readonly driftPct: number;
  /** Annual volatility (standard deviation), percent. */
  readonly sigmaPct: number;
  readonly annualContribution: number;
  readonly accountId: string | null;
  /** Cost basis in the plan currency for dynamic capital-gains tracking. */
  readonly costBasis?: number;
  /** False = illiquid: grows and counts in the balance, but is never drawn down. */
  readonly drawable?: boolean;
  /** Source holding id. Ignored by the engine; lets the inspector edit it. */
  readonly holdingId?: string;
  /** Display label (ticker). Ignored by the engine; used by the data inspector. */
  readonly symbol?: string;
  /** Display asset class. Ignored by the engine; used by the data inspector. */
  readonly assetClass?: string;
}

export interface MonteCarloInput {
  readonly assets: readonly MonteCarloAsset[];
  /** Asset-level correlation matrix (n×n), derived from class correlations. */
  readonly correlation: readonly (readonly number[])[];
  readonly accounts: readonly ProjectionAccountInput[];
  readonly accountOrder: readonly string[];
  readonly annualSpending: number;
  readonly inflationPct: number;
  /** Legacy switch; when omitted, inflation is applied (use inflationPct 0 for none). */
  readonly applyInflation?: boolean;
  /** Spending profile: flat real budget (default) or Go-Go/Slow-Go/No-Go phases. */
  readonly spendingMode?: SpendingMode;
  /** Phase config when `spendingMode` is 'phased'. */
  readonly phasedSpending?: PhasedSpendingConfig;
  /** The user's age at `startYear`; required to map ages for the phased model. */
  readonly currentAge?: number;
  /** Cashflows tied to specific year(s) — one-off or recurring. */
  readonly expensesIncomes?: readonly ExpenseIncome[];
  /** Scheduled tax-deferred → tax-free conversions / meltdown. */
  readonly conversions?: readonly ConversionPlan[];
  /** Apply required minimum distributions (RMD/RRIF). Default true. */
  readonly rmdEnabled?: boolean;
  /** Raw accounts enabling dynamic cost-basis tracking (live gain fraction). */
  readonly rawAccounts?: readonly Account[];
  readonly startYear: number;
  readonly retirementYear: number;
  /** Number of years to simulate (accumulation + retirement). */
  readonly horizonYears: number;
  /** Tax residence — drives the progressive brackets for auto-mode accounts. */
  readonly residence?: Country;
  /** Canadian province for the combined bracket schedule (default ON). */
  readonly province?: Province;
  /**
   * Units of plan currency per unit of the residence country's local currency —
   * scales bracket thresholds so they apply correctly to plan-currency amounts.
   */
  readonly taxFxFactor?: number;
  /** Optional decay of high CAGRs toward a mature rate over the horizon. */
  readonly growthFade?: GrowthFadeConfig;
}

export interface MonteCarloPercentile {
  readonly year: number;
  /** Bottom 1% (1st percentile) — the deep tail / near-worst case. */
  readonly p1: number;
  /** Bottom 5% (5th percentile). */
  readonly p5: number;
  /** Bottom 10% (10th percentile). */
  readonly p10: number;
  /** Bottom 25% (25th percentile). */
  readonly p25: number;
  /** Median (50th percentile). */
  readonly p50: number;
  /** Top 25% (75th percentile). */
  readonly p75: number;
  /** Top 10% (90th percentile). */
  readonly p90: number;
}

/**
 * Four-way split of every simulated run, for a plain-language "how did the runs
 * break down" summary. Successes are split by ending balance around the median
 * of successful runs; failures are split by how far into the horizon they lasted
 * around the median failure point — both splits are relative to this plan's own
 * runs, not a fixed dollar/year constant, so they stay meaningful at any scale.
 */
export interface MonteCarloOutcomeBreakdown {
  /** Successful runs ending above the median successful balance. */
  readonly largeSurplus: number;
  /** Successful runs ending at or below the median successful balance. */
  readonly comfortable: number;
  /** Failed runs that lasted longer than the median failure point. */
  readonly almostMadeIt: number;
  /** Failed runs that ran out earlier than the median failure point. */
  readonly failedInMiddle: number;
}

export interface MonteCarloResult {
  readonly iterations: number;
  /** Fraction of runs that funded spending for the whole horizon (0..1). */
  readonly successRate: number;
  readonly retirementYear: number;
  readonly startYear: number;
  /** Years of retirement that had to be fully funded for "success". */
  readonly retirementHorizon: number;
  readonly percentiles: readonly MonteCarloPercentile[];
  /** Same shape as `percentiles`, but each value is a withdrawal rate (%) for that year:
   * net withdrawal ÷ portfolio balance at the start of the year. 0 in accumulation years. */
  readonly withdrawalRatePercentiles: readonly MonteCarloPercentile[];
  readonly medianEndBalance: number;
  readonly outcomeBreakdown: MonteCarloOutcomeBreakdown;
}

export interface MonteCarloOptions {
  readonly iterations: number;
  readonly seed: number;
  /** Years of retirement spending that must be funded to count as a success. */
  readonly retirementHorizon: number;
  /**
   * Mean-reversion speed κ ∈ [0, 1]. 0 = independent years (pure GBM). Higher
   * values pull each year's return back toward the expected return after the
   * price drifts above/below trend, dampening momentum and long-run dispersion.
   */
  readonly meanReversion?: number;
  /** Return model: normal (Gaussian), fat-tails (Student-t), or crash-aware. */
  readonly model?: MonteCarloModel;
  /**
   * Overlay the Bitcoin 4-year halving cycle on BTC holdings (matched by symbol).
   * Combines with `model`; off by default.
   */
  readonly btcCycle?: boolean;
  /**
   * Fixed cohort start year for the `historical-real-centered` model — every path
   * replays the same real sequence from this calendar year (wrapping at the end of
   * the window) instead of each path drawing its own random start. Ignored by other
   * models. Undefined means each path picks a random start year.
   */
  readonly histStartYear?: number;
}

/** Clamp the mean-reversion speed to a sane range. */
const reversionSpeed = (options: MonteCarloOptions): number =>
  Math.min(Math.max(options.meanReversion ?? 0, 0), 1);

// --- model parameters (all class-keyed / dynamic; no per-asset data) ----------
/** Degrees of freedom for the Student-t shocks (lower = fatter tails). */
const STUDENT_T_DF = 5;
/** Probability a given year is a "crash" regime. */
const CRASH_PROB = 0.06;
/** Volatility amplification during a crash year (vol clustering). */
const CRASH_VOL_MULT = 1.7;
/** Extra negative log-return applied to every risk asset in a crash year. */
const CRASH_DRIFT = -0.12;
/** Off-diagonal correlation floor in a crash (everything moves together → ~1). */
const CRASH_CORR_FLOOR = 0.85;
/** Block length (years) for the historical block-bootstrap model. */
const BOOTSTRAP_BLOCK = 8;

/**
 * Per-year return caps applied to EVERY asset (crypto or not). At high volatility
 * the lognormal model produces absurd single-year moves that dominate the upper
 * tail; bounding the annual factor to [0.05, 3.0] (−95% … +200%) keeps realistic
 * crashes and big years while cutting the runaway upside that no plan should rely
 * on. Not asset-specific — it protects against any volatile holding (SOL, ETH, …).
 */
const RETURN_FACTOR_MAX = 3.0; // +200%
const RETURN_FACTOR_MIN = 0.05; // −95%
const LOG_RETURN_MAX = Math.log(RETURN_FACTOR_MAX);
const LOG_RETURN_MIN = Math.log(RETURN_FACTOR_MIN);

/** Clamp a yearly log-return to the per-year caps. */
const capLogReturn = (logReturn: number): number =>
  Math.min(LOG_RETURN_MAX, Math.max(LOG_RETURN_MIN, logReturn));

// --- cap-bias compensation ------------------------------------------------------
// The caps are deliberately asymmetric in log space (ln 0.05 ≈ −3.0 vs ln 3 ≈ +1.1):
// at high volatility the ceiling clips the upper tail hard (≈20% of years for a
// σ=110% asset) and drags the realised median compound rate far below the stated
// CAGR (≈ −13 pts at σ=110%). To keep BOTH the caps (no absurd single years — the
// upside stays deliberately compressed) and the promise that the stated CAGR is
// the median compound rate, each asset's drift is raised by the δ that restores
// the median of its capped, compounded log-return over the horizon. δ is
// calibrated against the model's own standardized shock shape AND its mean
// reversion with a fixed-seed mini-simulation (common random numbers +
// bisection), so it is exact for the statistic the product promises, per model.
// Mean reversion has to be in the calibration: it already repairs most of the
// cap bias by itself (dev accumulates the capped return, so a clipped year is
// handed back by the next year's −κ·dev), and ignoring it overshoots the stated
// CAGR by ≈ +11 pts at σ=110%. The crash regime and the BTC cycle overlay stay
// excluded — both are intentional penalties/shapes, not bias to repair.
// δ ≥ 0 — the compensation only ever repairs the ceiling's bias, never lowers a
// drift the floor happens to flatter.

const CALIB_PATHS = 4000;
const CALIB_YEARS = 80;
const CALIB_SEED = 0x5eedca11;

/** Standardized calibration shock matrices per model shape (lazy, fixed seed). */
const calibMatrices = new Map<string, Float64Array>();
const calibMatrix = (
  key: string,
  fill: (rng: () => number, out: Float64Array) => void,
): Float64Array => {
  let m = calibMatrices.get(key);
  if (!m) {
    m = new Float64Array(CALIB_PATHS * CALIB_YEARS);
    fill(mulberry32(CALIB_SEED), m);
    calibMatrices.set(key, m);
  }
  return m;
};

/** Shock matrix matching the model's marginal yearly shape, or null (historical replay). */
const calibShocksFor = (model: MonteCarloModel, assetClass: AssetClass): Float64Array | null => {
  if (model === 'normal') {
    return calibMatrix('normal', (rng, out) => {
      for (let i = 0; i < out.length; i += 1) out[i] = gaussian(rng);
    });
  }
  if (model === 'fat-tails' || model === 'crash-aware') {
    return calibMatrix('student-t', (rng, out) => {
      for (let i = 0; i < out.length; i += 1) out[i] = studentT(rng, STUDENT_T_DF);
    });
  }
  if (model === 'bootstrap') {
    return calibMatrix(`bootstrap:${assetClass}`, (rng, out) => {
      const hist = STANDARDIZED_HISTORY[assetClass];
      const sys = Math.sqrt(classCorrelation(assetClass, assetClass));
      const idio = Math.sqrt(Math.max(0, 1 - sys * sys));
      for (let p = 0; p < CALIB_PATHS; p += 1) {
        let idx = 0;
        for (let y = 0; y < CALIB_YEARS; y += 1) {
          if (y % BOOTSTRAP_BLOCK === 0) idx = Math.floor(rng() * HISTORY_LEN);
          out[p * CALIB_YEARS + y] = sys * hist[idx]! + idio * gaussian(rng);
          idx = (idx + 1) % HISTORY_LEN;
        }
      }
    });
  }
  return null;
};

const calibCorrections = new Map<string, number>();

/**
 * The δ ≥ 0 that restores the horizon median of the capped compound to the
 * uncapped target Σ_k targets[k]. Deterministic (fixed-seed shocks) and cached.
 *
 * The mini-sim mirrors the real loop's mean reversion, which is NOT second-order
 * here: the model accumulates dev from the CAPPED return, so a clipped year grows
 * dev less and the −κ·dev term hands most of the lost upside back the next year.
 * Calibrating without κ therefore double-counts the repair and overshoots the
 * stated CAGR badly at high σ (≈ +11 pts at σ=110%, κ=0.15).
 */
const medianCapCorrection = (
  targets: readonly number[],
  sigma: number,
  kappa: number,
  shocks: Float64Array,
  cacheKey: string,
): number => {
  const hit = calibCorrections.get(cacheKey);
  if (hit !== undefined) return hit;
  const n = targets.length;
  let targetSum = 0;
  for (const t of targets) targetSum += t;
  const sums = new Float64Array(CALIB_PATHS);
  const medianSum = (delta: number): number => {
    for (let p = 0; p < CALIB_PATHS; p += 1) {
      let s = 0;
      let dev = 0;
      const base = p * CALIB_YEARS;
      for (let k = 0; k < n; k += 1) {
        const mu = targets[k]! + delta;
        const logReturn = capLogReturn(
          mu - kappa * dev + sigma * shocks[base + (k % CALIB_YEARS)]!,
        );
        dev += logReturn - mu;
        s += logReturn;
      }
      sums[p] = s;
    }
    sums.sort();
    return sums[CALIB_PATHS >> 1]!;
  };
  let delta = 0;
  if (medianSum(0) < targetSum) {
    let lo = 0;
    let hi = 0.2;
    while (medianSum(hi) < targetSum && hi < 4) hi *= 2;
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      if (medianSum(mid) < targetSum) lo = mid;
      else hi = mid;
    }
    delta = hi;
  }
  calibCorrections.set(cacheKey, delta);
  return delta;
};

/**
 * The cap-bias compensation δ ≥ 0 for one asset over its whole horizon: 0 when the
 * asset is riskless, or when the model draws its dispersion from replayed history
 * rather than σ (calibShocksFor returns null) — there is no σ-scaled shock shape to
 * calibrate against.
 */
const capCompensationDelta = (
  targets: readonly number[],
  sigma: number,
  kappa: number,
  model: MonteCarloModel,
  assetClass: AssetClass,
): number => {
  if (sigma <= 0 || targets.length === 0) return 0;
  const shocks = calibShocksFor(model, assetClass);
  if (!shocks) return 0;
  const key = `${model}|${assetClass}|${sigma}|${kappa}|${targets.join(',')}`;
  return medianCapCorrection(targets, sigma, kappa, shocks, key);
};

/** Read-only model parameters, surfaced to the "data sources" transparency panel. */
export const MODEL_PARAMS = {
  studentTDf: STUDENT_T_DF,
  crashProb: CRASH_PROB,
  crashVolMult: CRASH_VOL_MULT,
  crashDrift: CRASH_DRIFT,
  crashCorrFloor: CRASH_CORR_FLOOR,
  bootstrapBlock: BOOTSTRAP_BLOCK,
  /** Per-year return ceiling/floor as percent moves (+200% / −95%). */
  returnCapMaxPct: Math.round((RETURN_FACTOR_MAX - 1) * 100),
  returnCapMinPct: Math.round((RETURN_FACTOR_MIN - 1) * 100),
  /** Calendar window of the embedded historical series (inclusive). */
  historyStartYear: 2001,
} as const;

// --- Bitcoin 4-year halving cycle overlay -------------------------------------
/** Most recent halving; the cycle repeats every 4 years (≈ every 210k blocks). */
const HALVING_BASE_YEAR = 2024;
/**
 * Per-phase extra log-return, by phase = ((year − 2024) mod 4):
 *   0 halving year (accumulation), 1 post-halving bull, 2 bear, 3 recovery.
 * The four values sum to 0, so over a full cycle the geometric mean is unchanged
 * — the long-run return stays anchored to the user's CAGR; only the *shape*
 * (explosive bull then deep bear) is imposed.
 */
const CYCLE_OFFSET = [0.1, 0.95, -1.2, 0.15] as const;
/** Per-phase volatility multiplier (bull and bear are the wildest years). */
const CYCLE_VOL_MULT = [0.9, 1.3, 1.4, 1.0] as const;
/** Each successive cycle's amplitude shrinks (a maturing market). */
const CYCLE_DAMPING = 0.7;

/** Spot Bitcoin ETF tickers — wrappers that track BTC, so they follow the cycle. */
const BTC_ETF_TICKERS = new Set([
  'FBTC', // Fidelity Wise Origin Bitcoin Fund
  'IBIT', // iShares Bitcoin Trust
  'GBTC', // Grayscale Bitcoin Trust
  'BTC', // Grayscale Bitcoin Mini Trust
  'ARKB', // ARK 21Shares Bitcoin
  'BITB', // Bitwise Bitcoin
  'BTCO', // Invesco Galaxy Bitcoin
  'HODL', // VanEck Bitcoin
  'BRRR', // Valkyrie Bitcoin
  'EZBC', // Franklin Bitcoin
]);

/** Does this ticker denote Bitcoin? (BTC, BTC-USD, XBT, or a spot BTC ETF like FBTC.) */
export const isBitcoinSymbol = (symbol: string | undefined): boolean => {
  if (symbol == null) return false;
  const s = symbol.trim().toUpperCase();
  return /^(BTC|XBT)/.test(s) || BTC_ETF_TICKERS.has(s);
};

/** Cycle phase 0..3 for a calendar year (0 = halving year, 1 = post-halving bull). */
export const bitcoinCyclePhase = (year: number): number =>
  (((year - HALVING_BASE_YEAR) % 4) + 4) % 4;

/** The four phase offsets (exposed for tests — they must sum to 0). */
export const BTC_CYCLE_OFFSET: readonly number[] = CYCLE_OFFSET;

/** Read-only Bitcoin-cycle parameters, surfaced to the "data sources" panel. */
export const BTC_CYCLE_INFO = {
  baseYear: HALVING_BASE_YEAR,
  offsets: CYCLE_OFFSET,
  volMults: CYCLE_VOL_MULT,
  damping: CYCLE_DAMPING,
} as const;

/** Extra log-drift and volatility multiplier for a BTC year, damped per cycle. */
const btcCycleParams = (year: number): { offset: number; volMult: number } => {
  const phase = bitcoinCyclePhase(year);
  const cycleIdx = Math.max(0, Math.floor((year - HALVING_BASE_YEAR) / 4));
  const damp = Math.pow(CYCLE_DAMPING, cycleIdx);
  return { offset: CYCLE_OFFSET[phase]! * damp, volMult: 1 + (CYCLE_VOL_MULT[phase]! - 1) * damp };
};

/** Standardise a series to mean 0, unit variance (shape only — drift comes from CAGR). */
const standardize = (xs: readonly number[]): number[] => {
  const n = xs.length || 1;
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  let v = 0;
  for (const x of xs) v += (x - mean) * (x - mean);
  const std = Math.sqrt(v / n) || 1;
  return xs.map((x) => (x - mean) / std);
};

/** Standardised historical deviations per class (computed once). */
const STANDARDIZED_HISTORY: Record<AssetClass, number[]> = Object.fromEntries(
  ASSET_CLASSES.map((c) => [c, standardize(classReturnHistory(c))]),
) as Record<AssetClass, number[]>;
const HISTORY_LEN = STANDARDIZED_HISTORY.us_equity.length;

/** Resolve a Monte Carlo asset to a valid asset class (fallback: other). */
const assetClassOf = (a: MonteCarloAsset): AssetClass => {
  const c = a.assetClass as AssetClass | undefined;
  return c && c in STANDARDIZED_HISTORY ? c : 'other';
};

/**
 * The asset class's long-run real historical average return (%/yr, 1928–2024).
 * Seeds the UI's "fill with history" action: the user adopts it as their own
 * expected-return assumption and can then edit it. Every model centers on that
 * stated assumption, so this is a starting value, not a hidden override.
 */
export const historicalDriftPct = (assetClass: string | undefined): number => {
  const c = (assetClass && assetClass in HIST_REAL_LOG_DRIFT ? assetClass : 'other') as AssetClass;
  return (Math.exp(HIST_REAL_LOG_DRIFT[c]) - 1) * 100;
};

export const DEFAULT_MC_OPTIONS: MonteCarloOptions = {
  iterations: 500,
  seed: 0x9e3779b9,
  retirementHorizon: 30,
  meanReversion: 0.15,
  model: 'bootstrap',
};

// --- pure numeric helpers ------------------------------------------------------

/** Seedable PRNG (mulberry32) → [0, 1). */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Standard normal via Box–Muller. */
const gaussian = (rng: () => number): number => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/**
 * Standardised Student-t draw (mean 0, unit variance) for `df` degrees of freedom.
 * Fatter tails than a normal — rare large moves in both directions. `df` must be
 * > 2 for finite variance.
 */
const studentT = (rng: () => number, df: number): number => {
  const z = gaussian(rng);
  let chi = 0;
  for (let i = 0; i < df; i += 1) {
    const g = gaussian(rng);
    chi += g * g; // chi-square(df)
  }
  return (z / Math.sqrt(chi / df)) * Math.sqrt((df - 2) / df);
};

/**
 * Crash-regime correlation matrix: lift the correlation of each RISK-asset pair
 * toward the floor (≈1) so risk assets move together in a crash, while leaving
 * pairs that involve a defensive asset (crash beta → 0) at their normal, low
 * correlation. The lift is weighted by min(betaᵢ, betⱼ) so bonds/cash don't get
 * dragged into the crash. Diagonal stays 1.
 */
const crashCorrelation = (
  matrix: readonly (readonly number[])[],
  betas: readonly number[],
): number[][] => {
  const w = betas.map((b) => Math.min(Math.max(b, 0), 1));
  return matrix.map((row, i) =>
    row.map((c, j) => (i === j ? 1 : Math.max(c, CRASH_CORR_FLOOR * Math.min(w[i]!, w[j]!)))),
  );
};

/**
 * Strict Cholesky factor L (lower triangular) such that L·Lᵀ = matrix. Returns
 * null if the matrix is NOT positive-definite (a pivot ≤ 0), so the caller can
 * repair it rather than silently producing distorted correlations.
 */
const choleskyStrict = (matrix: readonly (readonly number[])[]): number[][] | null => {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i]![j]!;
      for (let k = 0; k < j; k += 1) sum -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (sum <= 1e-12) return null; // not positive-definite
        L[i]![j] = Math.sqrt(sum);
      } else {
        L[i]![j] = sum / L[j]![j]!;
      }
    }
  }
  return L;
};

/**
 * Robust Cholesky factor of a correlation matrix. If the matrix is already
 * positive-definite (the normal case) it factors it exactly. If not — which can
 * happen with hand-edited or inconsistent correlations — it shrinks the
 * off-diagonals toward 0 (keeping the unit diagonal) by the smallest amount that
 * restores positive-definiteness, instead of silently distorting the result.
 * Worst case it falls back to the identity (uncorrelated, always valid).
 */
export const choleskyFactor = (matrix: readonly (readonly number[])[]): number[][] => {
  const direct = choleskyStrict(matrix);
  if (direct) return direct;
  for (const alpha of [1e-6, 1e-4, 1e-3, 1e-2, 0.05, 0.1, 0.2, 0.4, 0.7]) {
    const shrunk = matrix.map((row, i) => row.map((c, j) => (i === j ? c : c * (1 - alpha))));
    const L = choleskyStrict(shrunk);
    if (L) return L;
  }
  // Last resort: independent assets (identity factor) — always positive-definite.
  return matrix.map((_, i) => matrix.map((__, j) => (i === j ? 1 : 0)));
};

/** @deprecated internal alias kept for readability at call sites. */
const cholesky = choleskyFactor;

/**
 * Start index into the historical-real window for a path: a fixed calendar year
 * (clamped into the sourced window) when `options.histStartYear` is set, so every
 * path replays the same real cohort — otherwise a random index, so each path
 * draws its own cohort.
 */
const histStartIndex = (options: MonteCarloOptions, rng: () => number): number => {
  if (options.histStartYear === undefined) return Math.floor(rng() * HIST_REAL_LEN);
  const idx = options.histStartYear - HIST_REAL_START_YEAR;
  return Math.min(HIST_REAL_LEN - 1, Math.max(0, idx));
};

/**
 * Per-year log-drift table muByYear[offset][i]: geometric centering
 * (exp(mu) = 1 + g) plus the optional growth fade, with the cap-bias
 * compensation added on top. The δ is per ASSET, not per year: it restores the
 * median of the capped compound over the whole horizon, so the same δ shifts
 * every year of that asset's drift (see capCompensationDelta).
 */
const buildMuByYear = (
  input: MonteCarloInput,
  sigma: readonly number[],
  kappa: number,
  model: MonteCarloModel,
): number[][] => {
  const fade = input.growthFade ?? DEFAULT_GROWTH_FADE;
  const years = input.horizonYears + 1;
  // targetsByAsset[i][offset] — the uncompensated geometric drift.
  const targetsByAsset = input.assets.map((a) => {
    const targets: number[] = [];
    for (let offset = 0; offset < years; offset += 1) {
      const g = 1 + fadedCagrPct(a.driftPct, offset, fade) / 100;
      targets.push(g > 0 ? Math.log(g) : -10); // g<=0: effectively zero growth
    }
    return targets;
  });
  const deltas = input.assets.map((a, i) =>
    capCompensationDelta(targetsByAsset[i]!, sigma[i] ?? 0, kappa, model, assetClassOf(a)),
  );
  const rows: number[][] = [];
  for (let offset = 0; offset < years; offset += 1) {
    rows.push(input.assets.map((_, i) => targetsByAsset[i]![offset]! + deltas[i]!));
  }
  return rows;
};

const percentileOf = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
};

// --- engine --------------------------------------------------------------------

/**
 * Monte Carlo retirement simulation. The user's expected CAGR is the median
 * compound rate (geometric centering); only the dispersion (volatility +
 * correlation) is stochastic — it spreads outcomes around the CAGR rather than
 * dragging the median below it. Each path reuses the same
 * order-based, tax-grossed withdrawal and contribution logic as the deterministic
 * projection. Pure and worker-safe.
 */
/**
 * Real (inflation-stripped) multiplier on the budget for a 0-based year offset,
 * driven by the Go-Go/Slow-Go/No-Go phases. Returns 1.0 in linear mode or when
 * the user's age is unknown, so existing behaviour is unchanged by default.
 */
const makeSpendingReal = (input: MonteCarloInput): ((offset: number) => number) => {
  if (
    input.spendingMode !== 'phased' ||
    !input.phasedSpending ||
    !input.currentAge ||
    input.currentAge <= 0
  ) {
    return () => 1;
  }
  const cfg = input.phasedSpending;
  const base = input.currentAge;
  return (offset: number) => realSpendingMultiplier(base + offset, cfg);
};

/**
 * Ordinary income for a year from any taxable expense/income flow (pension,
 * rental, periodic consulting…). It stacks *beneath* portfolio withdrawals (and
 * RMD/conversions) in the progressive brackets, so a deferred withdrawal is
 * taxed at the marginal rate above this base. `base` seeds the brackets; `net`
 * is the after-tax cash available to fund spending (non-taxable flow income —
 * e.g. an inheritance — is added back as pure cash).
 */
const flowOrdinaryIncome = (
  input: MonteCarloInput,
  flows: YearExpenseIncome,
  inflationFactor: number,
): { base: number; net: number } => {
  const base = flows.taxableIncome;
  const tax = incomeTax(
    base,
    input.residence ?? 'US',
    inflationFactor,
    input.province,
    input.taxFxFactor ?? 1,
  );
  const net = base - tax + (flows.income - flows.taxableIncome);
  return { base, net };
};

/**
 * Dynamic cost-basis helpers (mirroring the projection). When raw accounts are
 * present, each asset tracks a basis and the per-year capital-gains tax is derived
 * from the live gain fraction; otherwise the static account profiles are used.
 */
const makeBasisInit = (input: MonteCarloInput) => {
  const rawById = new Map((input.rawAccounts ?? []).map((a) => [a.id, a]));
  return (a: MonteCarloAsset): number =>
    a.costBasis ?? a.startValue * ((rawById.get(a.accountId ?? '')?.costBasisPct ?? 0) / 100);
};

const makeAccountsForYear = (input: MonteCarloInput) => {
  const rawAccounts = input.rawAccounts ?? [];
  const dynamic = rawAccounts.length > 0;
  const residence = input.residence ?? 'US';
  return (state: WithdrawableAsset[]): readonly ProjectionAccountInput[] => {
    if (!dynamic) return input.accounts;
    const agg = new Map<string, { v: number; b: number }>();
    for (const a of state) {
      if (!a.accountId) continue;
      const e = agg.get(a.accountId) ?? { v: 0, b: 0 };
      e.v += a.value;
      e.b += a.basis ?? 0;
      agg.set(a.accountId, e);
    }
    return rawAccounts.map((acc) => {
      const e = agg.get(acc.id);
      const gain = e && e.v > 0 ? Math.min(1, Math.max(0, (e.v - e.b) / e.v)) : undefined;
      const p = accountTaxProfile(acc, residence, gain);
      return {
        id: acc.id,
        kind: acc.kind ?? 'taxable',
        effectiveTaxRate: accountEffectiveRate(acc, residence),
        incomeCoef: p.incomeCoef,
        gainsCoef: p.gainsCoef,
        flatRate: p.flatRate,
        withholding: p.withholding,
      };
    });
  };
};

/**
 * Build a per-year handler for forced tax-advantaged flows (RMD + conversions),
 * mirroring the deterministic projection. `settle` mutates `state` (moves/removes
 * balances, reinvests RMD surplus) and returns the portfolio cash still needed for
 * spending plus the ordinary-income base withdrawals stack on.
 *
 * `rmdBaseOf` must be sampled BEFORE the year's growth — the RMD divisor applies
 * to the prior 31 December balance (see `deferredBalance`).
 */
const makeForcedFlows = (input: MonteCarloInput) => {
  const conversions = input.conversions ?? [];
  const rmdEnabled = input.rmdEnabled ?? true;
  const residence = input.residence ?? 'US';
  const taxFx = input.taxFxFactor ?? 1;
  const active = conversions.length > 0 || rmdEnabled;
  const kindById = new Map((input.accounts ?? []).map((a) => [a.id, a.kind]));
  const kindOf = (accountId: string | null): AccountKind | undefined =>
    accountId ? kindById.get(accountId) : undefined;
  const cashIndex = input.assets.findIndex((a) => a.symbol === CASH_RESERVE_SYMBOL);

  const rmdBaseOf = (state: readonly WithdrawableAsset[]): number =>
    active ? deferredBalance(state, kindOf) : 0;

  const settle = (
    state: WithdrawableAsset[],
    year: number,
    inflationFactor: number,
    ordinaryBase: number,
    ordinaryNet: number,
    spendNet: number,
    flowExpense: number,
    rmdBase: number,
  ): { needFromPortfolio: number; forcedBase: number } => {
    if (!active) {
      const surplus = Math.max(0, ordinaryNet - (spendNet + flowExpense));
      reinvestSurplus(
        state,
        surplus,
        saleReinvestModeForYear(input.expensesIncomes, year, inflationFactor),
        kindOf,
        cashIndex,
      );
      return {
        needFromPortfolio: Math.max(0, spendNet + flowExpense - ordinaryNet),
        forcedBase: ordinaryBase,
      };
    }
    const age =
      input.currentAge && input.currentAge > 0 ? input.currentAge + (year - input.startYear) : null;
    const birthYear =
      input.currentAge && input.currentAge > 0 ? input.startYear - input.currentAge : null;
    const forced = applyForcedFlows(state, kindOf, {
      residence,
      age,
      birthYear,
      rmdEnabled,
      conversions,
      inflationFactor,
      rmdBase,
    });
    const c = forced.conversionIncome;
    const r = forced.rmdGross;
    // Stack in the order the flows happen: mandatory RMD first, discretionary
    // conversion at the marginal rate above it (mirrors the deterministic engine).
    const t0 = incomeTax(ordinaryBase, residence, inflationFactor, input.province, taxFx);
    const tR = incomeTax(ordinaryBase + r, residence, inflationFactor, input.province, taxFx);
    const tC = incomeTax(ordinaryBase + r + c, residence, inflationFactor, input.province, taxFx);
    const convTax = tC - tR;
    const rmdNet = r - (tR - t0);
    const cashAvailable = ordinaryNet + rmdNet;
    const cashNeed = spendNet + convTax + flowExpense;
    const surplus = Math.max(0, cashAvailable - cashNeed);
    reinvestSurplus(
      state,
      surplus,
      saleReinvestModeForYear(input.expensesIncomes, year, inflationFactor),
      kindOf,
      cashIndex,
    );
    return {
      needFromPortfolio: Math.max(0, cashNeed - cashAvailable),
      forcedBase: ordinaryBase + r + c,
    };
  };

  return { settle, rmdBaseOf };
};

/**
 * Apply an expense/income flow outside the retirement withdrawal path (e.g. a
 * home purchase or inheritance received before retiring, when there is no
 * lifestyle spending to net it against). `ordinaryNet`/`ordinaryBase` are the
 * flow's own after-tax income and taxable base (see `flowOrdinaryIncome`) — any
 * shortfall is drawn from the portfolio (grossed up for tax, stacked on top of
 * that base), or the surplus is reinvested the same way RMD surplus is.
 * Returns whether the portfolio could not fully fund a net expense.
 */
const makeApplyFlows = (input: MonteCarloInput) => {
  const kindById = new Map((input.accounts ?? []).map((a) => [a.id, a.kind]));
  const kindOf = (accountId: string | null): AccountKind | undefined =>
    accountId ? kindById.get(accountId) : undefined;
  const residence = input.residence ?? 'US';

  return (
    state: WithdrawableAsset[],
    ordinaryNet: number,
    ordinaryBase: number,
    flowExpense: number,
    accounts: readonly ProjectionAccountInput[],
    accountOrder: readonly string[],
    inflationFactor: number,
  ): boolean => {
    const net = flowExpense - ordinaryNet;
    if (net > 0) {
      const r = withdrawNet(state, net, accounts, accountOrder, {
        residence,
        province: input.province,
        inflationFactor,
        fxFactor: input.taxFxFactor ?? 1,
        baseOrdinaryIncome: ordinaryBase,
      });
      return r.net < net - 0.5;
    }
    if (net < 0) {
      const sink =
        state.find((a) => a.drawable !== false && kindOf(a.accountId) === 'taxable') ??
        state.find((a) => a.drawable !== false && kindOf(a.accountId) !== 'tax_deferred') ??
        state.find((a) => a.drawable !== false);
      if (sink) {
        sink.value += -net;
        // Reinvested after-tax cash is fresh basis (mirrors the deterministic engine).
        sink.basis = (sink.basis ?? 0) + -net;
      }
    }
    return false;
  };
};

export const runMonteCarlo = (
  input: MonteCarloInput,
  options: MonteCarloOptions = DEFAULT_MC_OPTIONS,
): MonteCarloResult => {
  const { assets, accountOrder, annualSpending, retirementYear, startYear } = input;
  const n = assets.length;
  const inflationRate = (input.applyInflation ?? true) ? input.inflationPct / 100 : 0;
  const spendingReal = makeSpendingReal(input);
  const forcedFlows = makeForcedFlows(input);
  const applyFlows = makeApplyFlows(input);
  const basisInit = makeBasisInit(input);
  const accountsForYear = makeAccountsForYear(input);
  const L = cholesky(input.correlation);
  const rng = mulberry32(options.seed);

  // Per-asset lognormal parameters: factor = exp(mu + sigma·z).
  const sigma = assets.map((a) => Math.max(0, a.sigmaPct) / 100);
  // An explicit 0% volatility means "riskless": no shock, no crash hit, no BTC
  // cycle, and (in the historical cohort) no historical replay — just the stated CAGR.
  const hasVariance = sigma.map((s) => s > 0);
  const model = options.model ?? 'normal';
  const fatTails = model === 'fat-tails' || model === 'crash-aware';
  const crashAware = model === 'crash-aware';
  const isBootstrap = model === 'bootstrap';
  const isHistReal = model === 'historical-real-centered';
  const kappa = isBootstrap || isHistReal ? 0 : reversionSpeed(options);
  // Geometric centering: the user's CAGR is the MEDIAN compound rate (exp(mu) = 1+g),
  // so volatility disperses outcomes symmetrically around it instead of dragging the
  // median down by σ²/2. Every model centers on the user's stated return; the model
  // only shapes the dispersion. The optional growth fade lowers high CAGRs over time,
  // so the log-drift is per-year: muByYear[offset][assetIndex]. σ-scaled models also
  // carry the cap-bias compensation (see capCompensationDelta).
  const muByYear = buildMuByYear(input, sigma, kappa, model);
  // Bootstrap support: each asset's class history (standardized) + systematic share.
  const classOf = assets.map(assetClassOf);
  // Historical cohort: each asset earns its asset-class index return, replayed for real.
  const histReturnByAsset = classOf.map((c) => HIST_REAL_RETURN[c]);
  // The class's mean log return over the same window, so each year's real return can
  // be re-centred onto the user's CAGR.
  const histLogDriftByAsset = classOf.map((c) => HIST_REAL_LOG_DRIFT[c]);
  const sysShare = assets.map((_, i) => Math.sqrt(classCorrelation(classOf[i]!, classOf[i]!)));
  // Crash sensitivity per asset (defensive classes barely move in a crash).
  const crashBeta = classOf.map((c) => CLASS_CRASH_BETA[c]);
  const Lcrash = crashAware ? cholesky(crashCorrelation(input.correlation, crashBeta)) : L;
  // Bitcoin halving-cycle overlay (BTC holdings only, matched by symbol).
  const btcCycle = options.btcCycle ?? false;
  const isBtc = assets.map((a) => btcCycle && isBitcoinSymbol(a.symbol));
  const lastRetirementYear = retirementYear + options.retirementHorizon - 1;
  const years: number[] = [];
  for (let y = startYear; y <= startYear + input.horizonYears; y += 1) years.push(y);
  const balancesByYear: number[][] = years.map(() => new Array<number>(options.iterations));
  const withdrawalRateByYear: number[][] = years.map(() => new Array<number>(options.iterations));

  let successes = 0;
  const work = new Array<number>(n);
  const draws = new Array<number>(n);
  const dev = new Array<number>(n); // log-price deviation from trend (mean reversion)
  const fundedByIter = new Array<boolean>(options.iterations);
  // First year a run went unfunded (accumulation shortfall or retirement shortfall);
  // null for runs that never failed.
  const firstFailYearByIter = new Array<number | null>(options.iterations);

  for (let iter = 0; iter < options.iterations; iter += 1) {
    const state: WithdrawableAsset[] = assets.map((a) => ({
      value: a.startValue,
      accountId: a.accountId,
      drawable: a.drawable,
      basis: basisInit(a),
    }));
    for (let i = 0; i < n; i += 1) dev[i] = 0;
    let funded = true;
    let firstFailYear: number | null = null;
    let bsIdx = 0;
    let bsBlockYear = 0;
    // Historical-real: pick a random start year in the window, then walk forward
    // through the real cohort (wrapping), and inflate spending by realised CPI.
    const histStart = isHistReal ? histStartIndex(options, rng) : 0;
    let histInfl = 1;

    for (let yi = 0; yi < years.length; yi += 1) {
      const year = years[yi]!;
      const isRetired = year >= retirementYear;
      const hidx = isHistReal ? (histStart + yi) % HIST_REAL_LEN : 0;

      let isCrash = false;
      if (isHistReal) {
        // Factors come straight from history below — no shocks to draw.
      } else if (isBootstrap) {
        // Block bootstrap: read one historical calendar index for all classes
        // (preserves real co-movement + crashes), walking in blocks.
        if (bsBlockYear === 0) bsIdx = Math.floor(rng() * HISTORY_LEN);
        const idx = bsIdx;
        for (let i = 0; i < n; i += 1) {
          const d = STANDARDIZED_HISTORY[classOf[i]!]![idx]!;
          draws[i] = sysShare[i]! * d + Math.sqrt(1 - sysShare[i]! * sysShare[i]!) * gaussian(rng);
        }
        bsIdx = (bsIdx + 1) % HISTORY_LEN;
        bsBlockYear = (bsBlockYear + 1) % BOOTSTRAP_BLOCK;
      } else {
        // Regime: in a crash year risk-asset correlations jump toward 1 and a
        // common negative shock hits them — scaled per asset by its crash beta,
        // so defensive assets (bonds/cash) are spared (flight-to-quality).
        isCrash = crashAware && rng() < CRASH_PROB;
        const Lyear = isCrash ? Lcrash : L;
        for (let i = 0; i < n; i += 1)
          work[i] = fatTails ? studentT(rng, STUDENT_T_DF) : gaussian(rng);
        for (let i = 0; i < n; i += 1) {
          let z = 0;
          const Li = Lyear[i]!;
          for (let k = 0; k <= i; k += 1) z += Li[k]! * work[k]!;
          draws[i] = z;
        }
      }

      // Deferred balance at last year's close — the RMD divisor's base, sampled
      // before this year's growth moves it.
      const rmdBase = forcedFlows.rmdBaseOf(state);

      // Growth + contributions (accumulation phase). The log return is pulled
      // toward its mean by κ·(deviation so far), then the deviation is updated.
      // Contributions compound intra-year (monthly) like the deterministic
      // projection, so both tables use the same contribution methodology.
      const cyc = btcCycle ? btcCycleParams(year) : null;
      const muY = muByYear[yi]!;
      for (let i = 0; i < n; i += 1) {
        let factor: number;
        if (isHistReal) {
          // Real cohort: the asset replays its asset-class index return this year —
          // unless the user zeroed its volatility ("riskless"), in which case it
          // grows deterministically at the stated CAGR instead of replaying history.
          if (!hasVariance[i]) {
            factor = Math.exp(muY[i]!);
          } else {
            // Same real year-by-year deviation as the raw cohort, but re-centred onto
            // the user's CAGR instead of history's own average — the model shapes the
            // dispersion, the user's stated return sets the trend.
            const logReturn = capLogReturn(
              Math.log(1 + histReturnByAsset[i]![hidx]!) - histLogDriftByAsset[i]! + muY[i]!,
            );
            factor = Math.exp(logReturn);
          }
        } else {
          const cycVol = cyc && isBtc[i] ? cyc.volMult : 1;
          const cycOff = cyc && isBtc[i] && hasVariance[i] ? cyc.offset : 0;
          const kappaI = cyc && isBtc[i] ? 0 : kappa; // the cycle replaces mean reversion for BTC
          // Crash impact scaled by the asset's class beta (0 for defensive assets).
          const cb = crashBeta[i]!;
          const crashVol = isCrash ? 1 + (CRASH_VOL_MULT - 1) * cb : 1;
          const crashDrift = isCrash && hasVariance[i] ? CRASH_DRIFT * cb : 0;
          const shock = sigma[i]! * crashVol * cycVol * draws[i]!;
          const logReturn = capLogReturn(muY[i]! - kappaI * dev[i]! + shock + crashDrift + cycOff);
          dev[i] = dev[i]! + (logReturn - muY[i]!);
          factor = Math.exp(logReturn);
        }
        state[i]!.value *= factor;
        if (!isRetired && assets[i]!.annualContribution > 0) {
          state[i]!.value += futureValueOfContributions(assets[i]!.annualContribution / 12, factor);
          state[i]!.basis = (state[i]!.basis ?? 0) + assets[i]!.annualContribution;
        }
      }

      // Spending is in today's money: inflated by the constant rate, or — in the
      // historical-real model — by the cohort's realised CPI so far.
      const inflationFactor = isHistReal ? histInfl : Math.pow(1 + inflationRate, year - startYear);
      // Expense/income flows (home purchase/sale, inheritance, tuition, rental…)
      // fire in their target year(s) regardless of retirement status.
      const flows = expenseIncomeAmountsForYear(input.expensesIncomes, year, inflationFactor);

      // Opening balance for this year (post-growth, pre-withdrawal) — the
      // denominator for this year's withdrawal rate.
      let openingTotal = 0;
      for (let i = 0; i < n; i += 1) openingTotal += Math.max(0, state[i]!.value);
      withdrawalRateByYear[yi]![iter] = 0;

      // Withdrawal (retirement phase), grossed up for tax, drained in order.
      if (isRetired) {
        const need = annualSpending * spendingReal(year - startYear) * inflationFactor;
        // Non-portfolio income + taxable flow income + forced flows (conversions
        // / RMD) settle first, stacking beneath withdrawals in the brackets.
        const other = flowOrdinaryIncome(input, flows, inflationFactor);
        const ff = forcedFlows.settle(
          state,
          year,
          inflationFactor,
          other.base,
          other.net,
          need,
          flows.expense,
          rmdBase,
        );
        const r = withdrawNet(state, ff.needFromPortfolio, accountsForYear(state), accountOrder, {
          residence: input.residence ?? 'US',
          province: input.province,
          inflationFactor,
          fxFactor: input.taxFxFactor ?? 1,
          baseOrdinaryIncome: ff.forcedBase,
        });
        if (r.net < ff.needFromPortfolio - 0.5 && year <= lastRetirementYear) {
          funded = false;
          if (firstFailYear === null) firstFailYear = year;
        }
        withdrawalRateByYear[yi]![iter] = openingTotal > 0 ? (r.net / openingTotal) * 100 : 0;
      } else if (flows.expense > 0 || flows.income > 0) {
        const flowOrdinary = flowOrdinaryIncome(input, flows, inflationFactor);
        const shortfall = applyFlows(
          state,
          flowOrdinary.net,
          flowOrdinary.base,
          flows.expense,
          accountsForYear(state),
          accountOrder,
          inflationFactor,
        );
        if (shortfall && year <= lastRetirementYear) {
          funded = false;
          if (firstFailYear === null) firstFailYear = year;
        }
      }

      // Advance the realised-inflation accumulator for the next year of the cohort.
      if (isHistReal) histInfl *= 1 + HIST_REAL_INFLATION[hidx]!;

      let total = 0;
      for (let i = 0; i < n; i += 1) total += Math.max(0, state[i]!.value);
      balancesByYear[yi]![iter] = total;
    }

    fundedByIter[iter] = funded;
    firstFailYearByIter[iter] = firstFailYear;
    if (funded) successes += 1;
  }

  const percentiles: MonteCarloPercentile[] = years.map((year, yi) => {
    const sorted = balancesByYear[yi]!.slice().sort((x, y) => x - y);
    return {
      year,
      p1: percentileOf(sorted, 0.01),
      p5: percentileOf(sorted, 0.05),
      p10: percentileOf(sorted, 0.1),
      p25: percentileOf(sorted, 0.25),
      p50: percentileOf(sorted, 0.5),
      p75: percentileOf(sorted, 0.75),
      p90: percentileOf(sorted, 0.9),
    };
  });

  const withdrawalRatePercentiles: MonteCarloPercentile[] = years.map((year, yi) => {
    const sorted = withdrawalRateByYear[yi]!.slice().sort((x, y) => x - y);
    return {
      year,
      p1: percentileOf(sorted, 0.01),
      p5: percentileOf(sorted, 0.05),
      p10: percentileOf(sorted, 0.1),
      p25: percentileOf(sorted, 0.25),
      p50: percentileOf(sorted, 0.5),
      p75: percentileOf(sorted, 0.75),
      p90: percentileOf(sorted, 0.9),
    };
  });

  const endYearIndex = years.findIndex((y) => y === lastRetirementYear);
  const endBalanceByIter =
    endYearIndex >= 0 ? balancesByYear[endYearIndex]! : balancesByYear[balancesByYear.length - 1]!;
  const endSorted = endBalanceByIter.slice().sort((x, y) => x - y);

  // Split successes around their own median balance, and failures around their
  // own median failure year — relative splits, so they stay meaningful whether
  // the plan is in dollars or millions, or fails in year one or year twenty.
  const successBalances: number[] = [];
  const failYears: number[] = [];
  for (let iter = 0; iter < options.iterations; iter += 1) {
    if (fundedByIter[iter]) {
      successBalances.push(endBalanceByIter[iter]!);
    } else {
      failYears.push(firstFailYearByIter[iter] ?? lastRetirementYear);
    }
  }
  const medianSuccessBalance = percentileOf(
    successBalances.slice().sort((x, y) => x - y),
    0.5,
  );
  const medianFailYear = percentileOf(
    failYears.slice().sort((x, y) => x - y),
    0.5,
  );

  const outcomeBreakdown: MonteCarloOutcomeBreakdown = {
    largeSurplus: 0,
    comfortable: 0,
    almostMadeIt: 0,
    failedInMiddle: 0,
  };
  const breakdown: { -readonly [K in keyof MonteCarloOutcomeBreakdown]: number } = outcomeBreakdown;
  for (let iter = 0; iter < options.iterations; iter += 1) {
    if (fundedByIter[iter]) {
      if (endBalanceByIter[iter]! >= medianSuccessBalance) breakdown.largeSurplus += 1;
      else breakdown.comfortable += 1;
    } else {
      const failYear = firstFailYearByIter[iter] ?? lastRetirementYear;
      if (failYear >= medianFailYear) breakdown.almostMadeIt += 1;
      else breakdown.failedInMiddle += 1;
    }
  }

  return {
    iterations: options.iterations,
    successRate: successes / options.iterations,
    retirementYear,
    startYear,
    retirementHorizon: options.retirementHorizon,
    percentiles,
    withdrawalRatePercentiles,
    medianEndBalance: percentileOf(endSorted, 0.5),
    outcomeBreakdown,
  };
};

// --- sample path (for the data inspector) -------------------------------------

export interface SamplePathAssetYear {
  readonly symbol: string;
  /** Random return drawn this year, percent (factor − 1). */
  readonly returnPct: number;
  /** Opening value (start of year, before growth). */
  readonly opening: number;
  /** Growth on the opening value this year. */
  readonly appreciation: number;
  /** Value after growth (opening + appreciation), before contributions/withdrawals. */
  readonly afterAppreciation: number;
  /** Closing value (after contributions and any withdrawal). */
  readonly closing: number;
}

export interface SamplePathYear {
  readonly year: number;
  readonly isRetired: boolean;
  readonly assets: readonly SamplePathAssetYear[];
  /** Opening-weighted blended return of the whole portfolio this year, percent. */
  readonly portfolioReturnPct: number;
  /** Portfolio total at the start of the year (before growth/contributions). */
  readonly openingTotal: number;
  /** Total growth on the opening balance this year. */
  readonly appreciation: number;
  /** openingTotal + appreciation. */
  readonly balanceAfterAppreciation: number;
  /** Contributions invested this year incl. intra-year growth (accumulation). */
  readonly contributionValue: number;
  /** Expense/income flow outflow landing this year (one-off or recurring), nominal. */
  readonly flowExpense: number;
  /** Expense/income flow inflow landing this year (one-off or recurring), nominal. */
  readonly flowIncome: number;
  readonly netWithdrawal: number;
  readonly grossWithdrawal: number;
  /** Total tax across the withdrawals from every account this year. */
  readonly tax: number;
  /** Portfolio total after the withdrawal. */
  readonly closingTotal: number;
  /**
   * True when the portfolio could not fund what was asked of it this year — the
   * same funding-shortfall test `runMonteCarlo` counts as a failure. A balance
   * still above zero is not proof of success: an illiquid holding props the
   * total up while the drawable pool is already dry.
   */
  readonly shortfall: boolean;
}

export interface SamplePath {
  readonly seed: number;
  readonly years: readonly SamplePathYear[];
  /** Calendar year this path's historical replay began, for the historical-real model only. */
  readonly histStartYear?: number;
}

/**
 * Reproduce a single simulated future (the first iteration for the given seed),
 * recording each asset's drawn return, contribution and value year by year, plus
 * the withdrawal mechanics. Lets the UI show concrete data behind the aggregate
 * result. This is one representative path, not the average.
 */
export const sampleMonteCarloPath = (
  input: MonteCarloInput,
  options: MonteCarloOptions = DEFAULT_MC_OPTIONS,
): SamplePath => {
  const { assets, accountOrder, annualSpending, retirementYear, startYear } = input;
  const n = assets.length;
  const inflationRate = (input.applyInflation ?? true) ? input.inflationPct / 100 : 0;
  const spendingReal = makeSpendingReal(input);
  const forcedFlows = makeForcedFlows(input);
  const applyFlows = makeApplyFlows(input);
  const basisInit = makeBasisInit(input);
  const accountsForYear = makeAccountsForYear(input);
  const L = cholesky(input.correlation);
  const rng = mulberry32(options.seed);

  const sigma = assets.map((a) => Math.max(0, a.sigmaPct) / 100);
  // An explicit 0% volatility means "riskless": no shock, no crash hit, no BTC
  // cycle, and (in the historical cohort) no historical replay — just the stated CAGR.
  const hasVariance = sigma.map((s) => s > 0);
  const model = options.model ?? 'normal';
  const fatTails = model === 'fat-tails' || model === 'crash-aware';
  const crashAware = model === 'crash-aware';
  const isBootstrap = model === 'bootstrap';
  const isHistReal = model === 'historical-real-centered';
  const kappa = isBootstrap || isHistReal ? 0 : reversionSpeed(options);
  // Geometric centering + optional fade + cap-bias compensation — see runMonteCarlo.
  const muByYear = buildMuByYear(input, sigma, kappa, model);
  const classOf = assets.map(assetClassOf);
  const histReturnByAsset = classOf.map((c) => HIST_REAL_RETURN[c]);
  const histLogDriftByAsset = classOf.map((c) => HIST_REAL_LOG_DRIFT[c]);
  const sysShare = assets.map((_, i) => Math.sqrt(classCorrelation(classOf[i]!, classOf[i]!)));
  const crashBeta = classOf.map((c) => CLASS_CRASH_BETA[c]);
  const Lcrash = crashAware ? cholesky(crashCorrelation(input.correlation, crashBeta)) : L;
  const btcCycle = options.btcCycle ?? false;
  const isBtc = assets.map((a) => btcCycle && isBitcoinSymbol(a.symbol));
  const years: SamplePathYear[] = [];
  const state: WithdrawableAsset[] = assets.map((a) => ({
    value: a.startValue,
    accountId: a.accountId,
    drawable: a.drawable,
    basis: basisInit(a),
  }));
  const work = new Array<number>(n);
  const draws = new Array<number>(n);
  const dev = new Array<number>(n).fill(0);
  let bsIdx = 0;
  let bsBlockYear = 0;
  const histStart = isHistReal ? histStartIndex(options, rng) : 0;
  let histInfl = 1;

  for (let y = startYear; y <= startYear + input.horizonYears; y += 1) {
    const isRetired = y >= retirementYear;
    const yi = y - startYear;
    const hidx = isHistReal ? (histStart + yi) % HIST_REAL_LEN : 0;

    let openingTotal = 0;
    for (let i = 0; i < n; i += 1) openingTotal += Math.max(0, state[i]!.value);

    let isCrash = false;
    if (isHistReal) {
      // Factors come straight from history below — no shocks to draw.
    } else if (isBootstrap) {
      if (bsBlockYear === 0) bsIdx = Math.floor(rng() * HISTORY_LEN);
      const idx = bsIdx;
      for (let i = 0; i < n; i += 1) {
        const d = STANDARDIZED_HISTORY[classOf[i]!]![idx]!;
        draws[i] = sysShare[i]! * d + Math.sqrt(1 - sysShare[i]! * sysShare[i]!) * gaussian(rng);
      }
      bsIdx = (bsIdx + 1) % HISTORY_LEN;
      bsBlockYear = (bsBlockYear + 1) % BOOTSTRAP_BLOCK;
    } else {
      isCrash = crashAware && rng() < CRASH_PROB;
      const Lyear = isCrash ? Lcrash : L;
      for (let i = 0; i < n; i += 1)
        work[i] = fatTails ? studentT(rng, STUDENT_T_DF) : gaussian(rng);
      for (let i = 0; i < n; i += 1) {
        let z = 0;
        const Li = Lyear[i]!;
        for (let k = 0; k <= i; k += 1) z += Li[k]! * work[k]!;
        draws[i] = z;
      }
    }

    // Deferred balance at last year's close — the RMD divisor's base, sampled
    // before this year's growth moves it.
    const rmdBase = forcedFlows.rmdBaseOf(state);

    // Per-asset opening / appreciation / contribution (mirrors the deterministic
    // engine so the data table matches the main projection table).
    const opening = new Array<number>(n);
    const appreciation = new Array<number>(n);
    const returnPct = new Array<number>(n);
    let totalAppreciation = 0;
    let contributionValue = 0;
    const cyc = btcCycle ? btcCycleParams(y) : null;
    const muY = muByYear[yi]!;
    for (let i = 0; i < n; i += 1) {
      let factor: number;
      if (isHistReal) {
        // See runMonteCarlo: a zeroed-out volatility means "riskless" — grow
        // deterministically at the stated CAGR instead of replaying history.
        if (!hasVariance[i]) {
          factor = Math.exp(muY[i]!);
        } else {
          const logReturn = capLogReturn(
            Math.log(1 + histReturnByAsset[i]![hidx]!) - histLogDriftByAsset[i]! + muY[i]!,
          );
          factor = Math.exp(logReturn);
        }
      } else {
        const cycVol = cyc && isBtc[i] ? cyc.volMult : 1;
        const cycOff = cyc && isBtc[i] && hasVariance[i] ? cyc.offset : 0;
        const kappaI = cyc && isBtc[i] ? 0 : kappa;
        const cb = crashBeta[i]!;
        const crashVol = isCrash ? 1 + (CRASH_VOL_MULT - 1) * cb : 1;
        const crashDrift = isCrash && hasVariance[i] ? CRASH_DRIFT * cb : 0;
        const logReturn = capLogReturn(
          muY[i]! -
            kappaI * dev[i]! +
            sigma[i]! * crashVol * cycVol * draws[i]! +
            crashDrift +
            cycOff,
        );
        dev[i] = dev[i]! + (logReturn - muY[i]!);
        factor = Math.exp(logReturn);
      }
      const open = state[i]!.value;
      const gain = open * (factor - 1);
      opening[i] = open;
      appreciation[i] = gain;
      returnPct[i] = (factor - 1) * 100;
      totalAppreciation += gain;
      state[i]!.value = open * factor;
      if (!isRetired && assets[i]!.annualContribution > 0) {
        const fv = futureValueOfContributions(assets[i]!.annualContribution / 12, factor);
        state[i]!.value += fv;
        state[i]!.basis = (state[i]!.basis ?? 0) + assets[i]!.annualContribution;
        contributionValue += fv;
      }
    }
    const portfolioReturnPct = openingTotal > 0 ? (totalAppreciation / openingTotal) * 100 : 0;

    let net = 0;
    let gross = 0;
    let tax = 0;
    let shortfall = false;
    const inflationFactor = isHistReal ? histInfl : Math.pow(1 + inflationRate, y - startYear);
    const flows = expenseIncomeAmountsForYear(input.expensesIncomes, y, inflationFactor);
    if (isRetired) {
      const need = annualSpending * spendingReal(y - startYear) * inflationFactor;
      const other = flowOrdinaryIncome(input, flows, inflationFactor);
      const ff = forcedFlows.settle(
        state,
        y,
        inflationFactor,
        other.base,
        other.net,
        need,
        flows.expense,
        rmdBase,
      );
      const r = withdrawNet(state, ff.needFromPortfolio, accountsForYear(state), accountOrder, {
        residence: input.residence ?? 'US',
        province: input.province,
        inflationFactor,
        fxFactor: input.taxFxFactor ?? 1,
        baseOrdinaryIncome: ff.forcedBase,
      });
      net = r.net;
      gross = r.gross;
      tax = r.tax;
      shortfall = r.net < ff.needFromPortfolio - 0.5;
    } else if (flows.expense > 0 || flows.income > 0) {
      const flowOrdinary = flowOrdinaryIncome(input, flows, inflationFactor);
      shortfall = applyFlows(
        state,
        flowOrdinary.net,
        flowOrdinary.base,
        flows.expense,
        accountsForYear(state),
        accountOrder,
        inflationFactor,
      );
    }

    if (isHistReal) histInfl *= 1 + HIST_REAL_INFLATION[hidx]!;

    let total = 0;
    for (let i = 0; i < n; i += 1) total += Math.max(0, state[i]!.value);

    const assetRows: SamplePathAssetYear[] = assets.map((a, i) => ({
      symbol: a.symbol ?? `Asset ${i + 1}`,
      returnPct: returnPct[i]!,
      opening: opening[i]!,
      appreciation: appreciation[i]!,
      afterAppreciation: opening[i]! + appreciation[i]!,
      closing: Math.max(0, state[i]!.value),
    }));

    years.push({
      year: y,
      isRetired,
      assets: assetRows,
      portfolioReturnPct,
      openingTotal,
      appreciation: totalAppreciation,
      balanceAfterAppreciation: openingTotal + totalAppreciation,
      contributionValue,
      flowExpense: flows.expense,
      flowIncome: flows.income,
      netWithdrawal: net,
      grossWithdrawal: gross,
      tax,
      closingTotal: total,
      shortfall,
    });
  }

  return {
    seed: options.seed,
    years,
    histStartYear: isHistReal ? HIST_REAL_START_YEAR + histStart : undefined,
  };
};

export type ScenarioKind = 'pessimistic' | 'median' | 'optimistic';

export interface ScenarioPath {
  readonly kind: ScenarioKind;
  /** Approximate percentile of this path within the sampled set (10 / 50 / 90). */
  readonly percentile: number;
  /** Portfolio balance at the end of the funding horizon for this path. */
  readonly terminalBalance: number;
  readonly path: SamplePath;
}

/**
 * Draw `sampleCount` independent simulated futures and return three representative
 * ones ranked by their ending balance: a pessimistic (≈10th percentile), a median
 * (≈50th) and an optimistic (≈90th) path. Lets the UI label the displayed run so
 * the user knows whether they're looking at a lucky, typical or unlucky future.
 */
export const sampleScenarioPaths = (
  input: MonteCarloInput,
  options: MonteCarloOptions = DEFAULT_MC_OPTIONS,
  sampleCount = 101,
): Record<ScenarioKind, ScenarioPath> => {
  const lastRetirementYear = input.retirementYear + options.retirementHorizon - 1;
  const terminalOf = (path: SamplePath): number => {
    const end = path.years.find((y) => y.year === lastRetirementYear) ?? path.years.at(-1);
    return end?.closingTotal ?? 0;
  };

  const candidates: { terminal: number; path: SamplePath }[] = [];
  for (let s = 0; s < sampleCount; s += 1) {
    const seed = (options.seed + s * 0x9e3779b1) >>> 0;
    const path = sampleMonteCarloPath(input, { ...options, seed });
    candidates.push({ terminal: terminalOf(path), path });
  }
  candidates.sort((a, b) => a.terminal - b.terminal);

  const at = (p: number): { terminal: number; path: SamplePath } => {
    const idx = Math.min(
      candidates.length - 1,
      Math.max(0, Math.round(p * (candidates.length - 1))),
    );
    return candidates[idx]!;
  };
  const pess = at(0.1);
  const med = at(0.5);
  const opt = at(0.9);
  return {
    pessimistic: {
      kind: 'pessimistic',
      percentile: 10,
      terminalBalance: pess.terminal,
      path: pess.path,
    },
    median: { kind: 'median', percentile: 50, terminalBalance: med.terminal, path: med.path },
    optimistic: {
      kind: 'optimistic',
      percentile: 90,
      terminalBalance: opt.terminal,
      path: opt.path,
    },
  };
};

export interface RandomSample {
  /** Illustrative 1-based index of this draw within the full run (derived from the seed). */
  readonly sampleIndex: number;
  /** Approximate percentile of this draw, estimated against a quick reference set. */
  readonly percentile: number;
  /** Portfolio balance at the end of the funding horizon for this path. */
  readonly terminalBalance: number;
  readonly path: SamplePath;
}

/**
 * Draw ONE genuinely random simulated future (by seed) and estimate where it falls
 * versus the run, by ranking its terminal balance against a small reference set.
 * Lets the UI present "sample #X of N" with a representative percentile and a
 * "pick another sample" button, instead of only the three fixed percentile paths.
 */
export const sampleRandomScenario = (
  input: MonteCarloInput,
  options: MonteCarloOptions,
  sampleSeed: number,
  totalRuns: number,
  referenceCount = 200,
): RandomSample => {
  const lastRetirementYear = input.retirementYear + options.retirementHorizon - 1;
  const terminalOf = (path: SamplePath): number => {
    const end = path.years.find((y) => y.year === lastRetirementYear) ?? path.years.at(-1);
    return end?.closingTotal ?? 0;
  };
  const path = sampleMonteCarloPath(input, { ...options, seed: sampleSeed });
  const terminal = terminalOf(path);
  let below = 0;
  for (let s = 1; s <= referenceCount; s += 1) {
    const seed = (sampleSeed + s * 0x9e3779b1) >>> 0;
    const ref = terminalOf(sampleMonteCarloPath(input, { ...options, seed }));
    if (ref < terminal) below += 1;
  }
  const percentile = Math.round((below / referenceCount) * 100);
  const sampleIndex = (sampleSeed % Math.max(1, totalRuns)) + 1;
  return { sampleIndex, percentile, terminalBalance: terminal, path };
};

export type TrialOutcomeCategory =
  | 'largeSurplus'
  | 'comfortable'
  | 'almostMadeIt'
  | 'failedInMiddle';

export interface Trial {
  /** 1-based index of this draw within the sampled set. */
  readonly index: number;
  readonly seed: number;
  readonly funded: boolean;
  readonly terminalBalance: number;
  /** First year the portfolio could not fund what was asked of it, if it ever failed to. */
  readonly dryYear: number | null;
  readonly category: TrialOutcomeCategory;
  readonly path: SamplePath;
  /** Calendar year this trial's historical replay began (historical-real model only). */
  readonly histStartYear?: number;
}

/**
 * Draw `count` independent simulated futures (same resampling technique as
 * `sampleScenarioPaths`) and classify each into one of the four outcome
 * categories shown in the outcome breakdown — split around this sample's own
 * median successful balance / median failure year, same convention as
 * `runMonteCarlo`'s aggregate breakdown. Lets the UI list, sort and drill into
 * every individual trial instead of only three fixed percentile paths.
 */
export const sampleTrials = (
  input: MonteCarloInput,
  options: MonteCarloOptions = DEFAULT_MC_OPTIONS,
  count = 100,
): Trial[] => {
  const lastRetirementYear = input.retirementYear + options.retirementHorizon - 1;
  const terminalOf = (path: SamplePath): number => {
    const end = path.years.find((y) => y.year === lastRetirementYear) ?? path.years.at(-1);
    return end?.closingTotal ?? 0;
  };
  // Funding shortfall, not a zero balance, and over the whole horizon rather than
  // retirement alone — `runMonteCarlo`'s definition exactly, so a trial listed
  // here as funded is one the aggregate also counted as a success.
  const dryYearOf = (path: SamplePath): number | null =>
    path.years.find((y) => y.shortfall && y.year <= lastRetirementYear)?.year ?? null;

  const drafts = Array.from({ length: count }, (_, s) => {
    const seed = (options.seed + s * 0x9e3779b1) >>> 0;
    const path = sampleMonteCarloPath(input, { ...options, seed });
    const dryYear = dryYearOf(path);
    return {
      index: s + 1,
      seed,
      funded: dryYear === null,
      terminalBalance: terminalOf(path),
      dryYear,
      path,
      histStartYear: path.histStartYear,
    };
  });

  const successBalances = drafts
    .filter((d) => d.funded)
    .map((d) => d.terminalBalance)
    .sort((a, b) => a - b);
  const failYears = drafts
    .filter((d) => !d.funded)
    .map((d) => d.dryYear ?? lastRetirementYear)
    .sort((a, b) => a - b);
  const medianSuccessBalance = percentileOf(successBalances, 0.5);
  const medianFailYear = percentileOf(failYears, 0.5);

  return drafts.map((d): Trial => {
    const category: TrialOutcomeCategory = d.funded
      ? d.terminalBalance >= medianSuccessBalance
        ? 'largeSurplus'
        : 'comfortable'
      : (d.dryYear ?? lastRetirementYear) >= medianFailYear
        ? 'almostMadeIt'
        : 'failedInMiddle';
    return { ...d, category };
  });
};

/** Stable key for a holding-pair correlation override (order-independent). */
export const correlationKey = (a: string | undefined, b: string | undefined): string =>
  [a ?? '', b ?? ''].sort().join('|');

/** Build a Monte Carlo input from a plan (drift = CAGR + scenario adj, sigma from the vol table). */
export const buildMonteCarloInput = (
  plan: Plan,
  rates: RatesTable | undefined,
  startYear: number,
  horizonYears: number,
): MonteCarloInput => {
  const values = valueHoldings(plan.holdings, plan.currency, rates);
  const adj = scenarioAdjustmentPts(plan.scenario, plan.scenario.active);
  const volaById = new Map(plan.holdings.map((h) => [h.id, h.volatilityPct]));
  const mcReturnById = new Map(plan.holdings.map((h) => [h.id, h.mcExpectedReturnPct]));

  const expensesIncomes: ExpenseIncome[] = [
    ...(plan.settings.expensesIncomes ?? []),
    ...homeFlows(plan.home, startYear),
    ...rentalPropertiesFlows(plan.properties, startYear, plan.settings.inflationPct),
  ];

  const enriched = values.map((v) => ({
    asset: {
      startValue: v.value,
      // Monte-Carlo-scoped expected-return override if set, otherwise the plan's CAGR.
      driftPct: (mcReturnById.get(v.holdingId) ?? v.baseCagrPct) + adj,
      // Per-holding override if set, otherwise the asset-class/ticker default.
      sigmaPct: volaById.get(v.holdingId) ?? volatilityFor(v.assetClass, v.symbol),
      annualContribution: v.monthlyContribution * 12,
      accountId: v.accountId,
      costBasis: v.costBasis,
      drawable: v.drawable,
      holdingId: v.holdingId,
      symbol: v.symbol,
      assetClass: v.assetClass,
    } satisfies MonteCarloAsset,
    assetClass: v.assetClass,
  }));

  // A non-growing, zero-volatility cash bucket for `'cash'`-mode sale proceeds
  // (mirrors buildProjectionInput). Appended before the correlation matrix so it
  // gets its (uncorrelated) row/column automatically.
  if (expensesIncomes.some((f) => f.reinvest === 'cash')) {
    const cashClass: AssetClass = 'cash';
    enriched.push({
      asset: {
        startValue: 0,
        driftPct: 0,
        sigmaPct: 0,
        annualContribution: 0,
        accountId: null,
        costBasis: 0,
        drawable: true,
        holdingId: CASH_RESERVE_HOLDING_ID,
        symbol: CASH_RESERVE_SYMBOL,
        assetClass: cashClass,
      },
      assetClass: cashClass,
    });
  }

  const overrides = plan.correlationOverrides ?? {};
  const correlation = enriched.map((ei, i) =>
    enriched.map((ej, j) => {
      if (i === j) return 1;
      const ov = overrides[correlationKey(ei.asset.holdingId, ej.asset.holdingId)];
      return ov !== undefined ? ov : classCorrelation(ei.assetClass, ej.assetClass);
    }),
  );

  return {
    assets: enriched.map((e) => e.asset),
    correlation,
    accounts: plan.accounts.map((a) => {
      const residence = plan.residenceCountry ?? 'US';
      const p = accountTaxProfile(a, residence);
      return {
        id: a.id,
        kind: a.kind ?? 'taxable',
        effectiveTaxRate: accountEffectiveRate(a, residence),
        incomeCoef: p.incomeCoef,
        gainsCoef: p.gainsCoef,
        flatRate: p.flatRate,
        withholding: p.withholding,
      };
    }),
    accountOrder: plan.withdrawalOrder,
    annualSpending: plan.settings.annualSpending,
    inflationPct: plan.settings.inflationPct,
    spendingMode: plan.settings.spendingMode,
    phasedSpending: plan.settings.phasedSpending,
    currentAge: plan.settings.currentAge,
    // Home + rental cashflows (purchase/mortgage/ownership/rent/sale) are merged
    // in as flows; the properties are never drawable holdings. Mirrors buildProjectionInput.
    expensesIncomes,
    conversions: plan.settings.conversions,
    rmdEnabled: plan.settings.rmdEnabled,
    rawAccounts: plan.accounts,
    startYear,
    retirementYear: plan.settings.retirementYear,
    horizonYears,
    residence: plan.residenceCountry ?? 'US',
    province: plan.residenceProvince,
    taxFxFactor: bracketFxFactor(plan.residenceCountry ?? 'US', plan.currency, rates),
    growthFade: plan.settings.growthFade,
  };
};
