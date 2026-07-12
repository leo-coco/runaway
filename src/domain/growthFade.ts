/**
 * Optional decay of an asset's expected CAGR toward a mature market rate over the
 * projection. A stock can't compound at a hyper-growth rate forever (it would
 * eventually dwarf the whole economy), so high starters glide down toward a
 * sustainable long-run rate. Applies to both the deterministic projection and the
 * Monte Carlo engine so the two stay consistent.
 */
export interface GrowthFadeConfig {
  readonly enabled: boolean;
  /** Long-run "mature" CAGR (percent) the growth fades toward. */
  readonly targetPct: number;
  /** Years over which the fade completes (linear glide), then held constant. */
  readonly years: number;
}

export const DEFAULT_GROWTH_FADE: GrowthFadeConfig = {
  enabled: false,
  targetPct: 7,
  years: 10,
};

/**
 * Effective CAGR (percent) for an asset at a given 0-based year offset, applying
 * the fade. A high starter glides linearly from its base CAGR down to the target
 * over `years`, then stays at the target. Assets at or below the target are left
 * untouched — the fade only ever pulls a rate *down*, never up.
 */
export const fadedCagrPct = (
  baseCagrPct: number,
  yearOffset: number,
  cfg: GrowthFadeConfig,
): number => {
  if (!cfg.enabled || cfg.years <= 0 || baseCagrPct <= cfg.targetPct) return baseCagrPct;
  const t = Math.min(Math.max(yearOffset, 0), cfg.years);
  const frac = t / cfg.years;
  return baseCagrPct - (baseCagrPct - cfg.targetPct) * frac;
};
