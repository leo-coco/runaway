import { describe, expect, it } from 'vitest';
import { DEFAULT_GROWTH_FADE, fadedCagrPct, type GrowthFadeConfig } from './growthFade';

const on: GrowthFadeConfig = { enabled: true, targetPct: 7, years: 10 };

describe('fadedCagrPct', () => {
  it('returns the base CAGR unchanged when disabled', () => {
    expect(fadedCagrPct(40, 0, DEFAULT_GROWTH_FADE)).toBe(40);
    expect(fadedCagrPct(40, 5, DEFAULT_GROWTH_FADE)).toBe(40);
  });

  it('leaves assets at or below the target untouched (only pulls down)', () => {
    expect(fadedCagrPct(7, 5, on)).toBe(7);
    expect(fadedCagrPct(4, 5, on)).toBe(4);
  });

  it('glides a high CAGR linearly from base to target over the fade window', () => {
    expect(fadedCagrPct(27, 0, on)).toBeCloseTo(27); // start: full
    expect(fadedCagrPct(27, 5, on)).toBeCloseTo(17); // halfway: (27+7)/2
    expect(fadedCagrPct(27, 10, on)).toBeCloseTo(7); // end of window: target
  });

  it('holds at the target after the fade window', () => {
    expect(fadedCagrPct(27, 20, on)).toBeCloseTo(7);
    expect(fadedCagrPct(27, 99, on)).toBeCloseTo(7);
  });
});
