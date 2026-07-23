import { describe, expect, it } from 'vitest';
import type { Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import { DEFAULT_MC_OPTIONS, type MonteCarloInput } from './monteCarlo';
import type { RatesTable } from './currencyService';
import {
  applyLevers,
  balanceToTarget,
  evalSuccess,
  leversToHoldingPatches,
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

  it('routes new capital and savings only to drawable assets', () => {
    const withIlliquid = (): MonteCarloInput => {
      const b = baseInput();
      return {
        ...b,
        assets: [
          ...b.assets.map((a) => ({ ...a, startValue: 500_000 })),
          {
            startValue: 500_000,
            driftPct: 3,
            sigmaPct: 5,
            annualContribution: 0,
            accountId: 'a',
            drawable: false,
            assetClass: 'other' as const,
            symbol: 'ART',
          },
        ],
        correlation: [
          [1, 0.45, 0],
          [0.45, 1, 0],
          [0, 0, 1],
        ],
      };
    };
    const { input } = applyLevers(
      withIlliquid(),
      baseOpts,
      lev({ extraCapital: 300_000, extraMonthlySavings: 1_000 }),
    );
    const illiquid = input.assets.find((a) => a.drawable === false)!;
    // Money the user commits must be able to fund retirement: none of it may
    // land in an asset the engine will never draw down.
    expect(illiquid.startValue).toBeCloseTo(500_000, 2);
    expect(illiquid.annualContribution).toBeCloseTo(0, 6);
    // It is all still there, split across the two drawable assets (500k each).
    expect(sumStart(input)).toBeCloseTo(1_800_000, 2);
    for (const a of input.assets.filter((x) => x.drawable !== false)) {
      expect(a.startValue).toBeCloseTo(650_000, 2);
      expect(a.annualContribution).toBeCloseTo(6_000, 2);
    }
  });

  it('keeps de-risked crypto in the account it came from', () => {
    const twoAccounts = (): MonteCarloInput => {
      const b = baseInput();
      return {
        ...b,
        assets: [
          { ...b.assets[0]!, accountId: 'taxable', startValue: 400_000 },
          { ...b.assets[0]!, accountId: 'roth', startValue: 200_000, symbol: 'BTC2' },
          { ...b.assets[1]!, accountId: 'taxable' },
        ],
        correlation: [
          [1, 1, 0.45],
          [1, 1, 0.45],
          [0.45, 0.45, 1],
        ],
        accounts: [
          { id: 'taxable', effectiveTaxRate: 0 },
          { id: 'roth', effectiveTaxRate: 0 },
        ],
        accountOrder: ['taxable', 'roth'],
      };
    };
    const { input } = applyLevers(twoAccounts(), baseOpts, lev({ deriskFraction: 1 }));
    const stable = input.assets.filter((a) => a.symbol === 'Stable');
    // Selling BTC inside a Roth does not move the proceeds to a taxable account:
    // one stable bucket per source account, each holding that account's crypto.
    expect(stable).toHaveLength(2);
    expect(stable.find((s) => s.accountId === 'taxable')!.startValue).toBeCloseTo(400_000, 2);
    expect(stable.find((s) => s.accountId === 'roth')!.startValue).toBeCloseTo(200_000, 2);
    expect(sumStart(input)).toBeCloseTo(1_000_000, 2);
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
  /**
   * The solver runs a Monte Carlo per candidate, so this multiplies: at 800 the
   * two search tests cost ~2.7s and ~1.7s under coverage, which on a CI runner
   * lands past vitest's 5s default. 200 resolves the same levers.
   */
  const ITERS = 200;
  /**
   * Must be a target the base plan does NOT already meet. It succeeds ~94.5% at
   * neutral levers, so the original 0.6 was satisfied at zero effort: the
   * bisection converged on λ≈1.5e-5 and "solved" the plan with $0.09 of savings
   * and $30 of capital. Both assertions below then passed on rounding dust, and
   * inverting the bisection comparison went undetected.
   */
  const TARGET = 0.97;
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

  it('reaches a feasible target by committing real effort, and lands on it', () => {
    const r = balanceToTarget(baseInput(), baseOpts, TARGET, noLocks, neutral, bounds, ITERS);
    expect(r.reached).toBe(true);
    expect(r.success).toBeGreaterThanOrEqual(TARGET - 0.02);
    // The bisection looks for the LEAST effort that clears the target, so it must
    // settle near it rather than overshooting to full effort.
    expect(r.success).toBeLessThan(TARGET + 0.02);
    expect(r.levers.spending).toBeLessThan(neutral.spending);
    expect(r.levers.extraCapital).toBeGreaterThan(1_000);
  });

  it('keeps locked levers fixed and leans harder on the unlocked ones', () => {
    const locked: Record<ActiveLeverKey, boolean> = { ...noLocks, spending: true };
    const free = balanceToTarget(baseInput(), baseOpts, TARGET, noLocks, neutral, bounds, ITERS);
    const r = balanceToTarget(baseInput(), baseOpts, TARGET, locked, neutral, bounds, ITERS);

    expect(r.levers.spending).toBe(neutral.spending);
    expect(r.reached).toBe(true);
    // Denied the spending lever, the same target has to be bought with more of
    // the others — not merely with a non-zero amount of them.
    expect(r.levers.extraCapital).toBeGreaterThan(free.levers.extraCapital);
    expect(r.levers.extraMonthlySavings).toBeGreaterThan(free.levers.extraMonthlySavings);
  });

  it('reports reached=false when every lever is locked and the target is out of reach', () => {
    const allLocked: Record<ActiveLeverKey, boolean> = {
      spending: true,
      extraMonthlySavings: true,
      retireDelayYears: true,
      extraCapital: true,
    };
    // Locked at neutral (current = high spending) → can't improve → can't hit 99%.
    const r = balanceToTarget(baseInput(), baseOpts, 0.99, allLocked, neutral, bounds, ITERS);
    expect(r.reached).toBe(false);
    expect(r.levers).toEqual(neutral);
  });
});

describe('leversToHoldingPatches', () => {
  const mkHolding = (over: Partial<Holding> & { id: string; nativeCurrency?: string }): Holding =>
    ({
      id: over.id,
      instrument: {
        id: over.id,
        symbol: over.id,
        name: over.id,
        assetClass: 'us_equity',
        exchange: 'NASDAQ',
        nativeCurrency: over.nativeCurrency ?? 'USD',
      },
      quantity: over.quantity ?? 0,
      pricePerUnit: over.pricePerUnit ?? 1,
      expectedCagrPct: 7,
      monthlyContribution: over.monthlyContribution ?? 0,
      accountId: 'a',
      costBasis: over.costBasis,
    }) as unknown as Holding;

  const mkPlan = (holdings: Holding[], currency = 'USD'): Plan =>
    ({ id: 'p', currency, holdings }) as unknown as Plan;

  // h1: 100k @ $100/unit (1000 units); h2: 400k @ $50/unit (8000 units) — 20/80 split.
  const h1 = mkHolding({ id: 'h1', quantity: 1_000, pricePerUnit: 100 });
  const h2 = mkHolding({ id: 'h2', quantity: 8_000, pricePerUnit: 50, monthlyContribution: 100 });
  const assetsFor = (holdings: Holding[]) =>
    holdings.map((h) => ({
      startValue: h.quantity * h.pricePerUnit,
      driftPct: 7,
      sigmaPct: 15,
      annualContribution: h.monthlyContribution * 12,
      accountId: h.accountId,
      holdingId: h.id,
      drawable: (h as unknown as { drawable?: boolean }).drawable,
    }));
  const input = (holdings: Holding[]): MonteCarloInput => ({
    ...baseInput(),
    assets: assetsFor(holdings),
  });

  it('splits extra capital pro-rata by drawable value and converts to units', () => {
    const plan = mkPlan([h1, h2]);
    const patches = leversToHoldingPatches(
      plan,
      undefined,
      input([h1, h2]),
      lev({ extraCapital: 100_000 }),
    );
    expect(patches).toHaveLength(2);
    const p1 = patches.find((p) => p.holdingId === 'h1')!;
    const p2 = patches.find((p) => p.holdingId === 'h2')!;
    // 20% of 100k = 20k -> +200 units on h1 ($100/unit); 80% = 80k -> +1600 units on h2 ($50/unit).
    expect(p1.patch.quantity).toBeCloseTo(1_000 + 200, 6);
    expect(p2.patch.quantity).toBeCloseTo(8_000 + 1_600, 6);
  });

  it('splits extra monthly savings pro-rata and adds to monthlyContribution', () => {
    const plan = mkPlan([h1, h2]);
    const patches = leversToHoldingPatches(
      plan,
      undefined,
      input([h1, h2]),
      lev({ extraMonthlySavings: 1_000 }),
    );
    const p1 = patches.find((p) => p.holdingId === 'h1')!;
    const p2 = patches.find((p) => p.holdingId === 'h2')!;
    expect(p1.patch.monthlyContribution).toBeCloseTo(0 + 200, 6); // 20% of 1000
    expect(p2.patch.monthlyContribution).toBeCloseTo(100 + 800, 6); // 100 + 80% of 1000
  });

  it('recomputes a weighted-average cost basis when one was already set', () => {
    const withBasis = mkHolding({ id: 'h1', quantity: 1_000, pricePerUnit: 100, costBasis: 80 });
    const plan = mkPlan([withBasis]);
    const patches = leversToHoldingPatches(
      plan,
      undefined,
      input([withBasis]),
      lev({ extraCapital: 20_000 }),
    );
    const p1 = patches[0]!;
    // +200 units bought at $100 (current price): (80*1000 + 100*200) / 1200 = 83.33
    expect(p1.patch.costBasis).toBeCloseTo((80 * 1_000 + 100 * 200) / 1_200, 4);
  });

  it('never emits costBasis when the holding had none set', () => {
    const plan = mkPlan([h1]);
    const patches = leversToHoldingPatches(
      plan,
      undefined,
      input([h1]),
      lev({ extraCapital: 20_000 }),
    );
    expect(patches[0]!.patch.costBasis).toBeUndefined();
  });

  it('skips illiquid holdings, same as the preview', () => {
    const illiquid = { ...h2, drawable: false } as unknown as Holding;
    const plan = mkPlan([h1, illiquid]);
    const assets = assetsFor([h1, illiquid]).map((a, i) => ({
      ...a,
      drawable: i === 1 ? false : true,
    }));
    const patches = leversToHoldingPatches(
      plan,
      undefined,
      { ...baseInput(), assets },
      lev({ extraCapital: 100_000 }),
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]!.holdingId).toBe('h1');
  });

  it('converts amounts through the rates table when the holding is in a different currency', () => {
    const eurHolding = mkHolding({
      id: 'h1',
      quantity: 1_000,
      pricePerUnit: 90, // native EUR price
      nativeCurrency: 'EUR',
    });
    const plan = mkPlan([eurHolding], 'USD');
    const table: RatesTable = { base: 'USD', rates: { USD: 1, EUR: 0.9 }, asOf: 0 };
    const patches = leversToHoldingPatches(
      plan,
      table,
      input([eurHolding]),
      lev({ extraCapital: 10_000 }),
    );
    // $10,000 plan-currency -> €9,000 native -> 9000/90 = 100 units.
    expect(patches[0]!.patch.quantity).toBeCloseTo(1_000 + 100, 6);
  });

  it('returns nothing for neutral levers', () => {
    const plan = mkPlan([h1, h2]);
    expect(leversToHoldingPatches(plan, undefined, input([h1, h2]), neutral)).toEqual([]);
  });
});
