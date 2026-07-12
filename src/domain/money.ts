/** ISO 4217 currency codes the planner supports as a plan reference currency. */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'CAD', 'GBP', 'AUD', 'JPY', 'CHF'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** A monetary amount tagged with its currency. Amounts are plain numbers (major units). */
export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

export const money = (amount: number, currency: CurrencyCode): Money => ({ amount, currency });

/**
 * Currencies offered as a plan's master (reference) currency and as an asset's
 * origin currency. A focused subset of SUPPORTED_CURRENCIES per the product spec.
 */
export const MASTER_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP'] as const;
export type MasterCurrency = (typeof MASTER_CURRENCIES)[number];

export const isSupportedCurrency = (code: string): code is CurrencyCode =>
  (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
