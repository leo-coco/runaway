import { ASSET_CLASSES, type AssetClass } from './assetClass';

/**
 * Real historical annual data for the "Historical (real)" Monte Carlo model.
 *
 * Unlike the bootstrap model (which standardises history and re-centres it on the
 * user's CAGR), this model replays the ACTUAL nominal total returns AND the ACTUAL
 * inflation of a real cohort, sequentially — so the long-run drift is history's,
 * not the user's assumption, and 1970s-style stagflation hits returns and spending
 * together.
 *
 * Window: 1928–2024 (97 years).
 * Sources:
 *  - US large-cap stocks: S&P 500 total return (incl. dividends) — Damodaran, NYU Stern.
 *  - US Treasury bonds:    10-year T.Bond total return — Damodaran, NYU Stern.
 *  - Inflation:            US CPI-U annual % change — Federal Reserve Bank of Minneapolis.
 */
export const HIST_REAL_START_YEAR = 1928;
export const HIST_REAL_END_YEAR = 2024;

/** S&P 500 total return (incl. dividends), decimals, 1928 → 2024. */
const SP500_TR: readonly number[] = [
  0.4381, -0.083, -0.2512, -0.4384, -0.0864, 0.4998, -0.0119, 0.4674, 0.3194, -0.3534, 0.2928,
  -0.011, -0.1067, -0.1277, 0.1917, 0.2506, 0.1903, 0.3582, -0.0843, 0.052, 0.057, 0.183, 0.3081,
  0.2368, 0.1815, -0.0121, 0.5256, 0.326, 0.0744, -0.1046, 0.4372, 0.1206, 0.0034, 0.2664, -0.0881,
  0.2261, 0.1642, 0.124, -0.0997, 0.238, 0.1081, -0.0824, 0.0356, 0.1422, 0.1876, -0.1431, -0.259,
  0.37, 0.2383, -0.0698, 0.0651, 0.1852, 0.3174, -0.047, 0.2042, 0.2234, 0.0615, 0.3124, 0.1849,
  0.0581, 0.1654, 0.3148, -0.0306, 0.3023, 0.0749, 0.0997, 0.0133, 0.372, 0.2268, 0.331, 0.2834,
  0.2089, -0.0903, -0.1185, -0.2197, 0.2836, 0.1074, 0.0483, 0.1561, 0.0548, -0.3655, 0.2594,
  0.1482, 0.021, 0.1589, 0.3215, 0.1352, 0.0138, 0.1177, 0.2161, -0.0423, 0.3121, 0.1802, 0.2847,
  -0.1804, 0.2606, 0.2488,
];

/** 10-year US Treasury bond total return, decimals, 1928 → 2024. */
const TBOND_TR: readonly number[] = [
  0.0084, 0.042, 0.0454, -0.0256, 0.0879, 0.0186, 0.0796, 0.0447, 0.0502, 0.0138, 0.0421, 0.0441,
  0.054, -0.0202, 0.0229, 0.0249, 0.0258, 0.038, 0.0313, 0.0092, 0.0195, 0.0466, 0.0043, -0.003,
  0.0227, 0.0414, 0.0329, -0.0134, -0.0226, 0.068, -0.021, -0.0265, 0.1164, 0.0206, 0.0569, 0.0168,
  0.0373, 0.0072, 0.0291, -0.0158, 0.0327, -0.0501, 0.1675, 0.0979, 0.0282, 0.0366, 0.0199, 0.0361,
  0.1598, 0.0129, -0.0078, 0.0067, -0.0299, 0.082, 0.3281, 0.032, 0.1373, 0.2571, 0.2428, -0.0496,
  0.0822, 0.1769, 0.0624, 0.15, 0.0936, 0.1421, -0.0804, 0.2348, 0.0143, 0.0994, 0.1492, -0.0825,
  0.1666, 0.0557, 0.1512, 0.0038, 0.0449, 0.0287, 0.0196, 0.1021, 0.201, -0.1112, 0.0846, 0.1604,
  0.0297, -0.091, 0.1075, 0.0128, 0.0069, 0.028, -0.0002, 0.0964, 0.1133, -0.0442, -0.1783, 0.0388,
  -0.0164,
];

