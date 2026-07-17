import type { Account, AccountKind } from './account';
import type { Country, Province } from './country';
import { effectiveTaxRate } from './account';
import { accountTaxAtSpending, type TaxBracketRow } from './accountTaxRate';
import { CAPITAL_GAINS_FLAT, TAX_FREE_TREATY_RECOGNITION, US_NIIT } from './taxTables';

/**
 * A single line in the human-readable derivation of an account's effective
 * withdrawal tax rate. `key` is an i18n key under `taxExplain.*`; `vars` are the
 * interpolation values (country codes and account kinds are resolved to labels
 * by the UI, percentages are pre-rounded).
 */
export interface TaxExplainStep {
  readonly key: string;
  readonly vars?: Record<string, string | number>;
}

export interface TaxExplanation {
  readonly steps: readonly TaxExplainStep[];
  /** The final effective rate as a percent (matches the figure shown on the card). */
  readonly effectivePct: number;
  /**
   * Present for progressive (bracketed) accounts: the actual gross-up at the
   * user's spending level, so the UI can show the bracket-by-bracket table. The
   * money amounts are in the plan currency and formatted by the UI.
   */
  readonly calc?: {
    readonly net: number;
    readonly gross: number;
    readonly tax: number;
    readonly ordinaryIncome: number;
    readonly brackets: readonly TaxBracketRow[];
    /** US LTCG: gains stacked above ordinary income, split by ladder bracket. */
    readonly gainsIncome: number;
    readonly ltcgBrackets: readonly TaxBracketRow[];
    /** US Net Investment Income Tax owed on the gains (0 elsewhere). */
    readonly niitTax: number;
  };
}

/** Fraction (0.247) → rounded percent (24.7). */
const pct = (f: number): number => Math.round(f * 1000) / 10;

/**
 * Explain, step by step, how an account's effective withdrawal rate is reached
 * given the plan's tax residence and the annual spending level. For ordinary-
 * income (tax-deferred) withdrawals, Canadian capital gains, and the US LTCG
 * ladder the rate is PROGRESSIVE — it depends on how much is withdrawn — so the
 * derivation shows the gross-up and the bracket-by-bracket split at the given
 * `netSpending`. For flat regimes (FR capital gains, manual, tax-free) it shows
 * the closed-form rate.
 */
export const explainEffectiveRate = (
  account: Account,
  residence: Country,
  netSpending: number,
  /** Live gain fraction (value−basis)/value from the holdings; overrides the static share. */
  gainFractionOverride?: number,
  /** Canadian province for the combined bracket schedule (default ON). */
  province?: Province,
  /** Plan-currency units per residence-currency unit (bracket FX scaling). */
  fxFactor = 1,
): TaxExplanation => {
  const steps: TaxExplainStep[] = [];

  // Manual mode: a flat rate the user typed, scaled by the taxable base.
  if (account.taxMode !== 'auto') {
    const effectivePct = pct(effectiveTaxRate(account));
    steps.push({
      key: 'manual',
      vars: { taxRate: account.taxRatePct, base: account.taxableBasePct, result: effectivePct },
    });
    return { steps, effectivePct };
  }

  const breakdown = accountTaxAtSpending(
    account,
    residence,
    netSpending,
    gainFractionOverride,
    province,
    fxFactor,
  );
  const effectivePct = pct(breakdown.effective);

  const kind: AccountKind = account.kind ?? 'taxable';
  const source = account.sourceCountry ?? residence;
  const atHome = source === residence;
  const foreign = !atHome;
  // Gain share shown: the live fraction when provided, else the static cost basis.
  const gain =
    gainFractionOverride !== undefined
      ? Math.round(Math.min(1, Math.max(0, gainFractionOverride)) * 100)
      : Math.max(0, 100 - (account.costBasisPct ?? 0));
  const costBasis = 100 - gain;

  steps.push({ key: 'context', vars: { kind, source, residence } });

  // Foreign tax-free wrapper whose status a treaty preserves (US Roth for CA/FR).
  if (kind === 'tax_free' && foreign && TAX_FREE_TREATY_RECOGNITION[source][residence]) {
    steps.push({ key: 'freeTreaty', vars: { source, residence } });
    return { steps, effectivePct };
  }

  // Home-country special rate (assurance-vie, PEE, PEA social charges…) on the gain.
  if (account.reducedRatePct != null && atHome) {
    steps.push({
      key: 'reduced',
      vars: { rate: account.reducedRatePct, gain, result: effectivePct },
    });
    return { steps, effectivePct };
  }

  // Foreign withholding higher than residence tax: it binds, the rate is flat.
  if (breakdown.withholdingBinds) {
    steps.push({ key: 'withholding', vars: { source, rate: pct(breakdown.withholding) } });
    steps.push({ key: 'withholdingDominates', vars: { rate: pct(breakdown.withholding) } });
    return { steps, effectivePct };
  }

  // Progressive (bracketed) residence tax — the rate depends on the amount drawn.
  if (breakdown.brackets.length > 0 || breakdown.ltcgBrackets.length > 0) {
    if (kind === 'tax_deferred') {
      steps.push({ key: 'deferredIntro', vars: { residence } });
    } else {
      steps.push({ key: 'gainPortion', vars: { costBasis, gain } });
      steps.push({ key: 'dynamicBasis' });
      if (breakdown.gainsCoef > 0) {
        // US LTCG ladder: gains stack above ordinary income at 0/15/20%.
        steps.push({ key: 'ltcgIntro', vars: { gain } });
        if (breakdown.niitTax > 0) {
          steps.push({
            key: 'niit',
            vars: { rate: pct(US_NIIT.rate), threshold: US_NIIT.threshold.toLocaleString() },
          });
        }
      } else {
        steps.push({ key: 'gainInclusion', vars: { coef: pct(breakdown.incomeCoef) } });
      }
    }
    if (foreign && breakdown.withholding > 0) {
      steps.push({
        key: 'withholdingCredited',
        vars: { source, rate: pct(breakdown.withholding) },
      });
    }
    return {
      steps,
      effectivePct,
      calc: {
        net: breakdown.net,
        gross: breakdown.gross,
        tax: breakdown.tax,
        ordinaryIncome: breakdown.ordinaryIncome,
        brackets: breakdown.brackets,
        gainsIncome: breakdown.gainsIncome,
        ltcgBrackets: breakdown.ltcgBrackets,
        niitTax: breakdown.niitTax,
      },
    };
  }

  // Flat residence tax (FR capital gains, or tax-free).
  if (kind === 'taxable' || (kind === 'tax_free' && foreign)) {
    steps.push({ key: 'gainPortion', vars: { costBasis, gain } });
    steps.push({ key: 'dynamicBasis' });
    steps.push({
      key: 'capitalGains',
      vars: { cg: pct(CAPITAL_GAINS_FLAT[residence]), gain, result: pct(breakdown.flatRate) },
    });
  } else if (kind === 'tax_free') {
    steps.push({ key: 'freeHome', vars: { residence } });
  }

  if (foreign && breakdown.withholding > 0) {
    steps.push({ key: 'withholdingCredited', vars: { source, rate: pct(breakdown.withholding) } });
  }
  steps.push({ key: 'final', vars: { result: effectivePct } });
  return { steps, effectivePct };
};
