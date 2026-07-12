import type { AssetClass } from './assetClass';

/**
 * Standardised annual volatility (return standard deviation, percent) per asset
 * class, used by the Monte Carlo engine when no per-asset history is available.
 * These are deliberately round, defensible defaults — refine later from history.
 */
export const CLASS_VOLATILITY: Record<AssetClass, number> = {
  crypto: 60,
  us_equity: 16,
  ca_equity: 16,
  eu_equity: 17,
  cash: 0,
  other: 8,
};

/** Per-ticker volatility overrides (annual %), keyed by base symbol (no exchange suffix). */
export const TICKER_VOLATILITY: Record<string, number> = {
  BTC: 70,
  ETH: 85,
  SOL: 110,
  NVDA: 50,
  TSLA: 60,
  AAPL: 28,
  MSFT: 26,
  GOOGL: 28,
  AMZN: 32,
  META: 40,
  // Broad-market ETFs are less volatile than single names.
  VFV: 16,
  XEQT: 14,
  SPY: 15,
  VOO: 15,
};

const baseSymbol = (symbol: string): string => symbol.split('.')[0]?.toUpperCase() ?? symbol;

/** Annual volatility (%) for an asset: ticker override, else its class default. */
export const volatilityFor = (assetClass: AssetClass, symbol: string): number =>
  TICKER_VOLATILITY[baseSymbol(symbol)] ?? CLASS_VOLATILITY[assetClass];

/**
 * Correlation between two asset classes. The diagonal value (same class) is the
 * correlation used between two *distinct* assets of that class (not 1).
 */
export const CLASS_CORRELATION: Record<AssetClass, Record<AssetClass, number>> = {
  crypto: { crypto: 0.8, us_equity: 0.45, ca_equity: 0.45, eu_equity: 0.45, cash: 0, other: 0.1 },
  us_equity: {
    crypto: 0.45,
    us_equity: 0.9,
    ca_equity: 0.8,
    eu_equity: 0.85,
    cash: 0,
    other: 0.2,
  },
  ca_equity: {
    crypto: 0.45,
    us_equity: 0.8,
    ca_equity: 0.9,
    eu_equity: 0.78,
    cash: 0,
    other: 0.2,
  },
  eu_equity: {
    crypto: 0.45,
    us_equity: 0.85,
    ca_equity: 0.78,
    eu_equity: 0.9,
    cash: 0,
    other: 0.2,
  },
  // Cash/savings — no market exposure, so ~0 correlation with every risk asset.
  cash: { crypto: 0, us_equity: 0, ca_equity: 0, eu_equity: 0, cash: 0.2, other: 0.05 },
  other: { crypto: 0.1, us_equity: 0.2, ca_equity: 0.2, eu_equity: 0.2, cash: 0.05, other: 0.5 },
};

/** Correlation between two asset classes (symmetric). */
export const classCorrelation = (a: AssetClass, b: AssetClass): number => CLASS_CORRELATION[a][b];

/**
 * Crash sensitivity per asset class: how much the crash regime (extra negative
 * shock, volatility spike, correlation lift) bites this class. 1 = full equity
 * crash; >1 = crashes harder (crypto); 0 = a defensive asset that is spared in a
 * flight-to-quality (bonds/cash-like "other"). This stops a diversified or
 * bond-heavy portfolio from being unfairly assumed to crash alongside equities.
 */
export const CLASS_CRASH_BETA: Record<AssetClass, number> = {
  crypto: 1.3,
  us_equity: 1,
  ca_equity: 1,
  eu_equity: 1,
  cash: 0,
  other: 0,
};

/**
 * Embedded historical annual total returns (decimals) per asset class, aligned to
 * the same calendar window (2001–2024) so cross-class crash co-movement is real
 * (2002, 2008, 2020, 2022 are down years across equities together). Used by the
 * block-bootstrap model. Only the *shape* (dispersion, fat tails, sequencing,
 * co-movement) is used — the series are demeaned and standardised, so the long-run
 * drift always comes from the user's expected CAGR, never from history.
 *
 * Sources are approximate (S&P 500 TR, MSCI Europe, S&P/TSX, US Agg, BTC). Crypto
 * pre‑2014 is illustrative (BTC did not exist) but kept high-vol and co-moving in
 * crashes; refine any series freely — values are model inputs, not facts.
 */
export const CLASS_HISTORY: Record<AssetClass, readonly number[]> = {
  // 2001 → 2024
  us_equity: [
    -0.119, -0.221, 0.287, 0.109, 0.049, 0.158, 0.055, -0.37, 0.265, 0.151, 0.021, 0.16, 0.324,
    0.137, 0.014, 0.12, 0.218, -0.044, 0.315, 0.184, 0.287, -0.181, 0.263, 0.25,
  ],
  eu_equity: [
    -0.18, -0.3, 0.16, 0.12, 0.26, 0.2, 0.03, -0.44, 0.32, 0.11, -0.08, 0.18, 0.2, 0.07, 0.08, 0.03,
    0.1, -0.1, 0.26, -0.03, 0.25, -0.09, 0.16, 0.08,
  ],
  ca_equity: [
    -0.12, -0.12, 0.27, 0.14, 0.24, 0.17, 0.1, -0.33, 0.35, 0.18, -0.09, 0.07, 0.13, 0.11, -0.08,
    0.21, 0.09, -0.09, 0.23, 0.06, 0.25, -0.06, 0.12, 0.18,
  ],
  other: [
    0.08, 0.1, 0.04, 0.04, 0.02, 0.04, 0.07, 0.05, 0.06, 0.06, 0.08, 0.04, -0.02, 0.06, 0.01, 0.03,
    0.04, 0.0, 0.09, 0.08, -0.02, -0.13, 0.06, 0.02,
  ],
  // Approximate US 3-month T-bill yield, 2001 → 2024 — near-zero variance and
  // never negative, so only matters if a "cash" holding is given nonzero vol.
  cash: [
    0.034, 0.016, 0.01, 0.012, 0.03, 0.047, 0.044, 0.014, 0.002, 0.001, 0.001, 0.001, 0.001, 0.0,
    0.001, 0.003, 0.009, 0.019, 0.021, 0.004, 0.0, 0.015, 0.047, 0.05,
  ],
  crypto: [
    // 2001–2013 illustrative (pre‑BTC), then 2014–2024 approx BTC annual returns.
    // Capped at +200%/yr: real BTC blow-off years (2013 ≈ +5000%, 2017 ≈ +1300%,
    // 2020 ≈ +300%) are historically accurate but are not plausible *forward*
    // assumptions, and a single +5000% point dominated the bootstrap's upper tail.
    // Capping keeps the sequencing and co-movement while taming the runaway upside.
    -0.5, 0.8, 2.0, -0.4, 1.5, 0.9, 0.6, -0.8, 2.0, 1.8, -0.5, 1.5, 2.0, -0.58, 0.35, 1.2, 2.0,
    -0.73, 0.95, 2.0, 0.6, -0.65, 1.55, 1.2,
  ],
};

/** Forward cap applied to the crypto history (a +200%/yr year is the plausible ceiling). */
export const CRYPTO_HISTORY_CAP = 2.0;

/** Annual return history for an asset class (decimals), for the block-bootstrap model. */
export const classReturnHistory = (assetClass: AssetClass): readonly number[] =>
  CLASS_HISTORY[assetClass];
