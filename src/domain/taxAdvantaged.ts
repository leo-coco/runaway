import type { AccountKind } from './account';
import type { Country } from './country';

/**
 * Tax-advantaged-account events that move money between account kinds or force
 * taxable withdrawals, independent of lifestyle spending:
 *
 *  - **Conversions / meltdown** — voluntarily move money from a tax-deferred
 *    account to a tax-free one (US Roth conversion) or simply draw a deferred
 *    account down early (Canada RRSP/RRIF "meltdown"). Taxed as ordinary income
 *    in the year, but shrinks future forced withdrawals.
 *  - **RMD (required minimum distribution)** — a government-mandated minimum
 *    withdrawal from tax-deferred accounts past a start age (US 73, Canada RRIF
 *    from 72). Forced taxable income whether or not it is needed for spending.
 *
 * France has no RMD and no Roth-style conversion, so these apply only to US and
 * Canadian residents.
 */

/** A scheduled conversion / meltdown from a tax-deferred account to another account. */
export interface ConversionPlan {
  readonly id: string;
  /** Source account (tax-deferred). */
  readonly fromAccountId: string;
  /** Destination account (ideally tax-free; for a CA meltdown, a taxable account). */
  readonly toAccountId: string;
  /** Annual amount to convert, in today's money. */
  readonly annualAmount: number;
  /** Age the conversions start (inclusive). */
  readonly startAge: number;
  /** Age the conversions end (inclusive). */
  readonly endAge: number;
}

/** Age at which mandatory withdrawals begin, by residence (none for FR). */
export const RMD_START_AGE: Partial<Record<Country, number>> = {
  US: 73,
  CA: 72,
};

/**
 * RMD start age adjusted for the account holder's birth year (SECURE 2.0):
 * US residents born 1960 or later start at 75 (from 2033); born before 1960
 * start at 73. Canada: RRIF minimums start at 72 (the RRSP must convert to a
 * RRIF by the end of the year the holder turns 71 — the first mandatory
 * minimum falls the following year). Unknown birth year falls back to the
 * legacy table.
 */
export const rmdStartAge = (residence: Country, birthYear?: number | null): number | undefined => {
  const base = RMD_START_AGE[residence];
  if (base === undefined) return undefined;
  if (residence === 'US' && birthYear != null && birthYear >= 1960) return 75;
  return base;
};

/**
 * US Uniform Lifetime Table — distribution period (divisor) by age. RMD =
 * balance / divisor. Simplified/representative (2022+ table).
 */
const US_RMD_DIVISOR: Record<number, number> = {
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
  106: 4.3,
  107: 4.1,
  108: 3.9,
  109: 3.7,
  110: 3.5,
};

/** Canada RRIF prescribed minimum withdrawal factor (fraction) by age, 72+. */
const CA_RRIF_FACTOR: Record<number, number> = {
  72: 0.054,
  73: 0.0553,
  74: 0.0567,
  75: 0.0582,
  76: 0.0598,
  77: 0.0617,
  78: 0.0636,
  79: 0.0658,
  80: 0.0682,
  81: 0.0708,
  82: 0.0738,
  83: 0.0771,
  84: 0.0808,
  85: 0.0851,
  86: 0.0899,
  87: 0.0955,
  88: 0.1021,
  89: 0.1099,
  90: 0.1192,
  91: 0.1306,
  92: 0.1449,
  93: 0.1634,
  94: 0.1879,
  95: 0.2,
};

const lookupDescending = (table: Record<number, number>, age: number): number | undefined => {
  if (table[age] !== undefined) return table[age];
  // Past the last tabulated age, hold the highest available value.
  const ages = Object.keys(table).map(Number);
  const max = Math.max(...ages);
  return age > max ? table[max] : undefined;
};

/**
 * Fraction of the tax-deferred balance that must be withdrawn this year as an RMD.
 * Returns 0 when the residence has no RMD or the age is below the start age
 * (which for US residents depends on the birth year — SECURE 2.0).
 */
export const rmdFraction = (residence: Country, age: number, birthYear?: number | null): number => {
  const start = rmdStartAge(residence, birthYear);
  if (start === undefined || age < start) return 0;
  if (residence === 'US') {
    const divisor = lookupDescending(US_RMD_DIVISOR, age);
    return divisor && divisor > 0 ? 1 / divisor : 0;
  }
  if (residence === 'CA') {
    return lookupDescending(CA_RRIF_FACTOR, age) ?? 0;
  }
  return 0;
};

/** Minimal mutable view of a holding the forced-flow engine operates on. */
export interface FlowAsset {
  value: number;
  readonly accountId: string | null;
  /** Cost basis, moved/scaled alongside value so gain tracking stays consistent. */
  basis?: number;
  /** False = illiquid: excluded from every forced flow, like it is from withdrawals. */
  readonly drawable?: boolean;
}

export interface ForcedFlowsResult {
  /** Ordinary income from conversions this year (taxable, stacks in brackets). */
  readonly conversionIncome: number;
  /** Gross RMD withdrawn this year (taxable ordinary income, removed from deferred). */
  readonly rmdGross: number;
}

