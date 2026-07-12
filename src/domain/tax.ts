import { DEFAULT_PROVINCE, type Country, type Province } from './country';
import {
  CA_PROVINCES_TABLES,
  CAPITAL_GAINS_FLAT,
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

/** Progressive ladder walk over a schedule with inflation-scaled thresholds. */
const ladder = (
  income: number,
  schedule: readonly IncomeBracket[],
  inflationFactor: number,
): number => {
  if (income <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of schedule) {
    const cap = b.upTo === Infinity ? Infinity : b.upTo * inflationFactor;
    const slice = Math.min(income, cap) - prev;
    if (slice > 0) tax += slice * b.rate;
    prev = cap;
    if (income <= cap) break;
  }
  return tax;
};

/**
 * Progressive income tax owed on `income` under a country's bracket schedule.
 * Bracket thresholds are scaled by `inflationFactor` so they keep pace with
 * inflated spending (no fake bracket creep — brackets stay constant in real
 * terms). For Canada, `province` selects the combined schedule (default ON).
 */
export const incomeTax = (
  income: number,
  country: Country,
  inflationFactor = 1,
  province?: Province,
): number => ladder(income, bracketsFor(country, province), inflationFactor);

/**
 * Tax on realised capital gains of `gains`, given the year's ordinary taxable
 * income (the gains stack on top of it).
 *  - US: progressive LTCG ladder 0/15/20% — each gain slice is priced at
 *    (ordinaryIncome + cumulative gains), i.e. L(ord+gains) − L(ord) with
 *    thresholds inflation-scaled — plus NIIT: 3.8% on the investment income
 *    above the 200k MAGI threshold (statutorily NOT inflation-indexed).
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
): number => {
  if (gains <= 0) return 0;
  if (country !== 'US') return gains * CAPITAL_GAINS_FLAT[country];
  const ord = Math.max(0, ordinaryIncome);
  const ltcg =
    ladder(ord + gains, US_LTCG_BRACKETS, inflationFactor) -
    ladder(ord, US_LTCG_BRACKETS, inflationFactor);
  // NIIT applies to the investment income above the MAGI threshold. MAGI is
  // approximated as ordinary income + gains as seen by the engine (disclosed).
  const niit = US_NIIT.rate * Math.max(0, Math.min(gains, ord + gains - US_NIIT.threshold));
  return ltcg + niit;
};
