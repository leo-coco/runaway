import type { Country, Province } from './country';

/**
 * Official tax tables, single filer / 1 part de quotient familial (simplified —
 * not tax advice). Vintage and sources are exported for the transparency UI.
 */

/** Calendar year the bracket tables below were taken from. */
export const TAX_TABLES_YEAR = 2026;

/** Official source of each country's bracket schedule (shown in tooltips). */
export const TAX_TABLE_SOURCES: Record<Country, string> = {
  US: 'IRS Rev. Proc. 2025-32 (tax year 2026, single filer)',
  FR: 'Loi de finances 2026 — barème revenus 2025, 1 part (service-public.gouv.fr)',
  CA: 'CRA 2026 federal brackets + provincial schedules (indexed)',
};

/**
 * Representative flat fallback rate on ordinary income. UI HEADLINE ONLY —
 * the engines always use the progressive brackets below; this single number
 * only feeds the static per-account badge (`accountEffectiveRate`).
 */
export const INCOME_TAX_FLAT: Record<Country, number> = {
  FR: 0.3,
  US: 0.24,
  CA: 0.3,
};

export interface IncomeBracket {
  /** Upper threshold of the bracket (local currency, real terms). */
  readonly upTo: number;
  readonly rate: number;
}

/**
 * US standard deduction, tax year 2026, single filer (Rev. Proc. 2025-32).
 * Baked into the US schedules below by shifting every threshold up by it and
 * adding a 0% band, so ladder(income) = official ladder(income − deduction) —
 * including the case where the unused deduction offsets capital gains.
 */
export const US_STANDARD_DEDUCTION = 16_100;

/**
 * Canada basic personal amounts, tax year 2026, modelled as a 0% band at the
 * bottom of each schedule — exactly equivalent to the real non-refundable
 * credit at the lowest rate. Federal: maximum BPA (the phase-down to $14,829
 * above $181,440 of income is not modelled — worth at most ~$230/yr).
 */
export const CA_FEDERAL_BPA = 16_452;
export const CA_PROVINCIAL_BPA: Record<Exclude<Province, 'OTHER'>, number> = {
  ON: 12_989,
  QC: 18_952,
  BC: 13_216,
  AB: 22_769,
};

/**
 * France: 10% allowance on pensions (kept in LF 2026 — the proposed €2,000
 * flat replacement was rejected), floor/ceiling per the 2026 déclaration.
 * Applied by the engine to all FR ordinary income, which in this planner is
 * pension-like (PER withdrawals, pension/salary flows).
 */
export const FR_PENSION_ALLOWANCE = { rate: 0.1, min: 454, max: 4_439 } as const;

/**
 * Prepend a 0% band of `amount` and shift every threshold up by it: the
 * deduction semantics (taxable income = income − amount). Adjacent 0% bands
 * are merged so schedules stay clean for display.
 */
const shiftBrackets = (schedule: readonly IncomeBracket[], amount: number): IncomeBracket[] => {
  const shifted = [
    { upTo: amount, rate: 0 },
    ...schedule.map((b) => ({
      upTo: b.upTo === Infinity ? Infinity : b.upTo + amount,
      rate: b.rate,
    })),
  ];
  const merged: IncomeBracket[] = [];
  for (const b of shifted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.rate === b.rate) merged[merged.length - 1] = b;
    else merged.push(b);
  }
  return merged;
};

/**
 * Prepend a 0% band of `amount` WITHOUT shifting the other thresholds: the
 * credit semantics (tax = ladder(income) − amount × lowest rate, floored at 0),
 * which is exactly Canada's basic-personal-amount mechanics. Requires `amount`
 * below the schedule's first threshold.
 */
const withZeroBracket = (schedule: readonly IncomeBracket[], amount: number): IncomeBracket[] => [
  { upTo: amount, rate: 0 },
  ...schedule.filter((b) => b.upTo > amount),
];

/**
 * Merge two marginal schedules (e.g. federal + provincial) into one combined
 * schedule: union of thresholds, marginal rates summed on each segment.
 */
export const combineBrackets = (
  a: readonly IncomeBracket[],
  b: readonly IncomeBracket[],
): IncomeBracket[] => {
  const caps = Array.from(new Set([...a, ...b].map((x) => x.upTo))).sort((x, y) => x - y);
  const rateAt = (schedule: readonly IncomeBracket[], cap: number): number =>
    schedule.find((s) => cap <= s.upTo)?.rate ?? schedule[schedule.length - 1]!.rate;
  return caps.map((cap) => ({ upTo: cap, rate: rateAt(a, cap) + rateAt(b, cap) }));
};

