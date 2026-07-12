import { describe, expect, it } from 'vitest';
import { DEFAULT_MC_OPTIONS, type MonteCarloInput } from './monteCarlo';
import {
  applyLevers,
  balanceToTarget,
  evalSuccess,
  neutralLevers,
  type ActiveLeverKey,
  type Levers,
} from './goalSeek';

const baseInput = (): MonteCarloInput => ({
  assets: [
    {
      startValue: 600_000,
      driftPct: 12,
      sigmaPct: 60,
      annualContribution: 0,
      accountId: 'a',
      assetClass: 'crypto',
      symbol: 'BTC',
    },
    {
      startValue: 400_000,
      driftPct: 7,
      sigmaPct: 15,
      annualContribution: 0,
      accountId: 'a',
      assetClass: 'us_equity',
      symbol: 'VTI',
    },
  ],
  correlation: [
    [1, 0.45],
    [0.45, 1],
  ],
  accounts: [{ id: 'a', effectiveTaxRate: 0 }],
  accountOrder: ['a'],
  annualSpending: 60_000,
  inflationPct: 0,
  applyInflation: false,
  startYear: 2026,
  retirementYear: 2030,
  horizonYears: 40,
});

const baseOpts = { ...DEFAULT_MC_OPTIONS, seed: 123, retirementHorizon: 30 };
const sumStart = (i: MonteCarloInput) => i.assets.reduce((s, a) => s + a.startValue, 0);
const sumContrib = (i: MonteCarloInput) => i.assets.reduce((s, a) => s + a.annualContribution, 0);
const neutral = neutralLevers(60_000);
const lev = (over: Partial<Levers>): Levers => ({ ...neutral, ...over });

describe('applyLevers', () => {
  it('leaves the plan unchanged at neutral levers', () => {
    const { input, options } = applyLevers(baseInput(), baseOpts, neutral);
    expect(input.annualSpending).toBe(60_000);
    expect(input.assets).toHaveLength(2);
    expect(input.retirementYear).toBe(2030);
    expect(options.retirementHorizon).toBe(30);
    expect(sumStart(input)).toBeCloseTo(1_000_000, 2);
  });

  it('adds extra capital to the total starting value', () => {
    const { input } = applyLevers(baseInput(), baseOpts, lev({ extraCapital: 100_000 }));
    expect(sumStart(input)).toBeCloseTo(1_100_000, 2);
  });

  it('adds extra monthly savings to the annual contributions (×12)', () => {
    const { input } = applyLevers(baseInput(), baseOpts, lev({ extraMonthlySavings: 1_000 }));
    expect(sumContrib(input)).toBeCloseTo(12_000, 2);
  });

  it('retiring later shifts the year and shortens the funded horizon', () => {
    const { input, options } = applyLevers(baseInput(), baseOpts, lev({ retireDelayYears: 5 }));
    expect(input.retirementYear).toBe(2035);
    expect(options.retirementHorizon).toBe(25);
  });

  it('de-risk moves a slice of crypto into a stable bucket, preserving total value', () => {
    const { input } = applyLevers(baseInput(), baseOpts, lev({ deriskFraction: 0.5 }));
    expect(input.assets).toHaveLength(3); // a stable asset was appended
    expect(sumStart(input)).toBeCloseTo(1_000_000, 2); // value conserved
    const crypto = input.assets.find((a) => a.assetClass === 'crypto')!;
    expect(crypto.startValue).toBeCloseTo(300_000, 2); // 600k → halved
    const stable = input.assets.at(-1)!;
    expect(stable.assetClass).toBe('other');
    expect(stable.startValue).toBeCloseTo(300_000, 2);
    expect(input.correlation).toHaveLength(3); // matrix rebuilt to match
  });
});

describe('evalSuccess monotonicity (common random numbers)', () => {
  const iters = 800;
  const s = (over: Partial<Levers>) => evalSuccess(baseInput(), baseOpts, lev(over), iters);

  it('more spending never raises the success rate', () => {
    expect(s({ spending: 90_000 })).toBeLessThanOrEqual(s({ spending: 40_000 }));
  });

  it('more starting capital never lowers the success rate', () => {
    expect(s({ extraCapital: 600_000 })).toBeGreaterThanOrEqual(s({}));
  });

  it('more savings never lowers the success rate', () => {
    expect(s({ extraMonthlySavings: 3_000 })).toBeGreaterThanOrEqual(s({}));
  });

  it('retiring later never lowers the success rate', () => {
    expect(s({ retireDelayYears: 8 })).toBeGreaterThanOrEqual(s({}));
  });

  it('returns a valid probability for any de-risk fraction', () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const v = s({ deriskFraction: f });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('balanceToTarget', () => {
  const bounds = {
    baseSpending: 60_000,
    maxSavings: 6_000,
    maxRetireYears: 20,
    maxCapital: 2_000_000,
  };
  const noLocks: Record<ActiveLeverKey, boolean> = {
    spending: false,
    extraMonthlySavings: false,
    retireDelayYears: false,
    extraCapital: false,
  };

  it('reaches a feasible target and reports success ≥ target', () => {
    const r = balanceToTarget(baseInput(), baseOpts, 0.6, noLocks, neutral, bounds, 800);
    expect(r.reached).toBe(true);
    expect(r.success).toBeGreaterThanOrEqual(0.6 - 0.02);
  });

  it('keeps locked levers fixed and only moves the unlocked ones', () => {
    const locked: Record<ActiveLeverKey, boolean> = { ...noLocks, spending: true };
    const r = balanceToTarget(baseInput(), baseOpts, 0.6, locked, neutral, bounds, 800);
    // Spending is locked → unchanged from the current (neutral) value.
    expect(r.levers.spending).toBe(neutral.spending);
    // At least one unlocked lever moved off neutral to do the work.
    const movedSomething =
      r.levers.extraMonthlySavings > 0 ||
      r.levers.retireDelayYears > 0 ||
      r.levers.extraCapital > 0;
    expect(movedSomething).toBe(true);
  });

  it('reports reached=false when every lever is locked and the target is out of reach', () => {
    const allLocked: Record<ActiveLeverKey, boolean> = {
      spending: true,
      extraMonthlySavings: true,
      retireDelayYears: true,
      extraCapital: true,
    };
    // Locked at neutral (current = high spending) → can't improve → can't hit 99%.
    const r = balanceToTarget(baseInput(), baseOpts, 0.99, allLocked, neutral, bounds, 800);
    expect(r.reached).toBe(false);
    expect(r.levers).toEqual(neutral);
  });
});
