/** Tax jurisdictions supported for residence and account source. */
export const COUNTRIES = ['FR', 'US', 'CA'] as const;
export type Country = (typeof COUNTRIES)[number];

/** Narrows an untrusted value (e.g. from a session or API response) to a Country, or undefined. */
export const asCountry = (value: string | null | undefined): Country | undefined =>
  COUNTRIES.includes(value as Country) ? (value as Country) : undefined;

export const COUNTRY_LABEL: Record<Country, string> = {
  FR: 'France',
  US: 'United States',
  CA: 'Canada',
};

export const COUNTRY_FLAG: Record<Country, string> = {
  FR: '🇫🇷',
  US: '🇺🇸',
  CA: '🇨🇦',
};

/**
 * Local currency of each tax jurisdiction — the currency its bracket thresholds,
 * deductions and NIIT-style thresholds are legislated in. Used to convert those
 * thresholds into the plan currency before applying them to plan-currency amounts.
 */
export const RESIDENCE_CURRENCY: Record<Country, 'USD' | 'EUR' | 'CAD'> = {
  US: 'USD',
  FR: 'EUR',
  CA: 'CAD',
};

/** Best-guess tax residence for a plan currency (EUR → France, CAD → Canada, else US). */
export const residenceForCurrency = (currency: string): Country => {
  if (currency === 'EUR') return 'FR';
  if (currency === 'CAD') return 'CA';
  return 'US';
};

/**
 * Canadian provinces with dedicated combined (federal + provincial) bracket
 * tables. 'OTHER' is a representative fallback for the remaining provinces and
 * territories. Only meaningful when the tax residence is CA.
 */
export const CA_PROVINCES = ['ON', 'QC', 'BC', 'AB', 'OTHER'] as const;
export type Province = (typeof CA_PROVINCES)[number];

export const PROVINCE_LABEL: Record<Province, string> = {
  ON: 'Ontario',
  QC: 'Québec',
  BC: 'British Columbia',
  AB: 'Alberta',
  OTHER: 'Other (representative)',
};

export const DEFAULT_PROVINCE: Province = 'ON';