/** US CPI-U annual inflation, decimals, 1928 → 2024. */
const CPI_INFLATION: readonly number[] = [
  -0.012, 0.0, -0.027, -0.089, -0.103, -0.052, 0.035, 0.026, 0.01, 0.037, -0.02, -0.013, 0.007,
  0.051, 0.109, 0.06, 0.016, 0.023, 0.085, 0.144, 0.077, -0.01, 0.011, 0.079, 0.023, 0.008, 0.003,
  -0.003, 0.015, 0.033, 0.027, 0.0108, 0.015, 0.011, 0.012, 0.012, 0.013, 0.016, 0.03, 0.028, 0.043,
  0.055, 0.058, 0.043, 0.033, 0.062, 0.111, 0.091, 0.057, 0.065, 0.076, 0.113, 0.135, 0.103, 0.061,
  0.032, 0.043, 0.035, 0.019, 0.037, 0.041, 0.048, 0.054, 0.042, 0.03, 0.03, 0.026, 0.028, 0.029,
  0.023, 0.016, 0.022, 0.034, 0.028, 0.016, 0.023, 0.027, 0.034, 0.032, 0.029, 0.038, -0.004, 0.016,
  0.032, 0.021, 0.015, 0.016, 0.001, 0.013, 0.021, 0.024, 0.018, 0.012, 0.047, 0.08, 0.041, 0.029,
];

export const HIST_REAL_LEN = SP500_TR.length;

/** Crypto has no deep history — in real mode it is proxied as leveraged US equity. */
export const CRYPTO_REAL_BETA = 2.0;
const CRYPTO_CAP_MAX = 2.0; // +200%
const CRYPTO_CAP_MIN = -0.95; // −95%
const CRYPTO_PROXY: readonly number[] = SP500_TR.map((r) =>
  Math.min(CRYPTO_CAP_MAX, Math.max(CRYPTO_CAP_MIN, r * CRYPTO_REAL_BETA)),
);

/**
 * Cash has no embedded full-window history here (unlike the S&P 500 / T-bond
 * series above, which are sourced) — this model only bites if a cash-classed
 * asset is given nonzero volatility, since sigma=0 bypasses history entirely
 * (see monteCarlo.ts). Proxied as a flat, low nominal rate rather than
 * fabricating year-by-year T-bill data as if it were sourced.
 */
const TBILL_TR: readonly number[] = SP500_TR.map(() => 0.02);

/**
 * Actual nominal annual total return per asset class, aligned to the same calendar
 * window so cross-class co-movement is real. Equities (US/CA/EU) map to US large-cap
 * history; the defensive "other" class maps to 10-year Treasuries; crypto is a
 * leveraged-equity proxy (no real pre-2010 history).
 */
export const HIST_REAL_RETURN: Record<AssetClass, readonly number[]> = Object.fromEntries(
  ASSET_CLASSES.map((c) => {
    if (c === 'other') return [c, TBOND_TR];
    if (c === 'crypto') return [c, CRYPTO_PROXY];
    // Cash only matters here if given nonzero vol (sigma=0 bypasses history
    // entirely — see monteCarlo.ts); proxy it as T-bills, safer than bonds.
    if (c === 'cash') return [c, TBILL_TR];
    return [c, SP500_TR]; // us_equity, ca_equity, eu_equity
  }),
) as Record<AssetClass, readonly number[]>;

/** Actual CPI inflation for each year of the window (decimals). */
export const HIST_REAL_INFLATION: readonly number[] = CPI_INFLATION;

/**
 * Geometric-mean log return of each class's full 1928–2024 window — used by the
 * `historical-real-centered` model to re-centre the real sequence on the user's
 * CAGR (subtract this, add the user's log-CAGR) while keeping every year's actual
 * deviation from trend, so crashes and recoveries still land on their real years.
 */
export const HIST_REAL_LOG_DRIFT: Record<AssetClass, number> = Object.fromEntries(
  ASSET_CLASSES.map((c) => {
    const xs = HIST_REAL_RETURN[c];
    return [c, xs.reduce((s, r) => s + Math.log(1 + r), 0) / (xs.length || 1)];
  }),
) as Record<AssetClass, number>;

/** Human-readable source mapping, surfaced in the transparency panel. */
export const HIST_REAL_SOURCES: { label: string; source: string }[] = [
  { label: 'US / CA / EU equity', source: 'S&P 500 total return (Damodaran, NYU Stern)' },
  { label: 'Bonds / defensive', source: '10-year US T.Bond total return (Damodaran)' },
  { label: 'Crypto (proxy)', source: `US equity × ${CRYPTO_REAL_BETA} (no real pre-2010 history)` },
  { label: 'Cash (proxy)', source: 'Flat 2% nominal (no sourced full-window history)' },
  { label: 'Inflation', source: 'US CPI-U annual change (Minneapolis Fed)' },
];
