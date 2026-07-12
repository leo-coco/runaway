import { describe, expect, it } from 'vitest';
import { CLASS_HISTORY, CRYPTO_HISTORY_CAP, classReturnHistory } from './volatility';
import { ASSET_CLASSES } from './assetClass';

describe('class return history', () => {
  it('crypto history is capped at the forward ceiling (+200%/yr)', () => {
    for (const r of CLASS_HISTORY.crypto) {
      expect(r).toBeLessThanOrEqual(CRYPTO_HISTORY_CAP);
    }
    // The cap must actually bind somewhere (real BTC years exceeded it).
    expect(Math.max(...CLASS_HISTORY.crypto)).toBeCloseTo(CRYPTO_HISTORY_CAP);
  });

  it('every asset class has a same-length, non-empty history', () => {
    const len = CLASS_HISTORY.us_equity.length;
    for (const c of ASSET_CLASSES) {
      expect(classReturnHistory(c).length).toBe(len);
      expect(len).toBeGreaterThan(0);
    }
  });
});
