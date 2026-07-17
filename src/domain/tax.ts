import { DEFAULT_PROVINCE, type Country, type Province } from './country';
import {
  CA_PROVINCES_TABLES,
  CAPITAL_GAINS_FLAT,
  FR_PENSION_ALLOWANCE,
  INCOME_BRACKETS,
  US_LTCG_BRACKETS,
  US_NIIT,
  type IncomeBracket,
} from './taxTables';

/**
 * The bracket schedule for a residence. For Canada the combined
 * federal+provincial schedule of the given province is used (default Ontario);
 * the province is ignored for other countries.
 */
export const bracketsFor = (country: Country, province?: Province): readonly IncomeBracket[] =>
  country === 'CA'
    ? CA_PROVINCES_TABLES[province ?? DEFAULT_PROVINCE].brackets
    : INCOME_BRACKETS[country];

/** Progressive ladder walk over a schedule with scaled thresholds. */
const ladder = (
  income: number,
  schedule: readonly IncomeBracket[],
  thresholdScale: number,
): number => {
  if (income <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of schedule) {
    const cap = b.upTo === Infinity ? Infinity : b.upTo * thresholdScale;
    const slice = Math.min(income, cap) - prev;
    if (slice > 0) tax += slice * b.rate;
    prev = cap;
    if (income <= cap) break;
  }
  return tax;
};

/**
 * FR 10% pension allowance (abattement) on ordinary income, with its floor and
 * ceiling scaled like the bracket thresholds. Never exceeds the income itself.
 */
const frAllowance = (income: number, thresholdScale: number): number => {
  if (income <= 0) return 0;
  const a = Math.min(
    Math.max(income * FR_PENSION_ALLOWANCE.rate, FR_PENSION_ALLOWANCE.min * thresholdScale),
    FR_PENSION_ALLOWANCE.max * thresholdScale,
  );
  return Math.min(a, income);
};

/**
 * Ordinary income actually exposed to the brackets. FR applies the 10% pension
 * allowance; the US standard deduction and Canadian basic personal amounts are
 * already baked into their schedules, so income passes through unchanged.
 * Exposed so bracket-table UIs can slice the same base the tax uses.
 */
export const taxableOrdinaryIncome = (
  income: number,
  country: Country,
  thresholdScale = 1,
): number =>
  country === 'FR' ? Math.max(0, income - frAllowance(income, thresholdScale)) : income;

/**
 * Progressive income tax owed on `income` under a country's bracket schedule.
 * Bracket thresholds are scaled by `inflationFactor` so they keep pace with
 * inflated spending (no fake bracket creep — brackets stay constant in real
 * terms), and by `fxFactor` — units of plan currency per unit of the residence
 * country's local currency — so thresholds legislated in EUR/USD/CAD apply
 * correctly to plan-currency amounts. For Canada, `province` selects the
 * combined schedule (default ON). The US standard deduction and Canadian basic
 * personal amounts are built into the schedules; France's 10% pension
 * allowance is applied here.
 */
export const incomeTax = (
  income: number,
  country: Country,
  inflationFactor = 1,
  province?: Province,
  fxFactor = 1,
): number => {
  const scale = inflationFactor * fxFactor;
  return ladder(
    taxableOrdinaryIncome(income, country, scale),
    bracketsFor(country, province),
    scale,
  );
};

/**
 * Tax on realised capital gains of `gains`, given the year's ordinary taxable
 * income (the gains stack on top of it).
 *  - US: progressive LTCG ladder 0/15/20% — each gain slice is priced at
 *    (ordinaryIncome + cumulative gains), i.e. L(ord+gains) − L(ord) with
 *    thresholds inflation- and FX-scaled. The schedule embeds the standard
 *    deduction, so an unused deduction offsets gains automatically. Plus NIIT:
 *    3.8% on the investment income above the 200k MAGI threshold (statutorily
 *    NOT inflation-indexed, but converted into the plan currency).
 *  - Other countries: flat representative rate (FR PFU; CA uses bracket
 *    inclusion in the engine and should not call this).
 * Monotonic (non-decreasing) in both arguments, so gross-up bisection on
 * either input stays valid.
 */
export const capitalGainsTax = (
  gains: number,
  ordinaryIncome: number,
  country: Country,
  inflationFactor = 1,
  fxFactor = 1,
): number => {
  if (gains <= 0) return 0;
  if (country !== 'US') return gains * CAPITAL_GAINS_FLAT[country];
  const scale = inflationFactor * fxFactor;
  const ord = Math.max(0, ordinaryIncome);
  const ltcg = ladder(ord + gains, US_LTCG_BRACKETS, scale) - ladder(ord, US_LTCG_BRACKETS, scale);
  // NIIT applies to the investment income above the MAGI threshold. MAGI is
  // approximated as ordinary income + gains as seen by the engine (disclosed).
  const niit =
    US_NIIT.rate * Math.max(0, Math.min(gains, ord + gains - US_NIIT.threshold * fxFactor));
  return ltcg + niit;
};
