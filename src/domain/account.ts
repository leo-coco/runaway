import { newId } from '@/lib/id';
import type { Country } from './country';
import {
  CAPITAL_GAINS_FLAT,
  GAINS_INCLUSION,
  INCOME_TAX_FLAT,
  TAX_FREE_TREATY_RECOGNITION,
  WITHHOLDING,
} from './taxTables';

/** How withdrawals from an account are taxed. */
export type AccountKind = 'tax_deferred' | 'tax_free' | 'taxable';

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  tax_deferred: 'Tax-deferred',
  tax_free: 'Tax-free',
  taxable: 'Taxable',
};

/**
 * A tax envelope / account that holdings can be grouped into (e.g. TFSA/CELI,
 * RRSP/REER, a taxable non-registered account, PER, PEA).
 *
 * Two modes:
 *  - `manual`: the effective rate is `taxRatePct × taxableBasePct` (legacy, and a
 *    safety valve for edge cases like a French PEA's 17.2% social charges).
 *  - `auto`:   the rate is derived from the account `kind` + its `sourceCountry`
 *    + the plan's tax residence, with foreign withholding credited.
 */
export interface Account {
  readonly id: string;
  readonly name: string;
  /** Marginal tax rate applied to the taxable portion of a withdrawal (percent). */
  readonly taxRatePct: number;
  /** Inclusion rate: the portion of a withdrawal that is taxable (percent). */
  readonly taxableBasePct: number;
  /** Tax treatment of the account (auto mode). */
  readonly kind?: AccountKind;
  /** Country where the account is held. */
  readonly sourceCountry?: Country;
  /** `manual` keeps the legacy flat rate; `auto` derives it from kind + residence. */
  readonly taxMode?: 'manual' | 'auto';
  /** Cost-basis share of a taxable account (percent). Gain = 1 − basis. */
  readonly costBasisPct?: number;
  /**
   * Home-country special flat tax rate (percent) for favourable envelopes whose
   * treatment doesn't fit the 3 kinds — e.g. France assurance-vie (~24.7%) or PEE
   * (17.2% social charges). Applies only when the account is held in the country
   * of residence; abroad it falls back to the normal kind rules.
   */
  readonly reducedRatePct?: number;
  /**
   * `true` for a blank/custom account (fully editable). Preset accounts (PER,
   * PEA, 401k…) are `false` — their type is known and locked.
   */
  readonly custom?: boolean;
  /**
   * `true` for the auto-managed "Illiquid assets" bucket that holds non-drawable
   * custom assets (a home, a car). It is NOT a tax envelope: illiquid holdings are
   * excluded from every withdrawal/RMD/reinvestment flow, so its tax fields never
   * bite. It is created and pruned automatically and must be kept out of the
   * withdrawal order, the accounts editor, and the account-count quota.
   */
  readonly illiquid?: boolean;
}

/** Legacy manual effective tax rate on a withdrawal, as a fraction in [0, 1). */
export const effectiveTaxRate = (
  account: Pick<Account, 'taxRatePct' | 'taxableBasePct'>,
): number => {
  const rate = (account.taxRatePct / 100) * (account.taxableBasePct / 100);
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.min(rate, 0.99);
};

const clampRate = (r: number): number => Math.min(Math.max(Number.isFinite(r) ? r : 0, 0), 0.99);

/**
 * Foreign withholding expressed as a rate on the GROSS withdrawal — the shape
 * every consumer applies it in (`gross × withholding`). A tax-deferred
 * withdrawal is income in full, so the treaty rate bites on all of it. For a
 * gain-taxed bucket the withheld income is only the gain share: a sale returns
 * the investor's own basis, which no treaty taxes.
 */
const withholdingOnGross = (
  source: Country,
  residence: Country,
  kind: AccountKind,
  gainFraction: number,
): number => {
  if (source === residence) return 0;
  const rate = WITHHOLDING[source][kind];
  return kind === 'tax_deferred' ? rate : rate * gainFraction;
};