const ZERO: ForcedFlowsResult = { conversionIncome: 0, rmdGross: 0 };

/**
 * Drawable tax-deferred balance of `assets`. Callers snapshot this BEFORE the
 * year's growth and pass it back as {@link applyForcedFlows}'s `rmdBase`: the
 * divisor applies to the prior 31 December balance, which is exactly the current
 * year's pre-growth opening balance.
 */
export const deferredBalance = (
  assets: readonly FlowAsset[],
  kindOf: (accountId: string | null) => AccountKind | undefined,
): number =>
  assets.reduce(
    (s, a) =>
      a.drawable !== false && kindOf(a.accountId) === 'tax_deferred' && a.value > 0
        ? s + a.value
        : s,
    0,
  );

/**
 * Apply the RMD then conversions to the holdings for one year, mutating `assets`:
 *  1. The RMD removes `rmdFraction × rmdBase` pro-rata from tax-deferred holdings
 *     (the engine turns that gross into net cash and taxes it).
 *  2. Each active conversion moves its (inflated) amount from the source account's
 *     holdings (pro-rata) into the first holding of the destination account.
 *
 * The RMD settles FIRST, on a base the conversion cannot touch: an RMD is not
 * eligible for rollover, so the first dollars leaving the account must satisfy it
 * and no conversion can shrink the same year's requirement. Converting first would
 * understate the RMD — a bias in favour of the very strategy conversions exist to
 * evaluate.
 *
 * Only a tax-deferred source may be converted: a stale plan pointing at an account
 * whose kind has since changed is skipped, not taxed as ordinary income.
 *
 * Illiquid holdings (`drawable: false`) are excluded from both flows, and from the
 * RMD base: the user marked them never-sell, and a real RMD can be taken in kind.
 *
 * Returns the ordinary-income amounts so the caller can settle tax and cash.
 */
export const applyForcedFlows = (
  assets: FlowAsset[],
  kindOf: (accountId: string | null) => AccountKind | undefined,
  opts: {
    readonly residence: Country;
    readonly age: number | null;
    /** Birth year, when known — drives the US RMD start age (SECURE 2.0). */
    readonly birthYear?: number | null;
    readonly rmdEnabled: boolean;
    readonly conversions: readonly ConversionPlan[];
    readonly inflationFactor: number;
    /**
     * Prior 31 December drawable tax-deferred balance (see {@link deferredBalance}).
     * Omitted: the current post-growth balance is used instead.
     */
    readonly rmdBase?: number;
  },
): ForcedFlowsResult => {
  const { residence, age, birthYear, rmdEnabled, conversions, inflationFactor, rmdBase } = opts;
  if (age === null || age <= 0) return ZERO;

  // 1) RMD: force a minimum withdrawal from tax-deferred holdings.
  let rmdGross = 0;
  if (rmdEnabled) {
    const fraction = rmdFraction(residence, age, birthYear);
    if (fraction > 0) {
      const deferred = assets.filter(
        (a) => a.drawable !== false && kindOf(a.accountId) === 'tax_deferred' && a.value > 0,
      );
      const available = deferred.reduce((s, a) => s + a.value, 0);
      // The requirement is set by last year's close, but the account can only
      // deliver what it holds today (a crash year can leave it short).
      const required = Math.min((rmdBase ?? available) * fraction, available);
      if (required > 0) {
        const sold = required / available;
        for (const h of deferred) {
          if (h.basis !== undefined) h.basis *= 1 - sold;
          h.value -= required * (h.value / available);
        }
        rmdGross = required;
      }
    }
  }

  // 2) Conversions / meltdown: move principal between accounts.
  let conversionIncome = 0;
  for (const plan of conversions) {
    if (age < plan.startAge || age > plan.endAge) continue;
    if (kindOf(plan.fromAccountId) !== 'tax_deferred') continue;
    // The destination account must hold at least one asset to receive the
    // principal. Otherwise skip the conversion entirely — moving money into a
    // holding-less account would silently vanish it (and tax it on top).
    const dest = assets.find((a) => a.drawable !== false && a.accountId === plan.toAccountId);
    if (!dest) continue;
    const target = plan.annualAmount * inflationFactor;
    const fromHoldings = assets.filter(
      (a) => a.drawable !== false && a.accountId === plan.fromAccountId && a.value > 0,
    );
    const fromBalance = fromHoldings.reduce((s, a) => s + a.value, 0);
    const moved = Math.min(target, fromBalance);
    if (moved <= 0) continue;
    const sold = moved / fromBalance;
    for (const h of fromHoldings) {
      if (h.basis !== undefined) h.basis *= 1 - sold;
      h.value -= moved * (h.value / fromBalance);
    }
    dest.value += moved;
    // The converted (already-taxed) principal becomes fresh basis at destination.
    if (dest.basis !== undefined) dest.basis += moved;
    conversionIncome += moved;
  }

  return { conversionIncome, rmdGross };
};
