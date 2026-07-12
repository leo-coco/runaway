import type { AssetClass } from './assetClass';

/**
 * Local (non-searchable-via-API) assets that should still surface when the user
 * searches for common terms like "cash" or "GIC" — these have
 * no ticker to look up on CoinGecko/Alpha Vantage, so they're matched by keyword
 * client-side instead. i18n keys are resolved by the caller (which has `t`).
 */
export interface PseudoAssetSpec {
  readonly id: string;
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly nameKey: string;
  readonly keywords: readonly string[];
}

export const PSEUDO_ASSET_SPECS: readonly PseudoAssetSpec[] = [
  {
    id: 'local:cash',
    symbol: 'CASH',
    assetClass: 'cash',
    nameKey: 'addAsset.pseudoCashName',
    keywords: ['cash', 'argent', 'especes', 'liquidites', 'liquidite'],
  },
  {
    id: 'local:gic',
    symbol: 'GIC',
    assetClass: 'cash',
    nameKey: 'addAsset.pseudoGicName',
    keywords: [
      'gic',
      'guaranteed investment certificate',
      'certificat de placement garanti',
      'cpg',
    ],
  },
];

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Keyword match against the pseudo-asset registry (accent-insensitive, substring both ways). */
export const matchPseudoAssets = (query: string): readonly PseudoAssetSpec[] => {
  const q = stripAccents(query.trim().toLowerCase());
  if (q.length < 2) return [];
  return PSEUDO_ASSET_SPECS.filter((spec) =>
    spec.keywords.some((k) => {
      const kw = stripAccents(k);
      return kw.includes(q) || q.includes(kw);
    })
  );
};
