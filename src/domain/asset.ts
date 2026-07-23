import type { AssetClass } from './assetClass';
import type { CurrencyCode } from './money';

/**
 * Fund/ETF composition snapshotted when a holding is added, for later use (e.g.
 * a portfolio-wide stock/bond/cash view). Not refreshed afterward. Null-ish
 * fields mean the instrument is a plain equity, not a fund.
 */
export interface AssetAllocation {
  readonly stockPct: number | null;
  readonly bondPct: number | null;
  readonly cashPct: number | null;
  readonly otherPct: number | null;
  readonly preferredPct: number | null;
  readonly convertiblePct: number | null;
  /**
   * Crypto slice. Yahoo's fund modules never report this, so it is optional and
   * absent on fetched fund allocations; it exists for user-defined custom assets
   * that hold crypto and for a future crypto-aware allocation breakdown.
   */
  readonly cryptoPct?: number | null;
  readonly categoryName: string | null;
  readonly fundFamily: string | null;
  readonly sectorWeightings: readonly { readonly sector: string; readonly weightPct: number }[];
}

/**
 * A tradable instrument that can be held in a plan.
 * `id` is a stable provider id (e.g. CoinGecko id or `SYMBOL:EXCHANGE`).
 */
export interface Instrument {
  readonly id: string;
  readonly symbol: string; // e.g. "BTC", "NVDA.TO"
  readonly name: string; // e.g. "Bitcoin", "NVIDIA Corporation"
  readonly assetClass: AssetClass;
  readonly exchange: string; // e.g. "TSX", "NASDAQ", "Crypto"
  readonly nativeCurrency: CurrencyCode;
  /** Yahoo's instrument kind, when the search result carried one. Gates allocation lookups. */
  readonly quoteType?: 'EQUITY' | 'ETF' | 'MUTUALFUND';
  readonly assetAllocation?: AssetAllocation;
}

/**
 * A holding inside a plan: an instrument plus user-controlled inputs.
 * `pricePerUnit` and `monthlyContribution` are stored in the instrument's native currency.
 * `expectedCagrPct` is the user's base growth assumption (percent, e.g. 15 = 15%/yr).
 * `monthlyContribution` is the recurring amount invested into this holding each
 * month during the accumulation phase (before the retirement year).
 */
export interface Holding {
  readonly id: string;
  readonly instrument: Instrument;
  readonly quantity: number;
  readonly pricePerUnit: number;
  readonly expectedCagrPct: number;
  readonly monthlyContribution: number;
  /** Tax envelope this holding belongs to, or null when unassigned. */
  readonly accountId: string | null;
  /**
   * Per-holding annual volatility override (percent) for the Monte Carlo model.
   * When undefined, the asset-class/ticker default from the volatility table is used.
   */
  readonly volatilityPct?: number;
  /**
   * Per-holding expected-return override (percent) scoped to the Monte Carlo model,
   * so you can stress a different assumption in the simulation without touching the
   * plan's stated CAGR (which the deterministic projection keeps using). When
   * undefined, the Monte Carlo engine falls back to `expectedCagrPct`. Reset clears it.
   */
  readonly mcExpectedReturnPct?: number;
  /**
   * Cost basis **per unit** (purchase price per share) in the holding's native
   * currency — parallel to `pricePerUnit`. Total basis = quantity × costBasis.
   * Drives the dynamic capital-gains tracking (taxed gain = value − total basis).
   * When undefined, the engine falls back to the account's static cost-basis share.
   */
  readonly costBasis?: number;
  /**
   * Whether this holding can be sold to fund retirement spending. Default (undefined
   * or true) is drawable. When `false` the holding is illiquid — it still grows and
   * counts toward the balance and net worth, but the withdrawal engine never sells
   * it and reinvested surplus never lands in it. Use for a home, a business, or any
   * asset you would not liquidate to cover living costs.
   */
  readonly drawable?: boolean;
}

/** Native-currency market value of a holding before FX conversion. */
export const holdingNativeValue = (h: Holding): number => h.quantity * h.pricePerUnit;
