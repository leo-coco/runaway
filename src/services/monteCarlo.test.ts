import { describe, expect, it } from 'vitest';
import { createSeedPlan } from '@/store/seed';
import { accountFromPreset, BASE_TAXABLE_PRESET } from '@/domain/account';
import { rescalePlanAmounts, type Plan } from '@/domain/plan';
import {
  BTC_CYCLE_OFFSET,
  DEFAULT_MC_OPTIONS,
  bitcoinCyclePhase,
  buildMonteCarloInput,
  choleskyFactor,
  correlationKey,
  isBitcoinSymbol,
  runMonteCarlo,
  sampleMonteCarloPath,
  sampleRandomScenario,
  sampleScenarioPaths,
  sampleTrials,
  type MonteCarloInput,
} from './monteCarlo';

/** Reconstruct L·Lᵀ from a lower-triangular factor. */
const reconstruct = (L: number[][]): number[][] => {
  const n = L.length;
  const out = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1)
    for (let j = 0; j < n; j += 1) {
      let s = 0;
      for (let k = 0; k <= Math.min(i, j); k += 1) s += L[i]![k]! * L[j]![k]!;
      out[i]![j] = s;
    }
  return out;
};

const baseInput = (overrides: Partial<MonteCarloInput> = {}): MonteCarloInput => ({
  assets: [
    { startValue: 1_000_000, driftPct: 5, sigmaPct: 15, annualContribution: 0, accountId: 'a' },
  ],
  correlation: [[1]],
  accounts: [{ id: 'a', effectiveTaxRate: 0 }],
  accountOrder: ['a'],
  annualSpending: 40_000,
  inflationPct: 2,
  applyInflation: true,
  startYear: 2026,
  retirementYear: 2026,
  horizonYears: 30,
  ...overrides,
});

describe('sampleRandomScenario', () => {
  // Model pinned to 'normal' (rather than relying on DEFAULT_MC_OPTIONS.model):
  // this suite is testing RNG/seed plumbing, not model-specific behaviour, and
  // some model + seed pairs can coincidentally both deplete the portfolio to 0.
  const opts = { ...DEFAULT_MC_OPTIONS, retirementHorizon: 30, model: 'normal' as const };

  it('is reproducible for a given sample seed', () => {
    const a = sampleRandomScenario(baseInput(), opts, 12345, 20_000);
    const b = sampleRandomScenario(baseInput(), opts, 12345, 20_000);
    expect(a.terminalBalance).toBe(b.terminalBalance);
    expect(a.percentile).toBe(b.percentile);
    expect(a.sampleIndex).toBe(b.sampleIndex);
  });

  it('returns a path, a percentile in [0, 100] and a 1-based index within the run', () => {
    const r = sampleRandomScenario(baseInput(), opts, 777, 20_000);
    expect(r.path.years.length).toBeGreaterThan(0);
    expect(r.percentile).toBeGreaterThanOrEqual(0);
    expect(r.percentile).toBeLessThanOrEqual(100);
    expect(r.sampleIndex).toBeGreaterThanOrEqual(1);
    expect(r.sampleIndex).toBeLessThanOrEqual(20_000);
  });

  it('different seeds generally yield different draws', () => {
    const a = sampleRandomScenario(baseInput(), opts, 1, 20_000);
    const b = sampleRandomScenario(baseInput(), opts, 999_983, 20_000);
    expect(a.terminalBalance).not.toBe(b.terminalBalance);
  });

  it('the focal path matches a direct single-path sample for the same seed', () => {
    const r = sampleRandomScenario(baseInput(), opts, 54321, 20_000);
    const direct = sampleMonteCarloPath(baseInput(), { ...opts, seed: 54321 });
    expect(r.path.years.at(-1)?.closingTotal).toBe(direct.years.at(-1)?.closingTotal);
  });
});

