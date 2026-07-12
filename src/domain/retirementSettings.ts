import { DEFAULT_GROWTH_FADE, type GrowthFadeConfig } from './growthFade';
import {
  DEFAULT_PHASED_SPENDING,
  type PhasedSpendingConfig,
  type SpendingMode,
} from './spendingModel';
import type { ExpenseIncome } from './expenseIncome';
import type { ConversionPlan } from './taxAdvantaged';

/** Retirement spending and inflation assumptions. */
export type ExpensePeriod = 'monthly' | 'yearly';

/**
 * Return model used by the Monte Carlo engine:
 *  - `normal`      : lognormal with Gaussian shocks (thin tails).
 *  - `fat-tails`   : Student-t shocks — heavier tails, more extremes both ways.
 *  - `crash-aware` : fat tails + a crash regime where correlations jump toward 1,
 *    volatility spikes and a negative shock hits all risk assets together.
 *  - `bootstrap`        : draws blocks of real historical years per asset class —
 *    keeps sequences, fat tails and crash co-movement, but the series are
 *    standardised so the drift still comes from the user's CAGR ("historical shape").
 *  - `bootstrap-uncentered` : same block-bootstrap mechanics as `bootstrap`, but the
 *    drift is each asset class's own historical average return instead of the
 *    user's CAGR — "historical shape, historical drift" (still randomly resampled
 *    blocks, unlike `historical-real`'s single sequential cohort).
 *  - `historical-real`  : replays the actual nominal returns AND actual inflation of
 *    a real cohort (1928→) sequentially — the drift is history's, not the user's
 *    CAGR; each holding earns its asset-class index return ("historical cycles").
 *  - `historical-real-centered` : same sequential real cohort (same crashes, same
 *    calendar sequence, same real inflation) as `historical-real`, but each year's
 *    return is re-centred so the long-run drift is the user's CAGR instead of
 *    history's — "historical shape, your trend", the cohort counterpart to how
 *    `bootstrap` relates to `bootstrap-uncentered`.
 */
export type MonteCarloModel =
  | 'normal'
  | 'fat-tails'
  | 'crash-aware'
  | 'bootstrap'
  | 'bootstrap-uncentered'
  | 'historical-real'
  | 'historical-real-centered';

export const MONTE_CARLO_MODEL_LABEL: Record<MonteCarloModel, string> = {
  normal: 'Normal',
  'fat-tails': 'Fat tails',
  'crash-aware': 'Crash-aware',
  bootstrap: 'Historical pattern',
  'bootstrap-uncentered': 'Historical pattern (real drift)',
  'historical-real': 'Historical cohort (real drift)',
  'historical-real-centered': 'Historical cohort',
};

export interface RetirementSettings {
  /** Calendar year withdrawals begin. */
  readonly retirementYear: number;
  /** The user's age in the current (projection start) year. 0 = not set. */
  readonly currentAge: number;
  /** Age the plan should fund through (life expectancy). Drives the simulation horizon. */
  readonly lifeExpectancyAge: number;
  /** Annual lifestyle spending in the plan currency (major units). */
  readonly annualSpending: number;
  /** How the user entered spending; storage is always annualized. */
  readonly expensePeriod: ExpensePeriod;
  /** Spending profile over retirement: flat (linear) or Go-Go/Slow-Go/No-Go. */
  readonly spendingMode?: SpendingMode;
  /** Phase boundaries and real decline rates when `spendingMode` is 'phased'. */
  readonly phasedSpending?: PhasedSpendingConfig;
  /** Cashflows tied to specific year(s) — one-off or recurring (home purchase/sale, inheritance, tuition, pension…). */
  readonly expensesIncomes?: readonly ExpenseIncome[];
  /** Scheduled tax-deferred → tax-free conversions / meltdown (US/CA). */
  readonly conversions?: readonly ConversionPlan[];
  /** Apply required minimum distributions (US RMD / Canada RRIF). Default true. */
  readonly rmdEnabled?: boolean;
  /** Annual inflation rate as a percent (e.g. 4 = 4%). Set 0 for no inflation. */
  readonly inflationPct: number;
  /** Return model for the Monte Carlo simulation. Defaults to bootstrap (historical pattern). */
  readonly monteCarloModel?: MonteCarloModel;
  /**
   * Fixed cohort start year for the `historical-real` / `historical-real-centered`
   * models (e.g. 1966, 2000, 1929) — every path replays the same real sequence
   * from that year instead of each path drawing its own random start. Only used
   * when `monteCarloModel` is one of those two; undefined means each path still
   * picks a random start year.
   */
  readonly histStartYear?: number;
  /**
   * Overlay the Bitcoin 4-year halving cycle on any BTC holding: explosive
   * post-halving years followed by a bear year, anchored to your CAGR with a
   * diminishing amplitude. Combines with the chosen return model. Off by default.
   */
  readonly btcHalvingCycle?: boolean;
  /**
   * Optional decay of high expected CAGRs toward a mature market rate over time
   * (no single name compounds at a hyper-growth rate forever). Applies to both
   * the projection and the Monte Carlo engine. Off by default.
   */
  readonly growthFade?: GrowthFadeConfig;
  /**
   * Number of simulated paths per Monte Carlo run. Higher counts smooth the tail
   * percentiles at the cost of a slower run. Defaults to 5,000; see
   * `MC_ITERATIONS_MAX` for the ceiling (more paths buy negligible extra precision).
   */
  readonly monteCarloIterations?: number;
}

/**
 * Bounds for the "number of simulations" input. Above the max, extra paths
 * smooth the tail percentiles by a negligible amount for a much slower run.
 */
export const MC_ITERATIONS_MIN = 500;
export const MC_ITERATIONS_MAX = 5_000;
export const MC_ITERATIONS_STEP = 500;

export const DEFAULT_RETIREMENT_SETTINGS: RetirementSettings = {
  retirementYear: new Date().getFullYear() + 7,
  currentAge: 40,
  lifeExpectancyAge: 95,
  annualSpending: 60_000,
  expensePeriod: 'yearly',
  spendingMode: 'linear',
  phasedSpending: DEFAULT_PHASED_SPENDING,
  inflationPct: 4,
  monteCarloModel: 'bootstrap',
  btcHalvingCycle: false,
  growthFade: DEFAULT_GROWTH_FADE,
};

export const monthlyEquivalent = (annual: number): number => annual / 12;

/**
 * Age the user will be in a given calendar year, derived from their current age
 * at the projection's base year. Returns null when the age is unknown (0).
 */
export const ageInYear = (currentAge: number, baseYear: number, year: number): number | null => {
  if (!currentAge || currentAge <= 0) return null;
  return currentAge + (year - baseYear);
};

/**
 * Calendar year the user reaches `lifeExpectancyAge`, i.e. the last year the plan
 * must fund. Derived from their current age at the projection base year. When the
 * current age is unknown (0), the age is treated as years from the base year.
 */
export const lifeExpectancyYear = (
  currentAge: number,
  baseYear: number,
  lifeExpectancyAge: number,
): number => baseYear + (lifeExpectancyAge - (currentAge > 0 ? currentAge : 0));

/**
 * The life-expectancy age implied by ending the plan in `endYear`. Inverse of
 * {@link lifeExpectancyYear}.
 */
export const ageForEndYear = (currentAge: number, baseYear: number, endYear: number): number =>
  (currentAge > 0 ? currentAge : 0) + (endYear - baseYear);