/**
 * Effective withdrawal tax rate given the plan's tax residence. Residence drives
 * the rate (it taxes worldwide income); a foreign account is also withheld at
 * source, and the total is `max(residence tax, foreign withholding)` — a capped
 * foreign tax credit. `tax_free` is honoured at home and, abroad, only when a
 * tax treaty preserves the status (see TAX_FREE_TREATY_RECOGNITION).
 *
 * Both sides of the max are rates on the GROSS withdrawal, so the withholding is
 * scaled by the gain share for gain-taxed buckets: a treaty rate applies to the
 * income a sale throws off, not to the return of the investor's own basis. Only
 * a tax-deferred withdrawal is withheld on its full amount (it is all income).
 */
export const accountEffectiveRate = (account: Account, residence: Country): number => {
  if (account.taxMode !== 'auto') return effectiveTaxRate(account);

  const kind: AccountKind = account.kind ?? 'taxable';
  const source = account.sourceCountry ?? residence;
  const gainFraction = 1 - clampRate((account.costBasisPct ?? 0) / 100);

  // Home-country special rate (assurance-vie, PEE, PEA social charges…) — only at
  // home, and applied to the GAIN portion (basis returns tax-free on a withdrawal).
  if (account.reducedRatePct != null && source === residence) {
    return clampRate((account.reducedRatePct / 100) * gainFraction);
  }

  // Residence-side tax on the characterised income.
  let residenceRate: number;
  if (kind === 'tax_deferred') {
    residenceRate = INCOME_TAX_FLAT[residence];
  } else if (kind === 'taxable') {
    residenceRate = CAPITAL_GAINS_FLAT[residence] * gainFraction;
  } else {
    // tax_free: exempt at home, and abroad only when a treaty preserves the
    // status (US Roth for CA/FR residents); otherwise taxed as a gain.
    const recognized = source === residence || TAX_FREE_TREATY_RECOGNITION[source][residence];
    residenceRate = recognized ? 0 : CAPITAL_GAINS_FLAT[residence] * gainFraction;
  }

  // Foreign withholding at source (credited against residence tax, capped).
  const withholding = withholdingOnGross(source, residence, kind, gainFraction);

  return clampRate(Math.max(residenceRate, withholding));
};

/**
 * How an account's withdrawal is taxed, decomposed for the progressive engine:
 *  - `incomeCoef` : fraction of the gross that flows into ordinary income (taxed
 *    progressively). 1 for deferred; gain×inclusion for taxable in an inclusion
 *    country (Canada); 0 otherwise.
 *  - `gainsCoef`  : fraction of the gross that flows into the capital-gains
 *    ladder (US LTCG 0/15/20% + NIIT, stacked on top of ordinary income).
 *    Gain fraction for a US-resident taxable account; 0 otherwise.
 *  - `flatRate`   : a flat tax on the gross (capital-gains flat for FR, or the
 *    legacy manual rate). 0 when the bucket is taxed progressively.
 *  - `withholding`: foreign withholding as a rate on the gross, credited against
 *    residence tax. Gain-scaled for gain-taxed buckets (see {@link withholdingOnGross}).
 */
export interface AccountTaxProfile {
  readonly incomeCoef: number;
  readonly gainsCoef: number;
  readonly flatRate: number;
  readonly withholding: number;
}

export const accountTaxProfile = (
  account: Account,
  residence: Country,
  /** Live gain fraction (value−basis)/value; overrides the static cost-basis share. */
  gainFractionOverride?: number,
): AccountTaxProfile => {
  if (account.taxMode !== 'auto') {
    return { incomeCoef: 0, gainsCoef: 0, flatRate: effectiveTaxRate(account), withholding: 0 };
  }
  const kind: AccountKind = account.kind ?? 'taxable';
  const source = account.sourceCountry ?? residence;
  const gainFraction =
    gainFractionOverride !== undefined
      ? Math.min(Math.max(gainFractionOverride, 0), 1)
      : 1 - clampRate((account.costBasisPct ?? 0) / 100);
  const withholding = withholdingOnGross(source, residence, kind, gainFraction);

  // Home-country special rate (assurance-vie, PEE, PEA social charges…) — only at
  // home, and applied to the GAIN portion (basis returns tax-free on a withdrawal).
  if (account.reducedRatePct != null && source === residence) {
    return {
      incomeCoef: 0,
      gainsCoef: 0,
      flatRate: clampRate((account.reducedRatePct / 100) * gainFraction),
      withholding: 0,
    };
  }

  if (kind === 'tax_deferred') {
    return { incomeCoef: 1, gainsCoef: 0, flatRate: 0, withholding };
  }
  // tax_free is exempt at home, and abroad when a treaty preserves the status
  // (US Roth for CA/FR residents); otherwise it is taxed like a gain by residence.
  const recognized = source === residence || TAX_FREE_TREATY_RECOGNITION[source][residence];
  const taxedAsGain = kind === 'taxable' || !recognized;
  if (!taxedAsGain) return { incomeCoef: 0, gainsCoef: 0, flatRate: 0, withholding: 0 };

  if (GAINS_INCLUSION[residence] > 0) {
    // Canada: the included share of the gain enters the ordinary brackets.
    return {
      incomeCoef: gainFraction * GAINS_INCLUSION[residence],
      gainsCoef: 0,
      flatRate: 0,
      withholding,
    };
  }
  if (residence === 'US') {
    // US: the gain enters the progressive LTCG ladder (0/15/20% + NIIT).
    return { incomeCoef: 0, gainsCoef: gainFraction, flatRate: 0, withholding };
  }
  // France: flat PFU on the gain share.
  return {
    incomeCoef: 0,
    gainsCoef: 0,
    flatRate: CAPITAL_GAINS_FLAT[residence] * gainFraction,
    withholding,
  };
};