describe('runMonteCarlo', () => {
  it('is reproducible for a given seed', () => {
    const opts = { iterations: 500, seed: 42, retirementHorizon: 30 };
    const a = runMonteCarlo(baseInput(), opts);
    const b = runMonteCarlo(baseInput(), opts);
    expect(a.successRate).toBe(b.successRate);
    expect(a.medianEndBalance).toBe(b.medianEndBalance);
  });

  it('returns a success rate in [0, 1] and per-year percentiles', () => {
    const r = runMonteCarlo(baseInput(), { iterations: 800, seed: 1, retirementHorizon: 30 });
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(1);
    expect(r.percentiles.length).toBeGreaterThan(0);
    for (const p of r.percentiles) {
      // The seven percentiles must be monotonically non-decreasing.
      expect(p.p1).toBeLessThanOrEqual(p.p5 + 1);
      expect(p.p5).toBeLessThanOrEqual(p.p10 + 1);
      expect(p.p10).toBeLessThanOrEqual(p.p25 + 1);
      expect(p.p25).toBeLessThanOrEqual(p.p50 + 1);
      expect(p.p50).toBeLessThanOrEqual(p.p75 + 1);
      expect(p.p75).toBeLessThanOrEqual(p.p90 + 1);
    }
  });

  it('with zero volatility matches the deterministic outcome (high success)', () => {
    // 1M at 5% real growth funding 40k/yr (no inflation) easily lasts 30y.
    const r = runMonteCarlo(
      baseInput({
        assets: [
          {
            startValue: 1_000_000,
            driftPct: 5,
            sigmaPct: 0,
            annualContribution: 0,
            accountId: 'a',
          },
        ],
        applyInflation: false,
      }),
      { iterations: 200, seed: 7, retirementHorizon: 30 },
    );
    expect(r.successRate).toBe(1);
  });

  it('centers the median on the CAGR (geometric): no volatility drag to the median', () => {
    // Pure accumulation, volatile single asset. With geometric centering the median
    // end balance should track the deterministic compound start·(1+g)^years, NOT be
    // dragged below it by σ²/2.
    const start = 1_000_000;
    const g = 0.08;
    const years = 25;
    const r = runMonteCarlo(
      baseInput({
        assets: [
          {
            startValue: start,
            driftPct: g * 100,
            sigmaPct: 40,
            annualContribution: 0,
            accountId: 'a',
          },
        ],
        annualSpending: 0,
        applyInflation: false,
        horizonYears: years,
      }),
      { iterations: 4000, seed: 123, retirementHorizon: 30, meanReversion: 0 },
    );
    const deterministic = start * Math.pow(1 + g, years);
    const medianEnd = r.percentiles.at(-1)!.p50;
    // Median within ~12% of the deterministic compound (sampling noise aside).
    expect(medianEnd).toBeGreaterThan(deterministic * 0.88);
    expect(medianEnd).toBeLessThan(deterministic * 1.12);
  });

  it('keeps the median on the CAGR at cap-biting volatility, across models', () => {
    // The per-year caps are asymmetric in log space, so at high σ the ceiling clips
    // the upper tail and would drag the median compound rate far below the stated
    // CAGR. The cap-bias compensation restores it. Mean reversion is deliberately
    // ON here: it interacts with the caps (dev accumulates the CAPPED return), and
    // a δ calibrated without it overshoots by >10 pts at σ=110%.
    const start = 1_000_000;
    const years = 20;
    for (const model of ['normal', 'fat-tails', 'bootstrap'] as const) {
      for (const [sigmaPct, driftPct] of [
        [70, 20],
        [110, 25],
      ] as const) {
        const r = runMonteCarlo(
          baseInput({
            assets: [
              { startValue: start, driftPct, sigmaPct, annualContribution: 0, accountId: 'a' },
            ],
            annualSpending: 0,
            applyInflation: false,
            horizonYears: years,
          }),
          { iterations: 20_000, seed: 12345, retirementHorizon: 1, model, meanReversion: 0.15 },
        );
        const medianEnd = r.percentiles.at(-1)!.p50;
        const realisedPct = (Math.pow(medianEnd / start, 1 / (years + 1)) - 1) * 100;
        // Within 1.5 pts of the stated CAGR; uncompensated this misses by 10+.
        expect(Math.abs(realisedPct - driftPct)).toBeLessThan(1.5);
      }
    }
  }, 30_000);

  it('growth fade lowers a high-CAGR asset’s median end balance', () => {
    // A 30% CAGR asset, pure accumulation. Fading it toward 7% over 10y must pull
    // the median end balance well below the un-faded run.
    const input = (fade: boolean) =>
      baseInput({
        assets: [
          {
            startValue: 1_000_000,
            driftPct: 30,
            sigmaPct: 10,
            annualContribution: 0,
            accountId: 'a',
          },
        ],
        annualSpending: 0,
        applyInflation: false,
        horizonYears: 25,
        growthFade: { enabled: fade, targetPct: 7, years: 10 },
      });
    const opts = { iterations: 1500, seed: 5, retirementHorizon: 30, meanReversion: 0 };
    const faded = runMonteCarlo(input(true), opts);
    const full = runMonteCarlo(input(false), opts);
    expect(faded.percentiles.at(-1)!.p50).toBeLessThan(full.percentiles.at(-1)!.p50 * 0.5);
  });

  it('growth fade leaves an at-target asset unchanged', () => {
    const input = (fade: boolean) =>
      baseInput({
        assets: [
          {
            startValue: 1_000_000,
            driftPct: 7,
            sigmaPct: 12,
            annualContribution: 0,
            accountId: 'a',
          },
        ],
        annualSpending: 0,
        applyInflation: false,
        horizonYears: 20,
        growthFade: { enabled: fade, targetPct: 7, years: 10 },
      });
    const opts = { iterations: 800, seed: 9, retirementHorizon: 30, meanReversion: 0 };
    expect(runMonteCarlo(input(true), opts).medianEndBalance).toBe(
      runMonteCarlo(input(false), opts).medianEndBalance,
    );
  });

  it('caps each asset’s yearly return to +200% / −95% even at extreme volatility', () => {
    // A wildly volatile alt (σ=150%) over a long horizon: no single modelled year
    // may exceed the caps, for any model. Protects against absurd lognormal tails
    // for ANY volatile holding (SOL, ETH, …), not just Bitcoin.
    const wild = baseInput({
      assets: [
        {
          startValue: 100_000,
          driftPct: 20,
          sigmaPct: 150,
          annualContribution: 0,
          accountId: 'a',
          assetClass: 'crypto',
          symbol: 'SOL',
        },
      ],
      annualSpending: 0,
      applyInflation: false,
      horizonYears: 40,
    });
    for (const model of ['normal', 'fat-tails', 'crash-aware', 'bootstrap'] as const) {
      const path = sampleMonteCarloPath(wild, {
        iterations: 1,
        seed: 2024,
        retirementHorizon: 30,
        model,
      });
      for (const y of path.years) {
        for (const a of y.assets) {
          expect(a.returnPct).toBeLessThanOrEqual(200 + 1e-6);
          expect(a.returnPct).toBeGreaterThanOrEqual(-95 - 1e-6);
        }
      }
    }
  });

  it('higher spending lowers the success rate', () => {
    const opts = { iterations: 800, seed: 3, retirementHorizon: 30 };
    const low = runMonteCarlo(baseInput({ annualSpending: 30_000 }), opts);
    const high = runMonteCarlo(baseInput({ annualSpending: 80_000 }), opts);
    expect(high.successRate).toBeLessThan(low.successRate);
  });

  it('crash-aware lowers success and the downside vs the normal model (equity)', () => {
    const equity = (model: 'normal' | 'crash-aware') =>
      runMonteCarlo(
        baseInput({
          annualSpending: 60_000,
          assets: [
            {
              startValue: 1_000_000,
              driftPct: 5,
              sigmaPct: 15,
              annualContribution: 0,
              accountId: 'a',
              assetClass: 'us_equity',
              symbol: 'VTI',
            },
          ],
        }),
        { iterations: 2500, seed: 4, retirementHorizon: 30, model },
      );
    const normal = equity('normal');
    const crash = equity('crash-aware');
    expect(crash.successRate).toBeLessThan(normal.successRate);
    expect(crash.percentiles.at(-1)!.p10).toBeLessThanOrEqual(normal.percentiles.at(-1)!.p10);
  });

  it('crash-aware barely touches a defensive (bond/cash-like "other") asset', () => {
    // The crash beta for the "other" class is 0, so crash-aware ≈ normal for a
    // defensive holding — it is not dragged into the equity crash.
    const defensive = (model: 'normal' | 'crash-aware') =>
      runMonteCarlo(
        baseInput({
          annualSpending: 0,
          applyInflation: false,
          horizonYears: 25,
          assets: [
            {
              startValue: 1_000_000,
              driftPct: 4,
              sigmaPct: 8,
              annualContribution: 0,
              accountId: 'a',
              assetClass: 'other',
              symbol: 'BND',
            },
          ],
        }),
        { iterations: 3000, seed: 8, retirementHorizon: 30, meanReversion: 0, model },
      );
    const normal = defensive('normal').percentiles.at(-1)!;
    const crash = defensive('crash-aware').percentiles.at(-1)!;
    // Downside (p10) and median essentially unchanged — any gap is rng-stream
    // sampling noise (the crash regime consumes one extra draw per year), not a
    // systematic crash drag. Both stay within a few percent.
    expect(crash.p10).toBeGreaterThan(normal.p10 * 0.95);
    expect(Math.abs(crash.p50 - normal.p50) / normal.p50).toBeLessThan(0.05);
  });

  it('the return model actually changes the simulation (fat tails wired in)', () => {
    const opts = (model: 'normal' | 'fat-tails') => ({
      iterations: 1500,
      seed: 4,
      retirementHorizon: 30,
      model,
    });
    const normal = runMonteCarlo(baseInput(), opts('normal'));
    const fat = runMonteCarlo(baseInput(), opts('fat-tails'));
    expect(fat.medianEndBalance).not.toBe(normal.medianEndBalance);
  });

  it('bootstrap model is reproducible and returns a valid success rate', () => {
    const opts = { iterations: 1500, seed: 2, retirementHorizon: 30, model: 'bootstrap' as const };
    const a = runMonteCarlo(baseInput(), opts);
    const b = runMonteCarlo(baseInput(), opts);
    expect(a.successRate).toBe(b.successRate);
    expect(a.successRate).toBeGreaterThanOrEqual(0);
    expect(a.successRate).toBeLessThanOrEqual(1);
  });

  it('bootstrap handles a European-equity asset and differs from the normal model', () => {
    const input = baseInput({
      assets: [
        {
          startValue: 1_000_000,
          driftPct: 6,
          sigmaPct: 17,
          annualContribution: 0,
          accountId: 'a',
          assetClass: 'eu_equity',
          symbol: 'EUSTK',
        },
      ],
    });
    const boot = runMonteCarlo(input, {
      iterations: 1500,
      seed: 3,
      retirementHorizon: 30,
      model: 'bootstrap',
    });
    const norm = runMonteCarlo(input, {
      iterations: 1500,
      seed: 3,
      retirementHorizon: 30,
      model: 'normal',
    });
    expect(boot.medianEndBalance).not.toBe(norm.medianEndBalance);
    expect(boot.percentiles.length).toBeGreaterThan(0);
  });

  it('mean reversion narrows the long-run dispersion of outcomes', () => {
    // Pure accumulation (no withdrawals), volatile single asset, long horizon.
    const input = baseInput({
      assets: [
        { startValue: 1_000_000, driftPct: 5, sigmaPct: 25, annualContribution: 0, accountId: 'a' },
      ],
      annualSpending: 0,
      applyInflation: false,
      horizonYears: 30,
    });
    const spread = (meanReversion: number): number => {
      const r = runMonteCarlo(input, {
        iterations: 2000,
        seed: 99,
        retirementHorizon: 30,
        meanReversion,
      });
      const last = r.percentiles.at(-1)!;
      return last.p90 - last.p10;
    };
    expect(spread(0.4)).toBeLessThan(spread(0));
  });
});

