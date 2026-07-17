import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_CONFIG } from '@/domain/scenario';
import { capitalGainsTax, incomeTax } from '@/domain/tax';
import { rmdStartAge } from '@/domain/taxAdvantaged';
import type { Account } from '@/domain/account';
import {
  futureValueOfContributions,
  project,
  withdrawNet,
  type ProjectionInput,
  type WithdrawableAsset,
} from '@/services/retirementCalculator';
import { runMonteCarlo, type MonteCarloInput } from '@/services/monteCarlo';
import type { MonteCarloModel } from '@/domain/retirementSettings';

/**
 * REFERENCE SCENARIOS — every expected number here is computed independently of
 * the application (closed-form finance math or hand-worked bracket arithmetic),
 * so these tests catch regressions with certainty rather than just checking the
 * code agrees with itself. The derivations are shown inline.
 */

const projInput = (over: Partial<ProjectionInput>): ProjectionInput => ({
  startYear: 2026,
  horizonYears: 40,
  assets: [
    { holdingId: 'h1', symbol: 'X', startValue: 100_000, baseCagrPct: 10, annualContribution: 0 },
  ],
  retirementYear: 2100, // far in the future → no withdrawals unless overridden
  annualSpending: 0,
  inflationPct: 0,
  applyInflation: false,
  scenario: DEFAULT_SCENARIO_CONFIG,
  ...over,
});

const yearOf = (input: ProjectionInput, year: number) =>
  project(input, 'expected').years.find((y) => y.year === year)!;

// ---------------------------------------------------------------------------
describe('Reference · deterministic projection (compound interest)', () => {
  it('100,000 at 10%/yr for 10 years (2026–2035) compounds to 259,374.25', () => {
    // Closed form: FV = PV·(1+r)^n. The engine compounds every modelled year
    // including the start year, so the 10th growth step lands on 2035 (offset 9).
    const expected = 100_000 * Math.pow(1.1, 10); // 259,374.2460...
    const y = yearOf(projInput({}), 2035);
    expect(y.closingBalance).toBeCloseTo(expected, 1);
    expect(expected).toBeCloseTo(259_374.25, 1);
  });

  it('annuity future value of monthly contributions matches the closed form', () => {
    // FV of an ordinary annuity of `c` for 12 months at monthly rate m:
    //   FV = c · ((1+m)^12 − 1) / m.
    // At 0% growth that is simply 12·c.
    expect(futureValueOfContributions(100, 1)).toBeCloseTo(1200, 6);
    // At a 1%/month rate (annual factor 1.01^12), FV = 100·(1.01^12−1)/0.01 = 1,268.25.
    const m = 0.01;
    const annualFactor = Math.pow(1 + m, 12);
    const expected = (100 * (Math.pow(1 + m, 12) - 1)) / m; // 1,268.250...
    expect(futureValueOfContributions(100, annualFactor)).toBeCloseTo(expected, 4);
    expect(expected).toBeCloseTo(1268.25, 2);
  });
});

// ---------------------------------------------------------------------------
describe('Reference · the 4% rule (Bengen / Trinity sanity check)', () => {
  it('1,000,000 at 0% real return, withdrawing 40,000/yr, lasts exactly 25 years', () => {
    // No growth, no tax, no inflation: 1,000,000 / 40,000 = 25 years to depletion.
    const input = projInput({
      assets: [
        {
          holdingId: 'h1',
          symbol: 'X',
          startValue: 1_000_000,
          baseCagrPct: 0,
          annualContribution: 0,
        },
      ],
      retirementYear: 2026,
      annualSpending: 40_000,
    });
    const p = project(input, 'expected');
    expect(p.depletionYear).toBe(2026 + 25); // 2051
    expect(p.yearsOfSurvival).toBe(25);
  });
});