/** Clamp a percent field to [min, max]; non-finite values fall back to `fallback`. */
const clampPct = (v: number | undefined, min: number, max: number): number | undefined => {
  if (v === undefined) return undefined;
  if (!Number.isFinite(v)) return undefined;
  return Math.min(Math.max(v, min), max);
};

/**
 * Sanitize the user-editable tax fields of an account patch: percent fields are
 * clamped to their legal ranges instead of silently distorting the math later.
 * Applied at the single store write point (`updateAccount`) and in the persisted-
 * state migration, so corrupted values (e.g. costBasisPct 250) never reach the
 * engines.
 */
export const sanitizeAccountTaxFields = <T extends Partial<Account>>(patch: T): T => {
  const out: Record<string, unknown> = { ...patch };
  if ('costBasisPct' in out) out.costBasisPct = clampPct(patch.costBasisPct, 0, 100);
  if ('reducedRatePct' in out) out.reducedRatePct = clampPct(patch.reducedRatePct, 0, 99);
  if ('taxRatePct' in out && patch.taxRatePct !== undefined)
    out.taxRatePct = clampPct(patch.taxRatePct, 0, 99) ?? 0;
  if ('taxableBasePct' in out && patch.taxableBasePct !== undefined)
    out.taxableBasePct = clampPct(patch.taxableBasePct, 0, 100) ?? 100;
  return out as T;
};

/** Gross amount to withdraw so that, after tax, the desired net remains. */
export const grossFromNet = (net: number, effTaxRate: number): number => {
  const t = Math.min(Math.max(effTaxRate, 0), 0.99);
  return net / (1 - t);
};

/** Tax paid on a gross withdrawal at a given effective tax rate. */
export const taxOnGross = (gross: number, effTaxRate: number): number =>
  gross * Math.min(Math.max(effTaxRate, 0), 0.99);

/** Quick-start envelope presets (editable after creation). */
export interface AccountPreset {
  readonly name: string;
  readonly kind: AccountKind;
  /**
   * Country where the account is held. Omit for a country-agnostic envelope (a
   * self-custodied crypto wallet): it is taxed wherever the user resides and
   * follows residence if it changes, because the tax engine falls back to
   * `sourceCountry ?? residence`.
   */
  readonly sourceCountry?: Country;
  readonly costBasisPct?: number;
  /** Home-country special flat rate (percent) — assurance-vie, PEE, etc. */
  readonly reducedRatePct?: number;
}