describe('choleskyFactor (robust to non-PSD correlation matrices)', () => {
  it('factors a positive-definite matrix exactly (L·Lᵀ = C)', () => {
    const C = [
      [1, 0.5, 0.3],
      [0.5, 1, 0.4],
      [0.3, 0.4, 1],
    ];
    const R = reconstruct(choleskyFactor(C));
    for (let i = 0; i < 3; i += 1)
      for (let j = 0; j < 3; j += 1) expect(R[i]![j]).toBeCloseTo(C[i]![j]!, 9);
  });

  it('repairs a non-positive-definite matrix into a valid factor (no NaN, unit diagonal)', () => {
    // This matrix is indefinite (correlations are mutually inconsistent).
    const bad = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    const L = choleskyFactor(bad);
    for (const row of L) for (const v of row) expect(Number.isFinite(v)).toBe(true);
    const R = reconstruct(L);
    // The repair shrinks off-diagonals toward 0 but keeps the unit diagonal.
    for (let i = 0; i < 3; i += 1) expect(R[i]![i]).toBeCloseTo(1, 6);
    expect(Math.abs(R[0]![1]!)).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it('runs a simulation with an inconsistent correlation matrix without producing NaN', () => {
    const input: MonteCarloInput = {
      assets: [
        { startValue: 500_000, driftPct: 6, sigmaPct: 15, annualContribution: 0, accountId: 'a' },
        { startValue: 500_000, driftPct: 6, sigmaPct: 15, annualContribution: 0, accountId: 'a' },
        { startValue: 500_000, driftPct: 6, sigmaPct: 15, annualContribution: 0, accountId: 'a' },
      ],
      correlation: [
        [1, 0.9, -0.9],
        [0.9, 1, 0.9],
        [-0.9, 0.9, 1],
      ],
      accounts: [{ id: 'a', effectiveTaxRate: 0 }],
      accountOrder: ['a'],
      annualSpending: 0,
      inflationPct: 0,
      applyInflation: false,
      startYear: 2026,
      retirementYear: 2100,
      horizonYears: 20,
    };
    const r = runMonteCarlo(input, { iterations: 300, seed: 1, retirementHorizon: 30 });
    for (const p of r.percentiles) {
      expect(Number.isFinite(p.p50)).toBe(true);
      expect(Number.isFinite(p.p10)).toBe(true);
      expect(Number.isFinite(p.p90)).toBe(true);
    }
  });
});

describe('bitcoin halving cycle overlay', () => {
  it('identifies BTC tickers but not other symbols', () => {
    expect(isBitcoinSymbol('BTC')).toBe(true);
    expect(isBitcoinSymbol('btc-usd')).toBe(true);
    expect(isBitcoinSymbol('XBT')).toBe(true);
    // Spot BTC ETFs are Bitcoin wrappers → also recognised.
    expect(isBitcoinSymbol('FBTC')).toBe(true);
    expect(isBitcoinSymbol('fbtc')).toBe(true);
    expect(isBitcoinSymbol('IBIT')).toBe(true);
    expect(isBitcoinSymbol('GBTC')).toBe(true);
    expect(isBitcoinSymbol('ETH')).toBe(false);
    expect(isBitcoinSymbol('AAPL')).toBe(false);
    expect(isBitcoinSymbol(undefined)).toBe(false);
  });

  it('maps calendar years to the right cycle phase', () => {
    expect(bitcoinCyclePhase(2024)).toBe(0); // halving year
    expect(bitcoinCyclePhase(2025)).toBe(1); // post-halving bull
    expect(bitcoinCyclePhase(2026)).toBe(2); // bear
    expect(bitcoinCyclePhase(2027)).toBe(3); // recovery
    expect(bitcoinCyclePhase(2028)).toBe(0); // next halving
  });

  it('phase offsets sum to zero (CAGR is preserved over a full cycle)', () => {
    const sum = BTC_CYCLE_OFFSET.reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(0, 10);
    expect(BTC_CYCLE_OFFSET[1]!).toBeGreaterThan(0); // bull is positive
    expect(BTC_CYCLE_OFFSET[2]!).toBeLessThan(0); // bear is negative
  });

  const btcInput = (): MonteCarloInput =>
    baseInput({
      assets: [
        {
          startValue: 1_000_000,
          driftPct: 20,
          sigmaPct: 60,
          annualContribution: 0,
          accountId: 'a',
          assetClass: 'crypto',
          symbol: 'BTC',
        },
      ],
      annualSpending: 0,
      applyInflation: false,
      startYear: 2026,
      retirementYear: 2026,
      horizonYears: 8,
    });

  it('makes a post-halving year out-grow the following bear year for BTC', () => {
    // Averaged over many seeds, the post-halving bull (2029) should beat the
    // bear (2030) for a Bitcoin holding when the overlay is on.
    let bull = 0;
    let bear = 0;
    const runs = 40;
    for (let s = 0; s < runs; s += 1) {
      const path = sampleMonteCarloPath(btcInput(), {
        iterations: 1,
        seed: 1000 + s,
        retirementHorizon: 30,
        btcCycle: true,
      });
      bull += path.years.find((y) => y.year === 2029)!.assets[0]!.returnPct;
      bear += path.years.find((y) => y.year === 2030)!.assets[0]!.returnPct;
    }
    expect(bull / runs).toBeGreaterThan(bear / runs);
  });

  it('does not leak the cycle into a correlated non-BTC asset', () => {
    // BTC + an equity correlated 0.4 with it. The cycle is a deterministic drift
    // added AFTER the correlated shock, only to BTC — so the equity's returns must
    // be byte-identical with the overlay on vs off, while BTC's must change.
    const mixed = baseInput({
      assets: [
        {
          startValue: 500_000,
          driftPct: 20,
          sigmaPct: 60,
          annualContribution: 0,
          accountId: 'a',
          assetClass: 'crypto',
          symbol: 'BTC',
        },
        {
          startValue: 500_000,
          driftPct: 7,
          sigmaPct: 15,
          annualContribution: 0,
          accountId: 'a',
          assetClass: 'us_equity',
          symbol: 'VTI',
        },
      ],
      correlation: [
        [1, 0.4],
        [0.4, 1],
      ],
      annualSpending: 0,
      applyInflation: false,
      startYear: 2026,
      retirementYear: 2026,
      horizonYears: 8,
    });
    const opts = (btcCycle: boolean) => ({
      iterations: 1,
      seed: 321,
      retirementHorizon: 30,
      btcCycle,
    });
    const off = sampleMonteCarloPath(mixed, opts(false));
    const on = sampleMonteCarloPath(mixed, opts(true));
    // Equity (asset 1): unaffected by the BTC halving overlay.
    expect(on.years.map((y) => y.assets[1]!.returnPct)).toEqual(
      off.years.map((y) => y.assets[1]!.returnPct),
    );
    // BTC (asset 0): the overlay does change its path.
    expect(on.years.map((y) => y.assets[0]!.returnPct)).not.toEqual(
      off.years.map((y) => y.assets[0]!.returnPct),
    );
  });

  it('leaves non-BTC assets untouched by the overlay', () => {
    const equity = baseInput({
      assets: [
        {
          startValue: 1_000_000,
          driftPct: 7,
          sigmaPct: 15,
          annualContribution: 0,
          accountId: 'a',
          assetClass: 'us_equity',
          symbol: 'VTI',
        },
      ],
      annualSpending: 0,
      applyInflation: false,
    });
    const opts = (btcCycle: boolean) => ({
      iterations: 1,
      seed: 77,
      retirementHorizon: 30,
      btcCycle,
    });
    const off = sampleMonteCarloPath(equity, opts(false));
    const on = sampleMonteCarloPath(equity, opts(true));
    expect(on.years.map((y) => y.assets[0]!.returnPct)).toEqual(
      off.years.map((y) => y.assets[0]!.returnPct),
    );
  });
});

describe('sampleScenarioPaths', () => {
  const opts = { iterations: 1, seed: 5, retirementHorizon: 30, meanReversion: 0.15 };

  it('ranks pessimistic ≤ median ≤ optimistic by terminal balance', () => {
    const s = sampleScenarioPaths(baseInput({ horizonYears: 30 }), opts, 81);
    expect(s.pessimistic.terminalBalance).toBeLessThanOrEqual(s.median.terminalBalance);
    expect(s.median.terminalBalance).toBeLessThanOrEqual(s.optimistic.terminalBalance);
    expect(s.pessimistic.percentile).toBe(10);
    expect(s.optimistic.percentile).toBe(90);
    expect(s.median.path.years.length).toBeGreaterThan(0);
  });
});

describe('sampleMonteCarloPath', () => {
  const opts = { iterations: 1, seed: 11, retirementHorizon: 30 };

  it('returns one row per simulated year and is reproducible', () => {
    const a = sampleMonteCarloPath(baseInput({ horizonYears: 10 }), opts);
    const b = sampleMonteCarloPath(baseInput({ horizonYears: 10 }), opts);
    expect(a.years).toHaveLength(11); // startYear..startYear+horizon inclusive
    expect(a.years[0]!.assets).toHaveLength(1);
    expect(a.years.map((y) => y.assets[0]!.returnPct)).toEqual(
      b.years.map((y) => y.assets[0]!.returnPct),
    );
  });

  it('records withdrawals only after retirement', () => {
    const path = sampleMonteCarloPath(
      baseInput({ startYear: 2026, retirementYear: 2030, horizonYears: 8 }),
      opts,
    );
    const before = path.years.find((y) => y.year === 2029)!;
    const after = path.years.find((y) => y.year === 2031)!;
    expect(before.isRetired).toBe(false);
    expect(before.netWithdrawal).toBe(0);
    expect(after.isRetired).toBe(true);
    expect(after.netWithdrawal).toBeGreaterThan(0);
  });

  it("a year's opening total carries over from the previous closing total", () => {
    const path = sampleMonteCarloPath(baseInput({ horizonYears: 5 }), opts);
    for (let i = 1; i < path.years.length; i += 1) {
      expect(path.years[i]!.openingTotal).toBeCloseTo(path.years[i - 1]!.closingTotal, 4);
    }
  });

  it('closing = opening + asset variations + contributions − gross withdrawal', () => {
    // Two assets, accumulation (contributions) then retirement (withdrawals),
    // with real volatility so the per-asset variations are non-trivial.
    const path = sampleMonteCarloPath(
      baseInput({
        assets: [
          {
            startValue: 800_000,
            driftPct: 6,
            sigmaPct: 10,
            annualContribution: 12_000,
            accountId: 'rrsp',
          },
          {
            startValue: 700_000,
            driftPct: 7,
            sigmaPct: 20,
            annualContribution: 6_000,
            accountId: 'nonreg',
          },
        ],
        correlation: [
          [1, 0.5],
          [0.5, 1],
        ],
        accounts: [
          { id: 'rrsp', effectiveTaxRate: 0.3 },
          { id: 'nonreg', effectiveTaxRate: 0.15 },
        ],
        accountOrder: ['rrsp', 'nonreg'],
        annualSpending: 50_000,
        startYear: 2026,
        retirementYear: 2031,
        horizonYears: 12,
      }),
      opts,
    );

    for (const y of path.years) {
      // Per asset: opening + appreciation = after-appreciation.
      for (const a of y.assets) {
        expect(a.opening + a.appreciation).toBeCloseTo(a.afterAppreciation, 2);
      }
      // Per-asset values sum to the recorded year totals.
      const sum = (pick: (a: (typeof y.assets)[number]) => number) =>
        y.assets.reduce((s, a) => s + pick(a), 0);
      expect(sum((a) => a.opening)).toBeCloseTo(y.openingTotal, 2);
      expect(sum((a) => a.appreciation)).toBeCloseTo(y.appreciation, 2);
      expect(sum((a) => a.closing)).toBeCloseTo(y.closingTotal, 2);
      // Year accounting identity.
      const expectedClosing =
        y.openingTotal + y.appreciation + y.contributionValue - y.grossWithdrawal;
      expect(expectedClosing).toBeCloseTo(y.closingTotal, 2);
    }
  });

  it('in retirement there are no contributions and the identity still holds', () => {
    const path = sampleMonteCarloPath(
      baseInput({ retirementYear: 2026, annualSpending: 30_000, horizonYears: 6 }),
      opts,
    );
    for (const y of path.years) {
      expect(y.isRetired).toBe(true);
      expect(y.contributionValue).toBe(0);
      expect(y.openingTotal + y.appreciation - y.grossWithdrawal).toBeCloseTo(y.closingTotal, 2);
    }
  });

  it('reports tax as the summed tax across all account withdrawals', () => {
    // Two taxed accounts drawn in order; tax must equal gross − net overall.
    const path = sampleMonteCarloPath(
      baseInput({
        assets: [
          {
            startValue: 500_000,
            driftPct: 4,
            sigmaPct: 0,
            annualContribution: 0,
            accountId: 'rrsp',
          },
          {
            startValue: 500_000,
            driftPct: 4,
            sigmaPct: 0,
            annualContribution: 0,
            accountId: 'nonreg',
          },
        ],
        correlation: [
          [1, 0.8],
          [0.8, 1],
        ],
        accounts: [
          { id: 'rrsp', effectiveTaxRate: 0.3 },
          { id: 'nonreg', effectiveTaxRate: 0.15 },
        ],
        accountOrder: ['rrsp', 'nonreg'],
        applyInflation: false,
        retirementYear: 2026,
        horizonYears: 3,
      }),
      opts,
    );
    const y = path.years[0]!;
    expect(y.tax).toBeCloseTo(y.grossWithdrawal - y.netWithdrawal, 4);
    expect(y.tax).toBeGreaterThan(0);
    // Gross must exceed the net lifestyle target: to spend 40k net you withdraw
    // 40k + tax. Net funds the target; gross is larger by the tax.
    expect(y.netWithdrawal).toBeCloseTo(40_000, 0);
    expect(y.grossWithdrawal).toBeGreaterThan(y.netWithdrawal);
    expect(y.grossWithdrawal).toBeCloseTo(y.netWithdrawal + y.tax, 4);
  });

  it('drains accounts strictly in the configured withdrawal order', () => {
    // Two equal, no-growth accounts; spending forces the top-of-order account to
    // empty first. Flipping the order must flip which account empties first —
    // proving the simulation honours the selected withdrawal strategy.
    const run = (accountOrder: string[]) =>
      sampleMonteCarloPath(
        baseInput({
          assets: [
            {
              startValue: 100_000,
              driftPct: 0,
              sigmaPct: 0,
              annualContribution: 0,
              accountId: 'a',
            },
            {
              startValue: 100_000,
              driftPct: 0,
              sigmaPct: 0,
              annualContribution: 0,
              accountId: 'b',
            },
          ],
          correlation: [
            [1, 0],
            [0, 1],
          ],
          accounts: [
            { id: 'a', effectiveTaxRate: 0 },
            { id: 'b', effectiveTaxRate: 0 },
          ],
          accountOrder,
          annualSpending: 60_000,
          applyInflation: false,
          startYear: 2026,
          retirementYear: 2026,
          horizonYears: 4,
        }),
        { iterations: 1, seed: 1, retirementHorizon: 30, meanReversion: 0 },
      );

    // Order [a, b]: by 2027 account A (asset 0) is empty while B (asset 1) holds.
    const aFirst = run(['a', 'b']).years.find((y) => y.year === 2027)!;
    expect(aFirst.assets[0]!.closing).toBeCloseTo(0, 0);
    expect(aFirst.assets[1]!.closing).toBeGreaterThan(0);

    // Order [b, a]: the opposite account empties first.
    const bFirst = run(['b', 'a']).years.find((y) => y.year === 2027)!;
    expect(bFirst.assets[1]!.closing).toBeCloseTo(0, 0);
    expect(bFirst.assets[0]!.closing).toBeGreaterThan(0);
  });
});

describe('historical-real-centered model', () => {
  const opts = (over: Partial<typeof DEFAULT_MC_OPTIONS> = {}) => ({
    ...DEFAULT_MC_OPTIONS,
    iterations: 800,
    seed: 7,
    retirementHorizon: 30,
    model: 'historical-real-centered' as const,
    ...over,
  });
  const asset = (driftPct: number) => ({
    startValue: 1_000_000,
    driftPct,
    sigmaPct: 15,
    annualContribution: 0,
    accountId: 'a',
    assetClass: 'us_equity',
  });

  it('is reproducible for a given seed', () => {
    const a = runMonteCarlo(baseInput(), opts());
    const b = runMonteCarlo(baseInput(), opts());
    expect(a.successRate).toBe(b.successRate);
  });

  it('tracks the user CAGR — a higher driftPct improves outcomes', () => {
    const lo = runMonteCarlo(baseInput({ assets: [asset(1)] }), opts());
    const hi = runMonteCarlo(baseInput({ assets: [asset(30)] }), opts());
    expect(hi.medianEndBalance).toBeGreaterThan(lo.medianEndBalance);
  });

  it('respects an explicit 0% volatility as riskless — grows at the stated CAGR, not history', () => {
    const cash = {
      startValue: 1_000_000,
      driftPct: 8,
      sigmaPct: 0,
      annualContribution: 0,
      accountId: 'a',
      assetClass: 'other',
    };
    const p = sampleMonteCarloPath(baseInput({ assets: [cash], retirementYear: 2100 }), opts());
    for (const y of p.years) {
      expect(y.assets[0]!.returnPct).toBeCloseTo(8, 6);
    }
  });
});

describe('correlation overrides', () => {
  it('buildMonteCarloInput applies a per-pair override and keeps the matrix symmetric', () => {
    const plan = createSeedPlan();
    const a = plan.holdings[0]!.id;
    const b = plan.holdings[1]!.id;
    const key = correlationKey(a, b);
    const withOv = { ...plan, correlationOverrides: { [key]: -0.5 } };
    const input = buildMonteCarloInput(withOv, undefined, 2026, 30);
    expect(input.correlation[0]![1]).toBeCloseTo(-0.5, 5);
    expect(input.correlation[1]![0]).toBeCloseTo(-0.5, 5);
    // Diagonal stays 1.
    expect(input.correlation[0]![0]).toBe(1);
    // An un-overridden pair keeps its class default (not -0.5).
    expect(input.correlation[0]![2]).not.toBeCloseTo(-0.5, 5);
  });
});

describe('bracket FX wiring', () => {
  it('buildMonteCarloInput converts residence-currency thresholds into the plan currency', () => {
    const plan = {
      ...createSeedPlan(),
      residenceCountry: 'FR' as const,
      currency: 'USD' as const,
    };
    // Must quote every currency the seed plan's holdings use, not just EUR/USD:
    // conversion now fails loudly instead of passing native amounts through.
    const rates = { base: 'USD', rates: { USD: 1, EUR: 0.8, CAD: 1.35 }, asOf: 0 };
    // 1 EUR = 1.25 USD → EUR thresholds scaled ×1.25 for USD amounts.
    expect(buildMonteCarloInput(plan, rates, 2026, 30).taxFxFactor).toBeCloseTo(1.25, 6);
    // Plan currency = residence currency → factor 1.
    expect(
      buildMonteCarloInput({ ...plan, currency: 'EUR' as const }, rates, 2026, 30).taxFxFactor,
    ).toBe(1);
    // No rates table → 1 (legacy behaviour, thresholds applied as-is).
    expect(buildMonteCarloInput(plan, undefined, 2026, 30).taxFxFactor).toBe(1);
  });
});

describe('plan currency invariance', () => {
  // A plan's currency is a unit, not a variable of the model: holdings convert
  // from their native currency on read and bracket thresholds are rescaled by
  // taxFxFactor, so restating the plan in another currency must leave the odds
  // alone. Regression guard — setPlanCurrency used to also flip the tax
  // residence, which moved the success rate by ~17 points.
  //
  // Both runs share the fixed DEFAULT_MC_OPTIONS.seed, so the EUR run is a
  // deterministic scaled mirror of the USD run rather than an independent
  // sample: the two rates match exactly regardless of iteration count. The
  // count only has to keep the shared rate off the 0/1 rails (a degenerate
  // plan would pass this test no matter what the switch did), so it stays low
  // to keep the two full simulations fast.
  const rates = { base: 'USD', rates: { USD: 1, EUR: 0.92, CAD: 1.37 }, asOf: 0 };
  const startYear = 2026;
  const usdAccount = accountFromPreset(BASE_TAXABLE_PRESET.US);

  const seed = createSeedPlan();
  const usdPlan: Plan = {
    ...seed,
    currency: 'USD',
    residenceCountry: 'US',
    accounts: [usdAccount],
    withdrawalOrder: [usdAccount.id],
    // Sized so the plan is genuinely uncertain: a 0% or 100% plan would pass
    // this test no matter what the currency switch did to it.
    holdings: seed.holdings.map((h) => ({
      ...h,
      quantity: h.quantity * 8,
      accountId: usdAccount.id,
    })),
    home: {
      id: 'home',
      name: 'Home',
      currentValue: 400_000,
      appreciationPct: 2,
      ownershipCostPct: 2,
      mortgage: { balance: 150_000, ratePct: 3, termYearsRemaining: 15 },
    },
    settings: {
      ...seed.settings,
      retirementYear: startYear + 2,
      annualSpending: 150_000,
      expensesIncomes: [
        {
          id: 'pension',
          name: 'Pension',
          amount: 40_000,
          year: startYear + 10,
          kind: 'income',
          frequency: 'recurring',
          endYear: startYear + 45,
        },
      ],
    },
  };
  const eurPlan: Plan = { ...rescalePlanAmounts(usdPlan, 0.92), currency: 'EUR' };

  const options = { ...DEFAULT_MC_OPTIONS, iterations: 500 };
  const runFor = (plan: Plan) =>
    runMonteCarlo(buildMonteCarloInput(plan, rates, startYear, 60), options);

  it('restating the plan in another currency leaves the success rate alone', () => {
    const usd = runFor(usdPlan);
    const eur = runFor(eurPlan);

    expect(usd.successRate).toBeGreaterThan(0.4);
    expect(usd.successRate).toBeLessThan(0.9);
    expect(eur.successRate).toBeCloseTo(usd.successRate, 2);
  });

  it('scales the built input while rescaling the bracket thresholds to match', () => {
    const usd = buildMonteCarloInput(usdPlan, rates, startYear, 60);
    const eur = buildMonteCarloInput(eurPlan, rates, startYear, 60);

    expect(eur.annualSpending).toBeCloseTo(usd.annualSpending * 0.92, 6);
    expect(eur.assets[0]!.startValue).toBeCloseTo(usd.assets[0]!.startValue * 0.92, 6);
    expect(eur.residence).toBe(usd.residence);
    // US brackets are legislated in USD: applying them to EUR amounts needs the
    // same 0.92 factor the amounts themselves were scaled by.
    expect(usd.taxFxFactor).toBeCloseTo(1, 6);
    expect(eur.taxFxFactor).toBeCloseTo(0.92, 6);
  });
});

describe('one-off expenses / income', () => {
  // Zero volatility so the only difference between runs is the one-off cashflow.
  const zeroVolInput = (overrides: Partial<MonteCarloInput> = {}): MonteCarloInput =>
    baseInput({
      assets: [
        { startValue: 2_000_000, driftPct: 4, sigmaPct: 0, annualContribution: 0, accountId: 'a' },
      ],
      applyInflation: false,
      retirementYear: 2026,
      horizonYears: 20,
      ...overrides,
    });

  it('buildMonteCarloInput passes expensesIncomes through from the plan', () => {
    const plan = createSeedPlan();
    const withExpense = {
      ...plan,
      settings: {
        ...plan.settings,
        expensesIncomes: [
          { id: 'e', name: 'House', amount: 100_000, year: 2030, kind: 'expense' as const },
        ],
      },
    };
    const input = buildMonteCarloInput(withExpense, undefined, 2026, 30);
    expect(input.expensesIncomes).toEqual(withExpense.settings.expensesIncomes);
  });

  it('a one-off expense during retirement lowers the sample path closing balance that year only', () => {
    const opts = { iterations: 1, seed: 11, retirementHorizon: 30 };
    const without = sampleMonteCarloPath(zeroVolInput(), opts);
    const withExpense = sampleMonteCarloPath(
      zeroVolInput({
        expensesIncomes: [
          { id: 'e', name: 'House', amount: 200_000, year: 2035, kind: 'expense', inflate: false },
        ],
      }),
      opts,
    );
    const yr = (p: typeof without, year: number) => p.years.find((y) => y.year === year)!;
    expect(yr(withExpense, 2035).closingTotal).toBeLessThan(yr(without, 2035).closingTotal);
    // A neighbouring year is unaffected.
    expect(yr(withExpense, 2034).closingTotal).toBeCloseTo(yr(without, 2034).closingTotal, 4);
  });

  it('exposes the nominal one-off amounts on SamplePathYear for the sample-path table', () => {
    const opts = { iterations: 1, seed: 11, retirementHorizon: 30 };
    const path = sampleMonteCarloPath(
      zeroVolInput({
        expensesIncomes: [
          { id: 'e', name: 'House', amount: 200_000, year: 2035, kind: 'expense', inflate: false },
          {
            id: 'i',
            name: 'Inheritance',
            amount: 50_000,
            year: 2035,
            kind: 'income',
            inflate: false,
          },
        ],
      }),
      opts,
    );
    const y2035 = path.years.find((y) => y.year === 2035)!;
    expect(y2035.flowExpense).toBeCloseTo(200_000, 2);
    expect(y2035.flowIncome).toBeCloseTo(50_000, 2);
    const y2034 = path.years.find((y) => y.year === 2034)!;
    expect(y2034.flowExpense).toBe(0);
    expect(y2034.flowIncome).toBe(0);
  });

  it('a one-off income during retirement raises the sample path closing balance that year', () => {
    const opts = { iterations: 1, seed: 11, retirementHorizon: 30 };
    const without = sampleMonteCarloPath(zeroVolInput(), opts);
    const withIncome = sampleMonteCarloPath(
      zeroVolInput({
        expensesIncomes: [
          {
            id: 'i',
            name: 'Inheritance',
            amount: 300_000,
            year: 2035,
            kind: 'income',
            inflate: false,
            // Not ordinary income — isolates the reinvestment mechanic from tax
            // stacking (covered separately below).
            taxable: false,
          },
        ],
      }),
      opts,
    );
    const yr = (p: typeof without, year: number) => p.years.find((y) => y.year === year)!;
    expect(yr(withIncome, 2035).closingTotal).toBeGreaterThan(
      yr(without, 2035).closingTotal + 250_000,
    );
  });

  it('a pre-retirement one-off expense is applied even though there is no lifestyle withdrawal', () => {
    const opts = { iterations: 1, seed: 11, retirementHorizon: 30 };
    const input = zeroVolInput({ retirementYear: 2032 });
    const without = sampleMonteCarloPath(input, opts);
    const withExpense = sampleMonteCarloPath(
      {
        ...input,
        expensesIncomes: [
          { id: 'e', name: 'House', amount: 200_000, year: 2028, kind: 'expense', inflate: false },
        ],
      },
      opts,
    );
    const yr = (p: typeof without, year: number) => p.years.find((y) => y.year === year)!;
    expect(yr(without, 2028).isRetired).toBe(false);
    expect(yr(withExpense, 2028).closingTotal).toBeLessThan(yr(without, 2028).closingTotal);
  });

  it('a large one-off expense lowers the Monte Carlo success rate', () => {
    const opts = { iterations: 300, seed: 7, retirementHorizon: 20 };
    // Tight budget so a mid-retirement 1.5M expense meaningfully hurts survival odds.
    const tight = zeroVolInput({ annualSpending: 100_000, horizonYears: 20 });
    const without = runMonteCarlo(tight, opts);
    const withExpense = runMonteCarlo(
      {
        ...tight,
        expensesIncomes: [
          { id: 'e', name: 'Big spend', amount: 1_500_000, year: 2032, kind: 'expense' },
        ],
      },
      opts,
    );
    expect(withExpense.successRate).toBeLessThan(without.successRate);
  });

  describe('taxable flow income stacks under withdrawals', () => {
    const opts = { iterations: 1, seed: 11, retirementHorizon: 30 };
    // A single progressive tax_deferred account so ordinary income (from the
    // flow) and the portfolio withdrawal share the same brackets. RMD is
    // disabled so the stacking base isn't confounded by a forced distribution.
    const withTax = zeroVolInput({
      annualSpending: 100_000,
      residence: 'FR',
      rmdEnabled: false,
      accounts: [
        {
          id: 'd',
          kind: 'tax_deferred',
          effectiveTaxRate: 0,
          incomeCoef: 1,
          flatRate: 0,
          withholding: 0,
        },
      ],
      accountOrder: ['d'],
      assets: [
        { startValue: 3_000_000, driftPct: 4, sigmaPct: 0, annualContribution: 0, accountId: 'd' },
      ],
    });
    const rentalIncome = (taxable: boolean) => ({
      id: 'i',
      name: 'Rental',
      amount: 80_000,
      year: 2030,
      kind: 'income' as const,
      inflate: false,
      taxable,
    });

    it('taxes flow income by default, reducing the net cash it contributes', () => {
      const taxed = sampleMonteCarloPath(
        { ...withTax, expensesIncomes: [rentalIncome(true)] },
        opts,
      );
      const exempt = sampleMonteCarloPath(
        { ...withTax, expensesIncomes: [rentalIncome(false)] },
        opts,
      );
      const yr = (p: typeof taxed) => p.years.find((y) => y.year === 2030)!;
      expect(yr(exempt).closingTotal).toBeGreaterThan(yr(taxed).closingTotal);
    });

    it('pushes the same-year deferred withdrawal to a higher effective tax rate', () => {
      const taxed = sampleMonteCarloPath(
        { ...withTax, expensesIncomes: [rentalIncome(true)] },
        opts,
      );
      const exempt = sampleMonteCarloPath(
        { ...withTax, expensesIncomes: [rentalIncome(false)] },
        opts,
      );
      const yr = (p: typeof taxed) => p.years.find((y) => y.year === 2030)!;
      const effRate = (y: ReturnType<typeof yr>) => y.tax / y.grossWithdrawal;
      expect(effRate(yr(taxed))).toBeGreaterThan(effRate(yr(exempt)));
    });
  });

  it('reinvests surplus flow income even when RMD is disabled and no conversions are configured', () => {
    const opts = { iterations: 1, seed: 11, retirementHorizon: 30 };
    // Income that comfortably exceeds annual spending, so a surplus is left
    // over after covering the year's need. Not taxable, so the RMD-disabled
    // and RMD-enabled runs have identical after-tax cash available — the only
    // difference is which code path (active vs !active in makeForcedFlows)
    // handles the surplus.
    const flow = {
      id: 'i',
      name: 'Windfall',
      amount: 300_000,
      year: 2035,
      kind: 'income' as const,
      inflate: false,
      taxable: false,
    };
    const rmdOn = sampleMonteCarloPath(
      zeroVolInput({ rmdEnabled: true, expensesIncomes: [flow] }),
      opts,
    );
    const rmdOff = sampleMonteCarloPath(
      zeroVolInput({ rmdEnabled: false, expensesIncomes: [flow] }),
      opts,
    );
    const yr = (p: typeof rmdOn, year: number) => p.years.find((y) => y.year === year)!;
    expect(yr(rmdOff, 2035).closingTotal).toBeCloseTo(yr(rmdOn, 2035).closingTotal, 4);
    // And the surplus must actually have been reinvested, not dropped.
    const without = sampleMonteCarloPath(zeroVolInput({ rmdEnabled: false }), opts);
    expect(yr(rmdOff, 2035).closingTotal).toBeGreaterThan(yr(without, 2035).closingTotal + 250_000);
  });
});

describe('sampleTrials agrees with runMonteCarlo on what counts as funded', () => {
  // A portfolio that is mostly an illiquid asset: the drawable pool is far too
  // small to fund spending, but the illiquid holding keeps growing, so the total
  // balance never approaches zero. Judging success by the closing balance would
  // call these runs funded while the aggregate counts every one as a failure.
  const propped = (): MonteCarloInput =>
    baseInput({
      assets: [
        { startValue: 20_000, driftPct: 5, sigmaPct: 0, annualContribution: 0, accountId: 'a' },
        {
          startValue: 5_000_000,
          driftPct: 5,
          sigmaPct: 0,
          annualContribution: 0,
          accountId: 'a',
          drawable: false,
        },
      ],
      correlation: [
        [1, 0],
        [0, 1],
      ],
      annualSpending: 200_000,
    });
  const opts = { ...DEFAULT_MC_OPTIONS, retirementHorizon: 30, model: 'normal' as const };

  it('counts the propped-up runs as failures in the aggregate', () => {
    expect(runMonteCarlo(propped(), opts).successRate).toBe(0);
  });

  it('reports every trial as unfunded despite a large closing balance', () => {
    const trials = sampleTrials(propped(), opts, 5);
    expect(trials).toHaveLength(5);
    for (const t of trials) {
      expect(t.funded).toBe(false);
      expect(t.dryYear).not.toBeNull();
      // The balance test the explorer used to rely on never fires here.
      expect(t.terminalBalance).toBeGreaterThan(1_000_000);
    }
  });

  it('still reports a comfortably funded plan as funded', () => {
    const trials = sampleTrials(baseInput({ annualSpending: 1_000 }), opts, 5);
    for (const t of trials) {
      expect(t.funded).toBe(true);
      expect(t.dryYear).toBeNull();
    }
  });
});

describe('phased spending', () => {
  // sigma 0 + no inflation + no tax: every path is identical and the withdrawal
  // is exactly the phase multiplier times the budget, so both engines can be
  // asserted against closed-form values rather than a bare inequality.
  const opts = {
    ...DEFAULT_MC_OPTIONS,
    model: 'normal' as const,
    meanReversion: 0,
    iterations: 20,
  };
  const phased = (overrides: Partial<MonteCarloInput> = {}): MonteCarloInput =>
    baseInput({
      assets: [
        { startValue: 50_000_000, driftPct: 5, sigmaPct: 0, annualContribution: 0, accountId: 'a' },
      ],
      annualSpending: 100_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 60, // startYear 2026 => age = 60 + (year − 2026)
      retirementYear: 2026,
      horizonYears: 40,
      spendingMode: 'phased',
      phasedSpending: {
        goGoEndAge: 75,
        slowGoEndAge: 85,
        slowGoAdjustmentPct: -1.5,
        noGoAdjustmentPct: -1.5,
        floorPct: 70,
      },
      ...overrides,
    });

  const yearAtAge = (age: number) => 2026 + (age - 60);

  describe('sample path', () => {
    it('withdraws the phase multiplier of the budget in each phase', () => {
      const path = sampleMonteCarloPath(phased(), opts);
      const at = (age: number) => path.years.find((y) => y.year === yearAtAge(age))!;

      expect(at(70).netWithdrawal).toBeCloseTo(100_000, 2);
      expect(at(80).netWithdrawal).toBeCloseTo(100_000 * Math.pow(0.985, 5), 2);
      expect(at(90).netWithdrawal).toBeCloseTo(100_000 * Math.pow(0.985, 15), 2);
    });

    it('holds the budget flat in linear mode and when the age is unknown', () => {
      const linear = sampleMonteCarloPath(phased({ spendingMode: 'linear' }), opts);
      const ageless = sampleMonteCarloPath(phased({ currentAge: 0 }), opts);
      for (const p of [linear, ageless]) {
        const at = (age: number) => p.years.find((y) => y.year === yearAtAge(age))!;
        expect(at(70).netWithdrawal).toBeCloseTo(100_000, 2);
        expect(at(90).netWithdrawal).toBeCloseTo(100_000, 2);
      }
    });
  });

  describe('aggregate run', () => {
    it('leaves a larger balance than linear when spending declines', () => {
      const declining = runMonteCarlo(phased(), opts).medianEndBalance;
      const flat = runMonteCarlo(phased({ spendingMode: 'linear' }), opts).medianEndBalance;
      expect(declining).toBeGreaterThan(flat);
    });

    it('agrees with the sample path year by year', () => {
      // Both engines apply the multiplier at their own call site; a drift between
      // the two would show up here as diverging balances. With sigma 0 every
      // iteration is the same path, so the median is that path exactly.
      const run = runMonteCarlo(phased(), opts);
      const path = sampleMonteCarloPath(phased(), opts);
      for (const age of [70, 80, 90]) {
        const year = yearAtAge(age);
        const p = run.percentiles.find((x) => x.year === year)!;
        const s = path.years.find((y) => y.year === year)!;
        expect(p.p50).toBeCloseTo(s.closingTotal, 2);
      }
    });
  });
});