// ---------------------------------------------------------------------------
describe('Reference · progressive income tax (hand-computed from the 2026 brackets)', () => {
  it('France: 50,000 → 6,772.29 (10% pension allowance capped at 4,439)', () => {
    // Allowance: min(10%·50,000, 4,439) = 4,439 → taxable 45,561.
    // 0–11,600 @0% = 0
    // 11,600–29,579 @11% = 17,979·0.11 = 1,977.69
    // 29,579–45,561 @30% = 15,982·0.30 = 4,794.60
    expect(incomeTax(50_000, 'FR')).toBeCloseTo(6_772.29, 2);
  });

  it('France: 100,000 → 22,980.53', () => {
    // Allowance capped at 4,439 → taxable 95,561.
    // 1,977.69 + (84,577−29,579)·0.30 = 16,499.40
    // + (95,561−84,577)·0.41 = 10,984·0.41 = 4,503.44
    expect(incomeTax(100_000, 'FR')).toBeCloseTo(22_980.53, 2);
  });

  it('United States: 60,000 → 5,020.00 (after the 16,100 standard deduction)', () => {
    // Taxable = 60,000 − 16,100 = 43,900.
    // 0–12,400 @10% = 1,240
    // 12,400–43,900 @12% = 31,500·0.12 = 3,780
    expect(incomeTax(60_000, 'US')).toBeCloseTo(5_020, 2);
  });

  it('Canada (ON combined): 80,000 → 14,747.25 (federal + provincial BPA)', () => {
    // 0% bands: ON BPA to 12,989, federal BPA to 16,452. Then:
    // 12,989–16,452 @5.05% = 3,463·0.0505 = 174.88
    // 16,452–53,891 @19.05% = 37,439·0.1905 = 7,132.13
    // 53,891–58,523 @23.15% = 4,632·0.2315 = 1,072.31
    // 58,523–80,000 @29.65% = 21,477·0.2965 = 6,367.93
    expect(incomeTax(80_000, 'CA')).toBeCloseTo(14_747.25, 2);
  });

  it('income below the first threshold (and zero) pays nothing', () => {
    expect(incomeTax(0, 'FR')).toBe(0);
    expect(incomeTax(10_000, 'FR')).toBe(0); // under the 11,600 allowance (2026)
    expect(incomeTax(16_100, 'US')).toBe(0); // fully absorbed by the deduction
    expect(incomeTax(12_989, 'CA')).toBe(0); // under both basic personal amounts
  });
});

// ---------------------------------------------------------------------------
describe('Reference · withdrawal strategy', () => {
  it('flat-tax gross-up: to net 30,000 at 20% you withdraw 37,500 (tax 7,500)', () => {
    // gross = net / (1 − rate) = 30,000 / 0.8 = 37,500.
    const state: WithdrawableAsset[] = [{ value: 1_000_000, accountId: 'a' }];
    const r = withdrawNet(state, 30_000, [{ id: 'a', effectiveTaxRate: 0.2 }], ['a']);
    expect(r.gross).toBeCloseTo(37_500, 2);
    expect(r.net).toBeCloseTo(30_000, 2);
    expect(r.tax).toBeCloseTo(7_500, 2);
  });

  it('accounts drain strictly in the configured order', () => {
    // Two no-growth, no-tax accounts of 100k; spend 60k/yr in order [a, b].
    // 2026: a 100k→40k, b 100k.  2027: a 40k→0, then b 100k→80k.
    const input = projInput({
      assets: [
        {
          holdingId: 'a',
          symbol: 'A',
          startValue: 100_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'a',
        },
        {
          holdingId: 'b',
          symbol: 'B',
          startValue: 100_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'b',
        },
      ],
      accounts: [
        { id: 'a', effectiveTaxRate: 0 },
        { id: 'b', effectiveTaxRate: 0 },
      ],
      accountOrder: ['a', 'b'],
      retirementYear: 2026,
      annualSpending: 60_000,
    });
    const p = project(input, 'expected');
    const y2026 = p.years.find((y) => y.year === 2026)!;
    const y2027 = p.years.find((y) => y.year === 2027)!;
    const closing = (y: typeof y2026, id: string) =>
      y.perAsset.find((a) => a.holdingId === id)!.value;
    expect(closing(y2026, 'a')).toBeCloseTo(40_000, 0);
    expect(closing(y2026, 'b')).toBeCloseTo(100_000, 0);
    expect(closing(y2027, 'a')).toBeCloseTo(0, 0);
    expect(closing(y2027, 'b')).toBeCloseTo(80_000, 0);
  });

  it('progressive gross-up (France, deferred account): net 30,000 ⇒ gross 31,880.13', () => {
    // Solve g − incomeTax_FR(g) = 30,000. With the 10% allowance (uncapped in
    // this range) taxable = 0.9·g, which sits in the 11% band (0.9·g < 29,579):
    //   T(g) = 0.11·(0.9·g − 11,600) = 0.099·g − 1,276
    //   net  = 0.901·g + 1,276  ⇒  g = 28,724 / 0.901 = 31,880.13, tax = 1,880.13.
    const state: WithdrawableAsset[] = [{ value: 1_000_000, accountId: 'a' }];
    const r = withdrawNet(
      state,
      30_000,
      [{ id: 'a', effectiveTaxRate: 0, incomeCoef: 1, flatRate: 0, withholding: 0 }],
      ['a'],
      { residence: 'FR', inflationFactor: 1 },
    );
    expect(r.net).toBeCloseTo(30_000, 1);
    expect(r.gross).toBeCloseTo(31_880.13, 1);
    expect(r.tax).toBeCloseTo(1_880.13, 1);
  });
});