export const ACCOUNT_PRESETS: readonly AccountPreset[] = [
  // 🇫🇷 France
  { name: 'PER', kind: 'tax_deferred', sourceCountry: 'FR' },
  // PERP / Madelin / Article 83: legacy pension wrappers superseded by the PER,
  // still widely held; withdrawals taxed as ordinary income like the PER.
  { name: 'PERP / Madelin', kind: 'tax_deferred', sourceCountry: 'FR' },
  // PEA/PEA-PME: income-tax-free after 5 years, but social charges (18.6% since
  // 2026) still apply to the gain portion.
  { name: 'PEA', kind: 'tax_free', sourceCountry: 'FR', costBasisPct: 60, reducedRatePct: 18.6 },
  {
    name: 'PEA-PME',
    kind: 'tax_free',
    sourceCountry: 'FR',
    costBasisPct: 60,
    reducedRatePct: 18.6,
  },
  {
    name: 'Assurance-vie',
    kind: 'taxable',
    sourceCountry: 'FR',
    costBasisPct: 60,
    reducedRatePct: 24.7,
  },
  // Contrat de capitalisation: same favourable regime as assurance-vie (~24.7%),
  // but transmissible (no death-benefit reset).
  {
    name: 'Contrat de capitalisation',
    kind: 'taxable',
    sourceCountry: 'FR',
    costBasisPct: 60,
    reducedRatePct: 24.7,
  },
  { name: 'CTO (France)', kind: 'taxable', sourceCountry: 'FR', costBasisPct: 60 },
  { name: 'Livret A / LDDS', kind: 'tax_free', sourceCountry: 'FR' },
  // LEP / Livret Jeune: regulated passbooks, fully tax-exempt like the Livret A.
  { name: 'LEP', kind: 'tax_free', sourceCountry: 'FR' },
  { name: 'Livret Jeune', kind: 'tax_free', sourceCountry: 'FR' },
  // PEE/PERCO: capital is exempt; the gain bears 17.2% social charges.
  {
    name: 'PEE / PERCO',
    kind: 'tax_free',
    sourceCountry: 'FR',
    costBasisPct: 60,
    reducedRatePct: 17.2,
  },
  // PEL/CEL (opened since 2018) and term deposits: interest bears the full PFU
  // "flat tax" — modelled as a taxable envelope (mostly principal, small gain).
  { name: 'PEL / CEL', kind: 'taxable', sourceCountry: 'FR', costBasisPct: 80 },
  { name: 'Compte à terme', kind: 'taxable', sourceCountry: 'FR', costBasisPct: 80 },
  // Compte courant: a checking account yields ~0%, so there is no gain to tax
  // (costBasisPct 100). reducedRatePct 0 is belt-and-suspenders at home.
  {
    name: 'Compte courant',
    kind: 'taxable',
    sourceCountry: 'FR',
    costBasisPct: 100,
    reducedRatePct: 0,
  },
  // 🇨🇦 Canada
  { name: 'RRSP / REER', kind: 'tax_deferred', sourceCountry: 'CA' },
  { name: 'RRIF / FERR', kind: 'tax_deferred', sourceCountry: 'CA' },
  { name: 'LIRA (locked-in)', kind: 'tax_deferred', sourceCountry: 'CA' },
  // LIF / FRV: decumulation counterpart of the LIRA; payments taxed as income.
  { name: 'LIF / FRV', kind: 'tax_deferred', sourceCountry: 'CA' },
  { name: 'TFSA / CELI', kind: 'tax_free', sourceCountry: 'CA' },
  { name: 'FHSA / CELIAPP', kind: 'tax_free', sourceCountry: 'CA' },
  // RESP/RDSP/DPSP: registered plans whose grants + growth are taxable as income
  // in the beneficiary's hands on withdrawal (tax-deferred until then).
  { name: 'RESP / REEE', kind: 'tax_deferred', sourceCountry: 'CA' },
  { name: 'RDSP / REEI', kind: 'tax_deferred', sourceCountry: 'CA' },
  { name: 'DPSP / RPDB', kind: 'tax_deferred', sourceCountry: 'CA' },
  { name: 'Non-Registered', kind: 'taxable', sourceCountry: 'CA', costBasisPct: 60 },
  // 🇺🇸 USA
  { name: '401(k) / IRA', kind: 'tax_deferred', sourceCountry: 'US' },
  { name: 'Traditional IRA', kind: 'tax_deferred', sourceCountry: 'US' },
  { name: '403(b) / 457(b)', kind: 'tax_deferred', sourceCountry: 'US' },
  { name: 'SEP / SIMPLE IRA', kind: 'tax_deferred', sourceCountry: 'US' },
  // TSP (federal employees) and defined-benefit pensions: withdrawals/payments
  // taxed as ordinary income.
  { name: 'TSP', kind: 'tax_deferred', sourceCountry: 'US' },
  { name: 'Pension (DB)', kind: 'tax_deferred', sourceCountry: 'US' },
  { name: 'Roth IRA', kind: 'tax_free', sourceCountry: 'US' },
  { name: 'Roth 401(k)', kind: 'tax_free', sourceCountry: 'US' },
  // 529 / Coverdell ESA: education wrappers, tax-free growth for qualified use.
  { name: '529 Plan', kind: 'tax_free', sourceCountry: 'US' },
  { name: 'Coverdell ESA', kind: 'tax_free', sourceCountry: 'US' },
  { name: 'HSA', kind: 'tax_free', sourceCountry: 'US' },
  { name: 'Brokerage (US)', kind: 'taxable', sourceCountry: 'US', costBasisPct: 60 },
  // Checking Account: the US equivalent of the French compte courant — ~0% yield,
  // no gain to tax (costBasisPct 100).
  {
    name: 'Checking Account',
    kind: 'taxable',
    sourceCountry: 'US',
    costBasisPct: 100,
    reducedRatePct: 0,
  },
  // 🪙 Crypto — country-agnostic; taxed at residence (no fixed source country).
  { name: 'Crypto Wallet', kind: 'taxable', costBasisPct: 40 },
];

