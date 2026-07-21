import type { Country, Province } from '@/domain/country';
import type { CurrencyCode } from '@/domain/money';
import type { AssetClass } from '@/domain/assetClass';
import type { Instrument, Holding } from '@/domain/asset';
import type { Account, AccountPreset } from '@/domain/account';
import type { ExpensePeriod } from '@/domain/retirementSettings';
import { accountFromPreset, defaultTaxableAccount } from '@/domain/account';
import { newId } from '@/lib/id';

/** Default growth assumption for the quick-start's blended-equity holding (percent). */
export const BROAD_MARKET_CAGR_DEFAULT = 6;

/** The visitor's brouillon captured across the two quick-start screens. */
export interface QuickStartDraft {
  readonly residence: Country;
  readonly province: Province;
  readonly currency: CurrencyCode;
  readonly currentAge: number;
  readonly retirementAge: number;
  /** Lifestyle spending as entered, before annualization. */
  readonly spending: number;
  readonly spendingPeriod: ExpensePeriod;
  /** Names of selected `ACCOUNT_PRESETS` (empty = a single default taxable account). */
  readonly selectedPresetNames: readonly string[];
  readonly totalWealth: number;
  readonly monthlySavings: number;
}

/** Broad-market equity class that matches the residence (drives MC + historical returns). */
export const equityClassFor = (country: Country): AssetClass =>
  country === 'CA' ? 'ca_equity' : country === 'FR' ? 'eu_equity' : 'us_equity';

/** Calendar year the visitor reaches their chosen retirement age. */
export const retirementYearFromAges = (currentAge: number, retirementAge: number): number =>
  new Date().getFullYear() + Math.max(0, retirementAge - currentAge);

/** Annualized spending from the entered amount + period. */
export const annualSpendingFrom = (spending: number, period: ExpensePeriod): number =>
  Math.max(0, period === 'monthly' ? spending * 12 : spending);

const broadMarketInstrument = (
  country: Country,
  currency: CurrencyCode,
  name: string,
): Instrument => ({
  id: `local:broad-market:${equityClassFor(country)}`,
  symbol: 'MKT',
  name,
  assetClass: equityClassFor(country),
  exchange: 'Custom',
  nativeCurrency: currency,
});

/**
 * A single blended-equity holding standing in for "my total portfolio" — the whole
 * entered amount at a diversified default return, editable afterward. Value =
 * `quantity × pricePerUnit`, so price carries the total and quantity stays 1.
 */
export const broadMarketHolding = (
  country: Country,
  currency: CurrencyCode,
  totalWealth: number,
  monthlySavings: number,
  accountId: string,
  name: string,
): Holding => ({
  id: newId(),
  instrument: broadMarketInstrument(country, currency, name),
  quantity: 1,
  pricePerUnit: Math.max(0, totalWealth),
  expectedCagrPct: BROAD_MARKET_CAGR_DEFAULT,
  monthlyContribution: Math.max(0, monthlySavings),
  accountId,
});

/**
 * The tax envelopes for the plan: one account per selected preset, or a single
 * default taxable account for the residence when the visitor skipped the pills.
 * Never empty, so `saveAccountsTaxConfig` always commits.
 */
export const accountsForDraft = (
  presets: readonly AccountPreset[],
  residence: Country,
): Account[] => {
  if (presets.length === 0) return [defaultTaxableAccount(residence)];
  return presets.map((preset) => accountFromPreset(preset, residence));
};