// ---------------------------------------------------------------------------
describe('Reference · Monte Carlo, every model (σ=0 ⇒ deterministic)', () => {
  // With zero volatility the only randomness vanishes, so the simulation must
  // reproduce the closed-form compound exactly. The engine compounds every
  // modelled year including the start year, so horizonYears=20 ⇒ 21 steps:
  //   100,000·1.06^21 = 339,956.36.
  const target = 100_000 * Math.pow(1.06, 21);

  const mcInput = (): MonteCarloInput => ({
    assets: [
      {
        startValue: 100_000,
        driftPct: 6,
        sigmaPct: 0,
        annualContribution: 0,
        accountId: 'a',
        assetClass: 'us_equity', // so the crash-aware regime actually bites at σ=0
        symbol: 'VTI',
      },
    ],
    correlation: [[1]],
    accounts: [{ id: 'a', effectiveTaxRate: 0 }],
    accountOrder: ['a'],
    annualSpending: 0,
    inflationPct: 0,
    applyInflation: false,
    startYear: 2026,
    retirementYear: 2100, // no withdrawals in range
    horizonYears: 20,
  });

  it('339,956.36 is the closed-form target', () => {
    expect(target).toBeCloseTo(339_956.36, 1);
  });

  for (const model of ['normal', 'fat-tails', 'bootstrap'] as MonteCarloModel[]) {
    it(`${model}: median end equals the deterministic compound, with zero spread`, () => {
      const r = runMonteCarlo(mcInput(), {
        iterations: 300,
        seed: 1,
        retirementHorizon: 30,
        meanReversion: 0,
        model,
      });
      const last = r.percentiles.at(-1)!;
      expect(last.p50).toBeCloseTo(target, 0);
      expect(last.p10).toBeCloseTo(last.p90, 0); // no dispersion at σ=0
      expect(r.successRate).toBe(1);
    });
  }

  it('crash-aware: σ=0 still applies the crash drift, so the median sits below the compound', () => {
    // (kept at the end of the file — see below)
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Reference · 2026 tax-engine additions', () => {
  it('US LTCG stacks across buckets: a deferred draw first pushes gains up the ladder', () => {
    // US resident. Draw order: deferred account (ordinary income) then a taxable
    // brokerage (pure gains). The deferred income fills the LTCG 0% band, so the
    // taxable gains start higher in the ladder than they would alone.
    const mk = (): WithdrawableAsset[] => [
      { value: 60_000, accountId: 'def' },
      { value: 500_000, accountId: 'brok', basis: 0 },
    ];
    const accounts = [
      { id: 'def', effectiveTaxRate: 0, incomeCoef: 1, gainsCoef: 0, flatRate: 0, withholding: 0 },
      { id: 'brok', effectiveTaxRate: 0, incomeCoef: 0, gainsCoef: 1, flatRate: 0, withholding: 0 },
    ];
    // Order A: deferred first — its 60k of ordinary income sits under the gains.
    const a = withdrawNet(mk(), 100_000, accounts, ['def', 'brok'], {
      residence: 'US',
      inflationFactor: 1,
    });
    // Order B: brokerage alone funds everything — gains start at the 0% band.
    const b = withdrawNet(mk(), 100_000, accounts, ['brok', 'def'], {
      residence: 'US',
      inflationFactor: 1,
    });
    expect(a.net).toBeCloseTo(100_000, 1);
    expect(b.net).toBeCloseTo(100_000, 1);
    // Same net funded, but order A pays more tax because the ordinary income
    // consumed the 0% LTCG band beneath the gains.
    expect(a.tax).toBeGreaterThan(b.tax);
    // Cross-check order B against the closed form: the 0% LTCG band covers the
    // first 65,550 of gross (49,450 official + the 16,100 standard deduction).
    const gGains = b.gross; // brokerage-only gross = gains (gainsCoef 1)
    expect(gGains - capitalGainsTax(gGains, 0, 'US')).toBeCloseTo(100_000, 1);
  });

  it('bracket thresholds are FX-scaled: fx=2 halves the effective progressivity', () => {
    // Doubling every threshold is exactly a currency where 1 local unit = 2 plan
    // units: the tax on 2× the income must be 2× the tax on the base income.
    expect(incomeTax(100_000, 'US', 1, undefined, 2)).toBeCloseTo(2 * incomeTax(50_000, 'US'), 6);
    expect(incomeTax(80_000, 'CA', 1, 'ON', 2)).toBeCloseTo(2 * incomeTax(40_000, 'CA'), 6);
    expect(incomeTax(50_000, 'FR', 1, undefined, 2)).toBeCloseTo(2 * incomeTax(25_000, 'FR'), 6);
  });

  it('the NIIT threshold is FX-converted but never inflation-indexed', () => {
    // ord 190k + 30k gains: at fx=1 NIIT taxes the 20k above the 200k threshold;
    // at fx=2 the threshold is 400k in plan currency → no NIIT. The LTCG slice
    // stays 15%·30,000 in both cases (thresholds scale with fx).
    const atFx1 = capitalGainsTax(30_000, 190_000, 'US', 1, 1);
    const atFx2 = capitalGainsTax(30_000, 190_000, 'US', 1, 2);
    expect(atFx1).toBeCloseTo(0.15 * 30_000 + 0.038 * 20_000, 2);
    // fx=2: taxable ord 190k sits above the doubled 0% band (131,100) → 15% band.
    expect(atFx2).toBeCloseTo(0.15 * 30_000, 2);
  });

  it('RMD start age follows SECURE 2.0: 73 before 1960, 75 from 1960 (US)', () => {
    expect(rmdStartAge('US', 1955)).toBe(73);
    expect(rmdStartAge('US', 1959)).toBe(73);
    expect(rmdStartAge('US', 1960)).toBe(75);
    expect(rmdStartAge('US', 1980)).toBe(75);
    expect(rmdStartAge('US', null)).toBe(73); // unknown birth year → legacy
    expect(rmdStartAge('CA', 1960)).toBe(72); // Canada unchanged
    expect(rmdStartAge('FR', 1960)).toBeUndefined();
  });

  it('a US Roth held by a CA resident is untaxed in the deterministic engine', () => {
    const roth: Account = {
      id: 'roth',
      name: 'Roth IRA',
      taxRatePct: 0,
      taxableBasePct: 100,
      taxMode: 'auto',
      kind: 'tax_free',
      sourceCountry: 'US',
    };
    const input = projInput({
      assets: [
        {
          holdingId: 'h1',
          symbol: 'X',
          startValue: 500_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'roth',
        },
      ],
      retirementYear: 2026,
      annualSpending: 40_000,
      residence: 'CA',
      rawAccounts: [roth],
      accounts: [{ id: 'roth', effectiveTaxRate: 0 }],
      accountOrder: ['roth'],
      rmdEnabled: false,
    });
    const p = project(input, 'expected');
    const totalTax = p.years.reduce((s, y) => s + y.taxPaid, 0);
    expect(totalTax).toBeCloseTo(0, 1);
  });

  it('province changes the deterministic result: QC taxes a deferred draw more than AB', () => {
    const mkInput = (province: 'QC' | 'AB'): ProjectionInput =>
      projInput({
        assets: [
          {
            holdingId: 'h1',
            symbol: 'X',
            startValue: 2_000_000,
            baseCagrPct: 0,
            annualContribution: 0,
            accountId: 'rrsp',
          },
        ],
        retirementYear: 2026,
        annualSpending: 80_000,
        residence: 'CA',
        province,
        accounts: [
          {
            id: 'rrsp',
            effectiveTaxRate: 0,
            incomeCoef: 1,
            gainsCoef: 0,
            flatRate: 0,
            withholding: 0,
          },
        ],
        accountOrder: ['rrsp'],
        rmdEnabled: false,
      });
    const qc = project(mkInput('QC'), 'expected').years[0]!;
    const ab = project(mkInput('AB'), 'expected').years[0]!;
    expect(qc.taxPaid).toBeGreaterThan(ab.taxPaid);
  });

  it('det-vs-MC parity at σ=0 with RMD surplus reinvested (basis regression gate)', () => {
    // CA resident, 71 at start (RRIF minimums from 72). Low spending, so the RMD
    // throws off surplus cash that is reinvested into the taxable account. The
    // reinvested cash must carry basis in BOTH engines — before the fix the MC
    // taxed it as 100% gain and its balances drifted below the deterministic run.
    const rrif: Account = {
      id: 'rrif',
      name: 'RRIF',
      taxRatePct: 0,
      taxableBasePct: 100,
      taxMode: 'auto',
      kind: 'tax_deferred',
      sourceCountry: 'CA',
    };
    const taxable: Account = {
      id: 'tax',
      name: 'Non-Registered',
      taxRatePct: 0,
      taxableBasePct: 100,
      taxMode: 'auto',
      kind: 'taxable',
      sourceCountry: 'CA',
      costBasisPct: 100,
    };
    const assets = [
      { holdingId: 'd', symbol: 'D', startValue: 800_000, accountId: 'rrif' },
      { holdingId: 't', symbol: 'T', startValue: 100_000, accountId: 'tax', costBasis: 100_000 },
    ];
    const horizon = 20;
    const det = project(
      projInput({
        assets: assets.map((a) => ({ ...a, baseCagrPct: 0, annualContribution: 0 })),
        retirementYear: 2026,
        annualSpending: 15_000,
        currentAge: 71,
        horizonYears: horizon,
        residence: 'CA',
        rawAccounts: [rrif, taxable],
        accounts: [
          { id: 'rrif', effectiveTaxRate: 0, kind: 'tax_deferred' },
          { id: 'tax', effectiveTaxRate: 0, kind: 'taxable' },
        ],
        accountOrder: ['tax', 'rrif'],
        rmdEnabled: true,
      }),
      'expected',
    );
    const mc = runMonteCarlo(
      {
        assets: assets.map((a) => ({
          startValue: a.startValue,
          driftPct: 0,
          sigmaPct: 0,
          annualContribution: 0,
          accountId: a.accountId,
          costBasis: a.costBasis,
          symbol: a.symbol,
        })),
        correlation: [
          [1, 0],
          [0, 1],
        ],
        accounts: [
          { id: 'rrif', effectiveTaxRate: 0, kind: 'tax_deferred' },
          { id: 'tax', effectiveTaxRate: 0, kind: 'taxable' },
        ],
        accountOrder: ['tax', 'rrif'],
        annualSpending: 15_000,
        inflationPct: 0,
        applyInflation: false,
        currentAge: 71,
        rawAccounts: [rrif, taxable],
        startYear: 2026,
        retirementYear: 2026,
        horizonYears: horizon,
        residence: 'CA',
      },
      { iterations: 10, seed: 7, retirementHorizon: horizon, meanReversion: 0, model: 'normal' },
    );
    // Every simulated year's median balance equals the deterministic closing
    // balance (no randomness at σ=0, same tax + basis mechanics).
    for (const pct of mc.percentiles) {
      const detYear = det.years.find((y) => y.year === pct.year)!;
      expect(pct.p50).toBeCloseTo(detYear.closingBalance, 0);
      expect(pct.p10).toBeCloseTo(pct.p90, 0);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Reference · crash-aware model at σ=0', () => {
  const target = 100_000 * Math.pow(1.06, 21);

  const mcInput = (): MonteCarloInput => ({
    assets: [
      {
        startValue: 100_000,
        driftPct: 6,
        sigmaPct: 0,
        annualContribution: 0,
        accountId: 'a',
        assetClass: 'us_equity',
        symbol: 'VTI',
      },
    ],
    correlation: [[1]],
    accounts: [{ id: 'a', effectiveTaxRate: 0 }],
    accountOrder: ['a'],
    annualSpending: 0,
    inflationPct: 0,
    applyInflation: false,
    startYear: 2026,
    retirementYear: 2100,
    horizonYears: 20,
  });

  it('σ=0 still applies the crash drift, so the median sits below the compound', () => {
    // Crash-aware injects a common negative shock (CRASH_DRIFT) independent of σ,
    // so ~6% of years are down even with zero volatility — the median path ends
    // below the no-crash compound, but well above zero.
    const r = runMonteCarlo(mcInput(), {
      iterations: 1500,
      seed: 1,
      retirementHorizon: 30,
      meanReversion: 0,
      model: 'crash-aware',
    });
    const p50 = r.percentiles.at(-1)!.p50;
    expect(p50).toBeLessThan(target);
    expect(p50).toBeGreaterThan(target * 0.6);
  });
});