/** The basic taxable brokerage envelope per country (the default account). */
export const BASE_TAXABLE_PRESET: Record<Country, AccountPreset> = {
  FR: { name: 'CTO (France)', kind: 'taxable', sourceCountry: 'FR', costBasisPct: 60 },
  CA: { name: 'Non-Registered', kind: 'taxable', sourceCountry: 'CA', costBasisPct: 60 },
  US: { name: 'Brokerage (US)', kind: 'taxable', sourceCountry: 'US', costBasisPct: 60 },
};

/** A ready-made basic taxable account for a country (used as the default account). */
export const defaultTaxableAccount = (country: Country): Account =>
  accountFromPreset(BASE_TAXABLE_PRESET[country]);

/**
 * The default account a free-tier plan starts with: a single tax-free sandbox
 * account, not the honest taxable baseline premium gets. Free is capped at one
 * account with no tax/kind customization, so this is what that one account is.
 */
export const defaultFreeAccount = (): Account => ({
  id: newId(),
  name: 'My account',
  taxRatePct: 0,
  taxableBasePct: 100,
  taxMode: 'auto',
  kind: 'tax_free',
  custom: true,
});

/**
 * Fallback English name of the auto-managed illiquid bucket. UI surfaces render
 * `t('addAsset.illiquidBucketName')` instead of this stored value (localized);
 * it is only the raw name persisted on the account.
 */
export const ILLIQUID_ACCOUNT_NAME = 'Illiquid assets';

/**
 * The auto-managed bucket for non-drawable custom assets (home, car). Tax fields
 * are inert (zero manual rate; 100% cost basis ⇒ zero displayed gain). Never
 * editable, never in the withdrawal order, never counted toward the quota.
 */
export const illiquidAccount = (): Account => ({
  id: newId(),
  name: ILLIQUID_ACCOUNT_NAME,
  taxRatePct: 0,
  taxableBasePct: 100,
  taxMode: 'manual',
  kind: 'taxable',
  costBasisPct: 100,
  custom: false,
  illiquid: true,
});

/** The auto-managed illiquid bucket, excluded from tax-envelope treatment. */
export const isIlliquidAccount = (account: Pick<Account, 'illiquid'>): boolean =>
  account.illiquid === true;

/** Build a new account from a preset (locked) or blank defaults (custom, editable). */
export const accountFromPreset = (
  preset?: AccountPreset,
  fallbackCountry: Country = 'US',
): Account => ({
  id: newId(),
  name: preset?.name ?? 'Custom account',
  taxRatePct: 0,
  taxableBasePct: 100,
  taxMode: 'auto',
  kind: preset?.kind ?? 'taxable',
  // A preset may intentionally omit the source country (crypto → residence); a
  // blank custom account defaults to the plan's current residence until the
  // user picks one.
  sourceCountry: preset ? preset.sourceCountry : fallbackCountry,
  costBasisPct: preset?.costBasisPct,
  reducedRatePct: preset?.reducedRatePct,
  custom: !preset,
});