/** Scale every marginal rate of a schedule (used for the Québec federal abatement). */
const scaleRates = (schedule: readonly IncomeBracket[], factor: number): IncomeBracket[] =>
  schedule.map((s) => ({ upTo: s.upTo, rate: s.rate * factor }));

/**
 * Canada federal brackets, tax year 2026 (lowest rate 14% since 2026).
 * Source: CRA — 14/20.5/26/29/33%.
 */
export const CA_FEDERAL_BRACKETS: readonly IncomeBracket[] = [
  { upTo: 58_523, rate: 0.14 },
  { upTo: 117_045, rate: 0.205 },
  { upTo: 181_440, rate: 0.26 },
  { upTo: 258_482, rate: 0.29 },
  { upTo: Infinity, rate: 0.33 },
];

/** Provincial schedules, tax year 2026 (indexed; TaxTips.ca / provincial budgets). */
const CA_PROVINCIAL: Record<Exclude<Province, 'OTHER'>, readonly IncomeBracket[]> = {
  // Ontario 2026 — surtaxes (20%/36% above provincial-tax thresholds) NOT modelled;
  // disclosed in the tooltip.
  ON: [
    { upTo: 53_891, rate: 0.0505 },
    { upTo: 107_785, rate: 0.0915 },
    { upTo: 150_000, rate: 0.1116 },
    { upTo: 220_000, rate: 0.1216 },
    { upTo: Infinity, rate: 0.1316 },
  ],
  // Québec 2026. The 16.5% federal abatement is applied to the federal schedule
  // in the combined derivation below.
  QC: [
    { upTo: 54_345, rate: 0.14 },
    { upTo: 108_680, rate: 0.19 },
    { upTo: 132_245, rate: 0.24 },
    { upTo: Infinity, rate: 0.2575 },
  ],
  // British Columbia 2026 (lowest rate 5.6% since 2026).
  BC: [
    { upTo: 50_363, rate: 0.056 },
    { upTo: 100_728, rate: 0.077 },
    { upTo: 115_648, rate: 0.105 },
    { upTo: 140_430, rate: 0.1229 },
    { upTo: 190_405, rate: 0.147 },
    { upTo: 265_545, rate: 0.168 },
    { upTo: Infinity, rate: 0.205 },
  ],
  // Alberta 2026 (8% first bracket since 2025).
  AB: [
    { upTo: 61_200, rate: 0.08 },
    { upTo: 154_259, rate: 0.1 },
    { upTo: 185_111, rate: 0.12 },
    { upTo: 246_813, rate: 0.13 },
    { upTo: 370_220, rate: 0.14 },
    { upTo: Infinity, rate: 0.15 },
  ],
};

export interface ProvinceTaxTable {
  readonly label: string;
  /** Combined federal + provincial marginal schedule (2026). */
  readonly brackets: readonly IncomeBracket[];
}

/**
 * Combined federal + provincial schedules per province. Québec's federal part
 * is reduced by the 16.5% federal abatement (federal rates × 0.835). 'OTHER'
 * uses the Ontario combined table as a representative middle-of-the-pack proxy.
 */
export const CA_PROVINCES_TABLES: Record<Province, ProvinceTaxTable> = (() => {
  // Each side carries its basic personal amount as a 0% band (credit at the
  // lowest rate), then the two marginal schedules are merged as before.
  const fed = withZeroBracket(CA_FEDERAL_BRACKETS, CA_FEDERAL_BPA);
  const prov = (p: Exclude<Province, 'OTHER'>): IncomeBracket[] =>
    withZeroBracket(CA_PROVINCIAL[p], CA_PROVINCIAL_BPA[p]);
  const on = combineBrackets(fed, prov('ON'));
  return {
    ON: { label: 'Ontario', brackets: on },
    QC: {
      label: 'Québec',
      brackets: combineBrackets(scaleRates(fed, 1 - 0.165), prov('QC')),
    },
    BC: {
      label: 'British Columbia',
      brackets: combineBrackets(fed, prov('BC')),
    },
    AB: { label: 'Alberta', brackets: combineBrackets(fed, prov('AB')) },
    OTHER: { label: 'Other (representative)', brackets: on },
  };
})();

/**
 * Progressive income-tax brackets per residence country (tax year 2026,
 * single filer / 1 part). Thresholds are in the local currency and inflated
 * over time by the engine. CA aliases the Ontario combined schedule — callers
 * that know the province should use `bracketsFor` from tax.ts instead.
 */
