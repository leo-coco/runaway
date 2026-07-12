/**
 * Retirement spending profile over time.
 *
 *  - `linear`  : a constant real lifestyle budget for the whole retirement (the
 *    classic assumption — only inflation moves the nominal figure).
 *  - `phased`  : the empirical "Go-Go / Slow-Go / No-Go" pattern. Spending holds
 *    flat in real terms through the active Go-Go years, then is adjusted in real
 *    terms each year through the Slow-Go and No-Go phases. The yearly adjustment
 *    is signed: negative shrinks real spending (people slow down and spend less
 *    as they age — the common case), positive grows it (e.g. rising care costs in
 *    the No-Go years), with a floor so it never collapses to zero.
 *
 * The adjustment is always *real*. The engine applies inflation on top in both
 * directions, so a −1.5%/yr adjustment means real purchasing power falls 1.5% a
 * year while the nominal figure may still rise, and a +1.5%/yr adjustment means
 * real spending grows 1.5% a year on top of inflation. Inflation is layered on
 * consistently regardless of the sign.
 */
export type SpendingMode = 'linear' | 'phased';

export interface PhasedSpendingConfig {
  /** Last age of the full-budget Go-Go phase (inclusive). */
  readonly goGoEndAge: number;
  /** Last age of the Slow-Go phase (inclusive); No-Go runs after this. */
  readonly slowGoEndAge: number;
  /** Real adjustment per year during Slow-Go, percent. Negative = decline. */
  readonly slowGoAdjustmentPct: number;
  /** Real adjustment per year during No-Go, percent. Negative = decline. */
  readonly noGoAdjustmentPct: number;
  /** Floor as a percent of the initial budget; spending never falls below it. */
  readonly floorPct: number;
}

export const DEFAULT_PHASED_SPENDING: PhasedSpendingConfig = {
  goGoEndAge: 75,
  slowGoEndAge: 85,
  slowGoAdjustmentPct: -1.5,
  noGoAdjustmentPct: -1.5,
  floorPct: 70,
};

export type SpendingPhase = 'goGo' | 'slowGo' | 'noGo';

/** Which phase a given age falls in. */
export const phaseForAge = (age: number, cfg: PhasedSpendingConfig): SpendingPhase => {
  if (age <= cfg.goGoEndAge) return 'goGo';
  if (age <= cfg.slowGoEndAge) return 'slowGo';
  return 'noGo';
};

/**
 * Real (inflation-stripped) multiplier on the initial budget at a given age.
 * 1.0 through Go-Go, compounding the signed Slow-Go adjustment through that phase,
 * then the No-Go adjustment on top, clamped up by the floor. Ages at or below the
 * Go-Go end (including pre-retirement ages) return 1.0 (never below the floor).
 */
export const realSpendingMultiplier = (age: number, cfg: PhasedSpendingConfig): number => {
  const floor = Math.max(0, cfg.floorPct) / 100;
  if (age <= cfg.goGoEndAge) return Math.max(1, floor);

  const slowYears = Math.min(age, cfg.slowGoEndAge) - cfg.goGoEndAge;
  let m = Math.pow(1 + cfg.slowGoAdjustmentPct / 100, Math.max(0, slowYears));

  if (age > cfg.slowGoEndAge) {
    const noGoYears = age - cfg.slowGoEndAge;
    m *= Math.pow(1 + cfg.noGoAdjustmentPct / 100, noGoYears);
  }
  return Math.max(m, floor);
};
