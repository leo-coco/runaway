import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHASED_SPENDING,
  phaseForAge,
  realSpendingMultiplier,
  type PhasedSpendingConfig,
} from './spendingModel';

const cfg: PhasedSpendingConfig = DEFAULT_PHASED_SPENDING; // 75 / 85, −1.5% / −1.5%, floor 70%

describe('phaseForAge', () => {
  it('classifies ages into the three phases', () => {
    expect(phaseForAge(60, cfg)).toBe('goGo');
    expect(phaseForAge(75, cfg)).toBe('goGo');
    expect(phaseForAge(76, cfg)).toBe('slowGo');
    expect(phaseForAge(85, cfg)).toBe('slowGo');
    expect(phaseForAge(86, cfg)).toBe('noGo');
  });
});

describe('realSpendingMultiplier', () => {
  it('holds full budget through the Go-Go phase', () => {
    expect(realSpendingMultiplier(60, cfg)).toBe(1);
    expect(realSpendingMultiplier(75, cfg)).toBe(1);
  });

  it('declines through Slow-Go at the configured rate', () => {
    // One year into Slow-Go => one year of −1.5%.
    expect(realSpendingMultiplier(76, cfg)).toBeCloseTo(0.985, 4);
    // End of Slow-Go => 10 years of −1.5%.
    expect(realSpendingMultiplier(85, cfg)).toBeCloseTo(Math.pow(0.985, 10), 4);
  });

  it('continues declining through No-Go, compounding on the Slow-Go end value', () => {
    const slowEnd = Math.pow(0.985, 10);
    expect(realSpendingMultiplier(90, cfg)).toBeCloseTo(slowEnd * Math.pow(0.985, 5), 4);
  });

  it('never falls below the floor', () => {
    const floored: PhasedSpendingConfig = { ...cfg, noGoAdjustmentPct: -10 };
    // Deep into No-Go with a steep decline the floor (0.70) must hold.
    expect(realSpendingMultiplier(110, floored)).toBeCloseTo(0.7, 6);
  });

  it('is monotonically non-increasing with age when adjustments are negative', () => {
    let prev = Infinity;
    for (let age = 60; age <= 100; age += 1) {
      const m = realSpendingMultiplier(age, cfg);
      expect(m).toBeLessThanOrEqual(prev + 1e-9);
      prev = m;
    }
  });

  it('collapses Slow-Go rather than back-dating No-Go when the ages are inverted', () => {
    // Only reachable from a stored/imported config: the form refuses this pair.
    const inverted: PhasedSpendingConfig = {
      ...cfg,
      goGoEndAge: 85,
      slowGoEndAge: 75,
      noGoAdjustmentPct: -5,
    };
    expect(phaseForAge(85, inverted)).toBe('goGo');
    expect(phaseForAge(86, inverted)).toBe('noGo');
    expect(realSpendingMultiplier(85, inverted)).toBe(1);
    // 86 is one year past Go-Go, so exactly one year of No-Go — not eleven.
    expect(realSpendingMultiplier(86, inverted)).toBeCloseTo(0.95, 4);
  });

  it('grows real spending when adjustments are positive', () => {
    const rising: PhasedSpendingConfig = {
      ...cfg,
      slowGoAdjustmentPct: 2,
      noGoAdjustmentPct: 3,
    };
    // One year into Slow-Go at +2%.
    expect(realSpendingMultiplier(76, rising)).toBeCloseTo(1.02, 4);
    // No-Go compounds on the Slow-Go end value (+2% for 10y, then +3%).
    const slowEnd = Math.pow(1.02, 10);
    expect(realSpendingMultiplier(90, rising)).toBeCloseTo(slowEnd * Math.pow(1.03, 5), 4);
  });
});
