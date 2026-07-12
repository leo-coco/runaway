import { describe, expect, it } from 'vitest';
import { classifySwr, safeWithdrawalRate } from './withdrawalRate';

describe('safeWithdrawalRate', () => {
  it('computes the rate as spending over portfolio value', () => {
    const status = safeWithdrawalRate(60_000, 638_000);
    expect(status).not.toBeNull();
    expect(status!.rate).toBeCloseTo(9.4, 1);
    expect(status!.zone).toBe('high_risk');
  });

  it('returns null when the portfolio value is not positive', () => {
    expect(safeWithdrawalRate(60_000, 0)).toBeNull();
    expect(safeWithdrawalRate(60_000, -10)).toBeNull();
  });

  it('classifies zones: <4 safe, 4–6 caution, >6 high risk', () => {
    expect(classifySwr(3.5)).toBe('safe');
    expect(classifySwr(3.99)).toBe('safe');
    expect(classifySwr(4)).toBe('caution');
    expect(classifySwr(5)).toBe('caution');
    expect(classifySwr(6)).toBe('caution');
    expect(classifySwr(6.01)).toBe('high_risk');
    expect(classifySwr(9.4)).toBe('high_risk');
  });
});
