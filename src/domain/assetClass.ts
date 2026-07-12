/** High-level asset classes used for allocation and grouping. */
export const ASSET_CLASSES = [
  'crypto',
  'us_equity',
  'ca_equity',
  'eu_equity',
  'cash',
  'other',
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  crypto: 'Crypto',
  us_equity: 'US Equities',
  ca_equity: 'CA Equities',
  eu_equity: 'EU Equities',
  cash: 'Cash',
  other: 'Other',
};
