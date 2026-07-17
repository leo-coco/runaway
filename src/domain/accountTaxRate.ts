import type { Account } from './account';
import { accountTaxProfile } from './account';
import type { Country, Province } from './country';
import { bracketsFor, capitalGainsTax, incomeTax, taxableOrdinaryIncome } from './tax';
import { US_LTCG_BRACKETS, US_NIIT, type IncomeBracket } from './taxTables';

/**
 * One progressive bracket slice consumed by an account's ordinary-income
 * withdrawal: `amount` of income taxed at `rate`, owing `tax`.
 */
export interface TaxBracketRow {
  readonly rate: number;
  readonly amount: number;
  readonly tax: number;
}

/**
 * The engine-faithful tax outcome of funding a `net` withdrawal entirely from one
 * account in a single year, using the SAME profile + progressive brackets the
 * Monte Carlo / projection engine uses (see `withdrawNet`). This is what makes the
 * effective rate depend on the spending level for ordinary-income (tax-deferred)
 * withdrawals, Canadian capital gains, and the US LTCG ladder.
 *
 * NOTE: the derivation starts from a ZERO ordinary-income base (no pension/RMD
 * stacking) — it illustrates this account in isolation; the engine itself stacks
 * withdrawals on the year's other income. Disclosed in the tooltip.
 */
export interface AccountTaxBreakdown {
  readonly net: number;
  readonly gross: number;
  readonly tax: number;
  /** Effective rate as a fraction (tax / gross). */
  readonly effective: number;
  readonly incomeCoef: number;
  /** Portion of the gross entering the US LTCG ladder (0 elsewhere). */
  readonly gainsCoef: number;
  readonly flatRate: number;
  readonly withholding: number;
  /** Portion of the gross that flows into ordinary income (taxed by brackets). */
  readonly ordinaryIncome: number;
  /** Portion of the gross that flows into the capital-gains ladder (US). */
  readonly gainsIncome: number;
  /** Per-bracket split of `ordinaryIncome` (empty when no progressive tax applies). */
  readonly brackets: readonly TaxBracketRow[];
  /** Per-bracket split of `gainsIncome` over the US LTCG ladder (empty elsewhere). */
  readonly ltcgBrackets: readonly TaxBracketRow[];
  /** US Net Investment Income Tax owed on the gains (0 elsewhere / below threshold). */
  readonly niitTax: number;
  /** True when the progressive (bracketed) tax is what determines the rate. */
  readonly progressive: boolean;
  /** True when foreign withholding is higher than the residence tax (so it binds). */
  readonly withholdingBinds: boolean;
}

const clamp99 = (r: number): number => Math.min(Math.max(Number.isFinite(r) ? r : 0, 0), 0.99);

/**
 * Slice `amount` of income across `schedule`, starting at income level `from`.
 * `scale` multiplies the thresholds (FX conversion into the plan currency).
 */
const sliceRows = (
  from: number,
  amount: number,
  schedule: readonly IncomeBracket[],
  scale = 1,
): TaxBracketRow[] => {
  const rows: TaxBracketRow[] = [];
  const to = from + amount;
  let prev = 0;
  for (const b of schedule) {
    const cap = b.upTo === Infinity ? Infinity : b.upTo * scale;
    const lo = Math.max(prev, from);
    const hi = cap === Infinity ? to : Math.min(to, cap);
    const slice = Math.max(0, hi - lo);
    if (slice > 0) rows.push({ rate: b.rate, amount: slice, tax: slice * b.rate });
    prev = cap;
    if (to <= cap) break;
  }
  return rows;
};

/**
 * Per-bracket split of the ordinary income actually exposed to the schedule
 * (after the FR pension allowance — the US deduction and CA basic amounts are
 * 0% bands inside the schedules), so the rows always sum to the income tax.
 */
const bracketRows = (
  ordinaryIncome: number,
  residence: Country,
  province?: Province,
  fx = 1,
): TaxBracketRow[] =>
  sliceRows(
    0,
    taxableOrdinaryIncome(ordinaryIncome, residence, fx),
    bracketsFor(residence, province),
    fx,
  );