export const INCOME_BRACKETS: Record<Country, readonly IncomeBracket[]> = {
  FR: [
    { upTo: 11_600, rate: 0 },
    { upTo: 29_579, rate: 0.11 },
    { upTo: 84_577, rate: 0.3 },
    { upTo: 181_917, rate: 0.41 },
    { upTo: Infinity, rate: 0.45 },
  ],
  // Official 2026 single-filer brackets, shifted by the standard deduction —
  // the schedule taxes gross income exactly like the IRS taxes taxable income.
  US: shiftBrackets(
    [
      { upTo: 12_400, rate: 0.1 },
      { upTo: 50_400, rate: 0.12 },
      { upTo: 105_700, rate: 0.22 },
      { upTo: 201_775, rate: 0.24 },
      { upTo: 256_225, rate: 0.32 },
      { upTo: 640_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    US_STANDARD_DEDUCTION,
  ),
  CA: CA_PROVINCES_TABLES.ON.brackets,
};

/**
 * US long-term capital gains brackets, tax year 2026 (single filer). Gains
 * stack ON TOP of ordinary taxable income: the rate for each gain slice is
 * read at (ordinary income + cumulative gains). Shifted by the standard
 * deduction like the income schedule, so both ladders index the same
 * gross-income scale — including the unused deduction offsetting gains when
 * ordinary income is below it. Official thresholds: 0% to 49,450, 15% to
 * 545,500, 20% above.
 */
export const US_LTCG_BRACKETS: readonly IncomeBracket[] = shiftBrackets(
  [
    { upTo: 49_450, rate: 0 },
    { upTo: 545_500, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
  US_STANDARD_DEDUCTION,
);

/**
 * US Net Investment Income Tax: +3.8% on investment income above the MAGI
 * threshold (single). The threshold is statutorily NOT inflation-indexed, so
 * the engine never scales it by the inflation factor.
 */
export const US_NIIT = { rate: 0.038, threshold: 200_000 } as const;

/**
 * Share of a capital gain that is included in ordinary income (and thus taxed
 * progressively). Canada includes 50% (the 2024 two-thirds proposal was
 * cancelled in March 2025); France/US tax gains separately.
 */
export const GAINS_INCLUSION: Record<Country, number> = {
  FR: 0,
  US: 0,
  CA: 0.5,
};

/**
 * Representative tax rate on realised capital gains.
 *  - FR: PFU "flat tax" 2026 — 12.8% income tax + 18.6% social charges
 *    (prélèvements sociaux raised to 18.6% on placement income on 1 Jan 2026)
 *    ≈ 31.4%.
 *  - US: representative long-term rate for the static headline badge ONLY —
 *    the engine uses the progressive 0/15/20% `US_LTCG_BRACKETS` + NIIT.
 *  - CA: 50% inclusion of the gain at the marginal income rate ≈ 15% effective
 *    (headline; the engine uses the true inclusion in the brackets).
 */
export const CAPITAL_GAINS_FLAT: Record<Country, number> = {
  FR: 0.314,
  US: 0.15,
  CA: 0.15,
};

/**
 * Withholding tax applied at source when withdrawing from a FOREIGN account
 * (source country ≠ residence). A single simplified number per (source, kind),
 * credited against the residence tax (capped — see accountEffectiveRate).
 *  - CA tax_deferred: 25% Part XIII non-resident withholding on lump-sum
 *    RRSP/RRIF withdrawals (15% only for periodic RRIF payments under treaty —
 *    disclosed in the tooltip, not modelled).
 */
export const WITHHOLDING: Record<
  Country,
  { tax_deferred: number; taxable: number; tax_free: number }
> = {
  US: { tax_deferred: 0.15, taxable: 0.15, tax_free: 0 },
  CA: { tax_deferred: 0.25, taxable: 0.15, tax_free: 0 },
  FR: { tax_deferred: 0.128, taxable: 0.128, tax_free: 0 },
};

/**
 * Does the residence country recognise the tax-free status of a foreign
 * tax-free wrapper? Treaty-based:
 *  - US Roth stays tax-free for CA residents (treaty Art. XVIII election) and
 *    FR residents (FR-US treaty Art. 18).
 *  - CA TFSA and FR PEA/assurance-vie are NOT recognised abroad — taxed as an
 *    ordinary taxable account by the residence country.
 */
export const TAX_FREE_TREATY_RECOGNITION: Record<Country, Record<Country, boolean>> = {
  US: { US: true, CA: true, FR: true },
  CA: { CA: true, US: false, FR: false },
  FR: { FR: true, US: false, CA: false },
};