export const accountTaxAtSpending = (
  account: Account,
  residence: Country,
  net: number,
  /** Live gain fraction (value−basis)/value; overrides the static cost-basis share. */
  gainFractionOverride?: number,
  /** Canadian province for the combined bracket schedule (default ON). */
  province?: Province,
  /** Plan-currency units per residence-currency unit (bracket FX scaling). */
  fxFactor = 1,
): AccountTaxBreakdown => {
  const p = accountTaxProfile(account, residence, gainFractionOverride);
  const incomeCoef = Math.max(p.incomeCoef, 0);
  const gainsCoef = Math.max(p.gainsCoef, 0);
  const flatRate = clamp99(p.flatRate);
  const withholding = clamp99(p.withholding);

  const empty = {
    net: Math.max(0, net),
    incomeCoef,
    gainsCoef,
    flatRate,
    withholding,
    ordinaryIncome: 0,
    gainsIncome: 0,
    brackets: [] as TaxBracketRow[],
    ltcgBrackets: [] as TaxBracketRow[],
    niitTax: 0,
  };

  if (net <= 0) {
    return {
      ...empty,
      gross: 0,
      tax: 0,
      effective: 0,
      progressive: false,
      withholdingBinds: false,
    };
  }

  // Flat bucket (FR capital-gains flat, manual, or tax-free): closed-form gross-up.
  if (incomeCoef <= 0 && gainsCoef <= 0) {
    const eff = Math.max(flatRate, withholding);
    const gross = net / (1 - eff);
    return {
      ...empty,
      gross,
      tax: gross - net,
      effective: eff,
      progressive: false,
      withholdingBinds: withholding > flatRate,
    };
  }

  // Progressive bucket: bisection on gross (net is monotonic increasing in gross),
  // mirroring the engine's per-bucket settlement with a zero starting income base.
  const netFromGross = (g: number): number => {
    const ord = g * incomeCoef;
    const residenceTax =
      incomeTax(ord, residence, 1, province, fxFactor) +
      capitalGainsTax(g * gainsCoef, ord, residence, 1, fxFactor) +
      g * flatRate;
    const tax = Math.max(residenceTax, g * withholding);
    return g - tax;
  };
  let lo = net;
  let hi = net * 2 + 1;
  while (netFromGross(hi) < net && hi < net * 1000) hi *= 1.5;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (netFromGross(mid) < net) lo = mid;
    else hi = mid;
  }
  const gross = hi;
  const ordinaryIncome = gross * incomeCoef;
  const gainsIncome = gross * gainsCoef;
  const incTax = incomeTax(ordinaryIncome, residence, 1, province, fxFactor);
  const cgTax = capitalGainsTax(gainsIncome, ordinaryIncome, residence, 1, fxFactor);
  const residenceTax = incTax + cgTax + gross * flatRate;
  const withholdingTax = gross * withholding;
  const withholdingBinds = withholdingTax > residenceTax;
  const tax = Math.max(residenceTax, withholdingTax);
  // NIIT share of the gains tax, for display (US only).
  const niitTax =
    residence === 'US' && gainsIncome > 0
      ? US_NIIT.rate *
        Math.max(
          0,
          Math.min(gainsIncome, ordinaryIncome + gainsIncome - US_NIIT.threshold * fxFactor),
        )
      : 0;

  return {
    ...empty,
    gross,
    tax,
    effective: tax / gross,
    ordinaryIncome,
    gainsIncome,
    niitTax: withholdingBinds ? 0 : niitTax,
    brackets: withholdingBinds ? [] : bracketRows(ordinaryIncome, residence, province, fxFactor),
    ltcgBrackets:
      withholdingBinds || gainsIncome <= 0
        ? []
        : sliceRows(ordinaryIncome, gainsIncome, US_LTCG_BRACKETS, fxFactor),
    progressive: !withholdingBinds,
    withholdingBinds,
  };
};
