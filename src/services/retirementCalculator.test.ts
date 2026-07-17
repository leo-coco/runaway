import { describe, expect, it } from 'vitest';
import {
  contributionFutureValue,
  project,
  totalContributed,
  withdrawNet,
  type WithdrawableAsset,
} from './retirementCalculator';
import type { ProjectionInput } from './retirementCalculator';
import { DEFAULT_SCENARIO_CONFIG } from '@/domain/scenario';

// Reproduces the reference screenshot's plan exactly.
const referenceInput: ProjectionInput = {
  startYear: 2026,
  horizonYears: 50,
  retirementYear: 2033,
  annualSpending: 60_000,
  inflationPct: 4,
  applyInflation: true,
  scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
  assets: [
    {
      holdingId: 'nvda',
      symbol: 'NVDA.TO',
      startValue: 36.98 * 258,
      baseCagrPct: 3,
      annualContribution: 0,
    },
    {
      holdingId: 'xeqt',
      symbol: 'XEQT.TO',
      startValue: 31.43 * 495,
      baseCagrPct: 7,
      annualContribution: 0,
    },
    {
      holdingId: 'vfv',
      symbol: 'VFV.TO',
      startValue: 95 * 226,
      baseCagrPct: 8,
      annualContribution: 0,
    },
    {
      holdingId: 'fbtc',
      symbol: 'FBTC.TO',
      startValue: 26.08 * 2656,
      baseCagrPct: 15,
      annualContribution: 0,
    },
    {
      holdingId: 'tsla',
      symbol: 'TSLA.TO',
      startValue: 26.94 * 2359,
      baseCagrPct: 8,
      annualContribution: 0,
    },
    {
      holdingId: 'sol',
      symbol: 'SOL',
      startValue: 84.5 * 25,
      baseCagrPct: 2,
      annualContribution: 0,
    },
    {
      holdingId: 'btc',
      symbol: 'BTC',
      startValue: 76_809 * 1,
      baseCagrPct: 15,
      annualContribution: 0,
    },
  ],
};

describe('withdrawNet progressive tax', () => {
  const deferred = [{ id: 'd', effectiveTaxRate: 0, incomeCoef: 1, flatRate: 0, withholding: 0 }];
  const ctx = { residence: 'FR' as const, inflationFactor: 1 };

  const effectiveRate = (net: number): number => {
    const state: WithdrawableAsset[] = [{ value: 5_000_000, accountId: 'd' }];
    const r = withdrawNet(state, net, deferred, ['d'], ctx);
    return r.tax / r.gross;
  };

  it('taxes a deferred withdrawal at a higher effective rate as spending rises', () => {
    expect(effectiveRate(150_000)).toBeGreaterThan(effectiveRate(20_000));
  });

  it('keeps gross = net + tax', () => {
    const state: WithdrawableAsset[] = [{ value: 5_000_000, accountId: 'd' }];
    const r = withdrawNet(state, 50_000, deferred, ['d'], ctx);
    expect(r.gross).toBeCloseTo(r.net + r.tax, 4);
    expect(r.net).toBeCloseTo(50_000, 0);
  });

  it('a flat (manual) account reduces to the closed-form gross-up', () => {
    const flat = [{ id: 'm', effectiveTaxRate: 0.3 }];
    const state: WithdrawableAsset[] = [{ value: 1_000_000, accountId: 'm' }];
    const r = withdrawNet(state, 70_000, flat, ['m'], ctx);
    expect(r.gross).toBeCloseTo(70_000 / (1 - 0.3), 2); // 100,000
  });
});

describe('withdrawNet drawable flag', () => {
  it('never sells an illiquid asset in the no-tax pro-rata path', () => {
    const state: WithdrawableAsset[] = [
      { value: 100_000, accountId: null },
      { value: 500_000, accountId: null, drawable: false }, // a home
    ];
    const r = withdrawNet(state, 80_000, undefined, undefined);
    expect(r.net).toBeCloseTo(80_000, 4);
    expect(state[0]!.value).toBeCloseTo(20_000, 4); // liquid asset drawn
    expect(state[1]!.value).toBe(500_000); // illiquid asset untouched
  });

  it('caps the draw at the liquid balance, leaving the illiquid asset whole', () => {
    const state: WithdrawableAsset[] = [
      { value: 30_000, accountId: null },
      { value: 500_000, accountId: null, drawable: false },
    ];
    const r = withdrawNet(state, 80_000, undefined, undefined);
    expect(r.net).toBeCloseTo(30_000, 4); // only the liquid part is available
    expect(state[0]!.value).toBe(0);
    expect(state[1]!.value).toBe(500_000);
  });

  it('excludes an illiquid asset from the bucketed (tax) path', () => {
    const accounts = [{ id: 'm', effectiveTaxRate: 0 }];
    const state: WithdrawableAsset[] = [
      { value: 100_000, accountId: 'm' },
      { value: 500_000, accountId: 'm', drawable: false },
    ];
    const r = withdrawNet(state, 400_000, accounts, ['m'], {
      residence: 'US',
      inflationFactor: 1,
    });
    expect(r.net).toBeCloseTo(100_000, 4); // capped at the drawable member's value
    expect(state[1]!.value).toBe(500_000);
  });
});

describe('retirementCalculator.project', () => {
  it('reproduces the reference opening/appreciation/closing balances', () => {
    const p = project(referenceInput, 'expected');
    const y2026 = p.years[0]!;
    expect(Math.round(y2026.openingBalance)).toBe(258_310);
    expect(Math.round(y2026.appreciation)).toBe(30_131);
    expect(Math.round(y2026.closingBalance)).toBe(288_441);

    const y2029 = p.years.find((y) => y.year === 2029)!;
    expect(Math.round(y2029.closingBalance)).toBe(404_579);
  });

  it('reproduces per-asset closing values for 2026', () => {
    const p = project(referenceInput, 'expected');
    const perAsset = p.years[0]!.perAsset;
    const byId = Object.fromEntries(perAsset.map((a) => [a.holdingId, Math.round(a.value)]));
    expect(byId.btc).toBe(88_330);
    expect(byId.fbtc).toBe(79_659);
    expect(byId.tsla).toBe(68_636);
  });

  it('records per-asset opening / appreciation / after-appreciation that sum to the year totals', () => {
    const p = project(referenceInput, 'expected');
    const y = p.years[0]!;
    for (const a of y.perAsset) {
      // opening + appreciation = after-appreciation, per asset.
      expect(a.opening + a.appreciation).toBeCloseTo(a.afterAppreciation, 1);
    }
    const sum = (pick: (a: (typeof y.perAsset)[number]) => number) =>
      y.perAsset.reduce((s, a) => s + pick(a), 0);
    expect(sum((a) => a.opening)).toBeCloseTo(y.openingBalance, 0);
    expect(sum((a) => a.appreciation)).toBeCloseTo(y.appreciation, 0);
    expect(sum((a) => a.afterAppreciation)).toBeCloseTo(y.balanceAfterAppreciation, 0);
  });

  it('computes the depletion year (2045) under the reference assumptions', () => {
    // Spending is inflated from the start year (2026), not only from retirement,
    // so the 60k/yr in today's money is ~31% higher by the 2033 retirement —
    // depletion is correspondingly earlier than the old (optimistic) 2057.
    const p = project(referenceInput, 'expected');
    expect(p.depletionYear).toBe(2045);
    expect(p.yearsOfSurvival).toBe(2045 - 2033);
  });

  it('phased spending withdraws less in real terms in the No-Go years than linear', () => {
    // Self-contained: one large, never-depleting asset, no tax, no inflation, so
    // the only difference between the two runs is the phase decay.
    const baseYear = 2026;
    const phasedInput: ProjectionInput = {
      startYear: baseYear,
      horizonYears: 40,
      retirementYear: 2033, // age 67 with currentAge 60
      annualSpending: 100_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 60,
      spendingMode: 'phased',
      phasedSpending: {
        goGoEndAge: 75,
        slowGoEndAge: 85,
        slowGoAdjustmentPct: -1.5,
        noGoAdjustmentPct: -1.5,
        floorPct: 70,
      },
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
      assets: [
        {
          holdingId: 'big',
          symbol: 'BIG',
          startValue: 50_000_000,
          baseCagrPct: 5,
          annualContribution: 0,
        },
      ],
    };
    const linearInput: ProjectionInput = { ...phasedInput, spendingMode: 'linear' };
    const phased = project(phasedInput, 'expected');
    const linear = project(linearInput, 'expected');

    const ageInYear = (y: number) => 60 + (y - baseYear);
    const goGoYear = phased.years.find((y) => ageInYear(y.year) === 70)!; // Go-Go
    const slowGoYear = phased.years.find((y) => ageInYear(y.year) === 80)!; // Slow-Go
    const noGoYear = phased.years.find((y) => ageInYear(y.year) === 90)!; // No-Go
    const linNoGo = linear.years.find((y) => y.year === noGoYear.year)!;

    // Go-Go spends the full budget; Slow-Go and No-Go are progressively lower.
    expect(goGoYear.lifestyleSpending).toBeCloseTo(100_000, 0);
    expect(slowGoYear.lifestyleSpending).toBeLessThan(100_000);
    expect(noGoYear.lifestyleSpending).toBeLessThan(slowGoYear.lifestyleSpending);
    // Linear keeps the full real budget the whole time.
    expect(linNoGo.lifestyleSpending).toBeCloseTo(100_000, 0);
  });

  it('a taxable recurring income flow reduces portfolio withdrawals (household-level tax base)', () => {
    const common = {
      startYear: 2026,
      horizonYears: 40,
      retirementYear: 2033,
      annualSpending: 100_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 60,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' as const },
      assets: [
        {
          holdingId: 'big',
          symbol: 'BIG',
          startValue: 3_000_000,
          baseCagrPct: 4,
          annualContribution: 0,
        },
      ],
    };
    const without = project(common as ProjectionInput, 'expected');
    const withIncome = project(
      {
        ...common,
        expensesIncomes: [
          {
            id: 'p',
            name: 'Pension',
            amount: 40_000,
            year: 2026,
            endYear: 2085,
            kind: 'income' as const,
            frequency: 'recurring' as const,
            inflate: false,
            taxable: true,
          },
        ],
      } as ProjectionInput,
      'expected',
    );
    const yr = (p: typeof without) => p.years.find((y) => y.year === 2040)!;
    // A pension funds part of spending, so the portfolio withdraws less.
    expect(yr(withIncome).grossWithdrawal).toBeLessThan(yr(without).grossWithdrawal);
    // And the portfolio is therefore larger that year.
    expect(yr(withIncome).closingBalance).toBeGreaterThan(yr(without).closingBalance);
  });

  describe('one-off expenses / income', () => {
    const common = {
      startYear: 2026,
      horizonYears: 40,
      retirementYear: 2033,
      annualSpending: 100_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 60,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' as const },
      assets: [
        {
          holdingId: 'big',
          symbol: 'BIG',
          startValue: 3_000_000,
          baseCagrPct: 4,
          annualContribution: 0,
        },
      ],
    };

    it('a one-off expense increases the withdrawal only in its target year', () => {
      const without = project(common as ProjectionInput, 'expected');
      const withExpense = project(
        {
          ...common,
          expensesIncomes: [
            {
              id: 'e',
              name: 'House',
              amount: 200_000,
              year: 2040,
              kind: 'expense',
              inflate: false,
            },
          ],
        } as ProjectionInput,
        'expected',
      );
      const yr = (p: typeof without, year: number) => p.years.find((y) => y.year === year)!;

      expect(yr(withExpense, 2040).grossWithdrawal).toBeGreaterThan(
        yr(without, 2040).grossWithdrawal,
      );
      expect(yr(withExpense, 2040).closingBalance).toBeLessThan(yr(without, 2040).closingBalance);
      // Neighbouring years are unaffected.
      expect(yr(withExpense, 2039).grossWithdrawal).toBeCloseTo(
        yr(without, 2039).grossWithdrawal,
        4,
      );
      expect(yr(withExpense, 2041).grossWithdrawal).toBeCloseTo(
        yr(without, 2041).grossWithdrawal,
        4,
      );
    });

    it('one-off income beyond the year need is reinvested into the portfolio', () => {
      const without = project(common as ProjectionInput, 'expected');
      const withIncome = project(
        {
          ...common,
          expensesIncomes: [
            {
              id: 'i',
              name: 'Inheritance',
              amount: 500_000,
              year: 2040,
              kind: 'income',
              inflate: false,
              // Not ordinary income — isolates the reinvestment mechanic from tax
              // stacking (covered separately below).
              taxable: false,
            },
          ],
        } as ProjectionInput,
        'expected',
      );
      const yr = (p: typeof without) => p.years.find((y) => y.year === 2040)!;
      // The portfolio is larger the year the inheritance lands (surplus reinvested).
      expect(yr(withIncome).closingBalance).toBeGreaterThan(yr(without).closingBalance + 400_000);
    });

    it('applies a pre-retirement one-off expense even though the household is not retired', () => {
      const withExpense = project(
        {
          ...common,
          expensesIncomes: [
            {
              id: 'e',
              name: 'House',
              amount: 200_000,
              year: 2028,
              kind: 'expense',
              inflate: false,
            },
          ],
        } as ProjectionInput,
        'expected',
      );
      const without = project(common as ProjectionInput, 'expected');
      const yr = (p: typeof without) => p.years.find((y) => y.year === 2028)!;
      expect(yr(without).isRetired).toBe(false);
      expect(yr(withExpense).grossWithdrawal).toBeGreaterThan(yr(without).grossWithdrawal);
      expect(yr(withExpense).closingBalance).toBeLessThan(yr(without).closingBalance);
    });

    it('flags a pre-retirement flow the portfolio cannot fund as a depletion', () => {
      // The Monte Carlo counts an unfundable pre-retirement expense as a failure;
      // the deterministic projection must agree rather than reporting a plan that
      // never runs dry because the shortfall happened before the retirement year.
      const p = project(
        {
          startYear: 2026,
          horizonYears: 30,
          retirementYear: 2040,
          annualSpending: 40_000,
          inflationPct: 0,
          applyInflation: false,
          scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
          assets: [
            {
              holdingId: 'small',
              symbol: 'SMALL',
              startValue: 50_000,
              baseCagrPct: 3,
              annualContribution: 0,
            },
          ],
          expensesIncomes: [
            {
              id: 'house',
              name: 'House',
              amount: 500_000,
              year: 2030,
              kind: 'expense',
              inflate: false,
            },
          ],
        } as ProjectionInput,
        'expected',
      );
      expect(p.depletionYear).toBe(2030);
      // Retirement is still 10 years out, so nothing survived into it.
      expect(p.yearsOfSurvival).toBe(0);
    });

    it('a large one-off expense can advance the depletion year', () => {
      const drawdownCommon: ProjectionInput = {
        startYear: 2026,
        horizonYears: 40,
        retirementYear: 2027,
        annualSpending: 100_000,
        inflationPct: 0,
        applyInflation: false,
        currentAge: 60,
        scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
        assets: [
          {
            holdingId: 'small',
            symbol: 'SMALL',
            startValue: 1_500_000,
            baseCagrPct: 2,
            annualContribution: 0,
          },
        ],
      };
      const without = project(drawdownCommon, 'expected');
      const withExpense = project(
        {
          ...drawdownCommon,
          expensesIncomes: [
            {
              id: 'e',
              name: 'Big spend',
              amount: 800_000,
              year: 2028,
              kind: 'expense',
              inflate: false,
            },
          ],
        },
        'expected',
      );
      expect(without.depletionYear).not.toBeNull();
      expect(withExpense.depletionYear).not.toBeNull();
      expect(withExpense.depletionYear!).toBeLessThanOrEqual(without.depletionYear!);
    });

    it('is a no-op when expensesIncomes is undefined (no regression)', () => {
      const a = project(common as ProjectionInput, 'expected');
      const b = project({ ...common, expensesIncomes: undefined } as ProjectionInput, 'expected');
      expect(a).toEqual(b);
    });

    it('exposes the nominal one-off amounts on ProjectionYear for the journey table', () => {
      const p = project(
        {
          ...common,
          expensesIncomes: [
            {
              id: 'e',
              name: 'House',
              amount: 200_000,
              year: 2040,
              kind: 'expense',
              inflate: false,
            },
            {
              id: 'i',
              name: 'Inheritance',
              amount: 50_000,
              year: 2040,
              kind: 'income',
              inflate: false,
            },
          ],
        } as ProjectionInput,
        'expected',
      );
      const y2040 = p.years.find((y) => y.year === 2040)!;
      expect(y2040.flowExpense).toBeCloseTo(200_000, 2);
      expect(y2040.flowIncome).toBeCloseTo(50_000, 2);
      const y2041 = p.years.find((y) => y.year === 2041)!;
      expect(y2041.flowExpense).toBe(0);
      expect(y2041.flowIncome).toBe(0);
    });

    describe('taxable flow income stacks under withdrawals', () => {
      // A single progressive tax_deferred account so ordinary income (from the
      // flow) and the portfolio withdrawal share the same brackets. RMD is
      // disabled so `forcedBase` isn't confounded by a forced distribution.
      const withTax = {
        ...common,
        residence: 'FR' as const,
        rmdEnabled: false,
        accounts: [
          {
            id: 'd',
            kind: 'tax_deferred' as const,
            effectiveTaxRate: 0,
            incomeCoef: 1,
            flatRate: 0,
            withholding: 0,
          },
        ],
        accountOrder: ['d'],
        assets: [
          {
            holdingId: 'big',
            symbol: 'BIG',
            startValue: 3_000_000,
            baseCagrPct: 4,
            annualContribution: 0,
            accountId: 'd',
          },
        ],
      };
      const rentalIncome = (taxable: boolean) => ({
        id: 'i',
        name: 'Rental',
        amount: 80_000,
        year: 2040,
        kind: 'income' as const,
        inflate: false,
        taxable,
      });

      it('taxes flow income by default, reducing the net cash it contributes', () => {
        const taxed = project(
          { ...withTax, expensesIncomes: [rentalIncome(true)] } as ProjectionInput,
          'expected',
        );
        const exempt = project(
          { ...withTax, expensesIncomes: [rentalIncome(false)] } as ProjectionInput,
          'expected',
        );
        const yr = (p: typeof taxed) => p.years.find((y) => y.year === 2040)!;
        // Same nominal amount, but the exempt version leaves more in the portfolio.
        expect(yr(exempt).closingBalance).toBeGreaterThan(yr(taxed).closingBalance);
      });

      it('pushes the same-year deferred withdrawal to a higher effective tax rate', () => {
        const taxed = project(
          { ...withTax, expensesIncomes: [rentalIncome(true)] } as ProjectionInput,
          'expected',
        );
        const exempt = project(
          { ...withTax, expensesIncomes: [rentalIncome(false)] } as ProjectionInput,
          'expected',
        );
        const yr = (p: typeof taxed) => p.years.find((y) => y.year === 2040)!;
        const effRate = (y: ReturnType<typeof yr>) => y.taxPaid / y.grossWithdrawal;
        // Taxable rental income fills the lower brackets first, so the portfolio
        // withdrawal that year is taxed at a higher marginal rate above it.
        expect(effRate(yr(taxed))).toBeGreaterThan(effRate(yr(exempt)));
      });
    });
  });

  it('lifetime tax sums per-year tax: positive for a deferred account, zero when tax-free', () => {
    const common = {
      startYear: 2026,
      horizonYears: 30,
      retirementYear: 2027,
      annualSpending: 80_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 60,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' as const },
      accountOrder: ['acct'],
      residence: 'US' as const,
      assets: [
        {
          holdingId: 'a',
          symbol: 'A',
          startValue: 5_000_000,
          baseCagrPct: 3,
          annualContribution: 0,
          accountId: 'acct',
        },
      ],
    };
    const deferred = project(
      {
        ...common,
        accounts: [{ id: 'acct', effectiveTaxRate: 0, incomeCoef: 1 }],
      } as ProjectionInput,
      'expected',
    );
    const free = project(
      {
        ...common,
        accounts: [{ id: 'acct', effectiveTaxRate: 0, incomeCoef: 0 }],
      } as ProjectionInput,
      'expected',
    );
    const sum = (p: typeof deferred) => p.years.reduce((s, y) => s + y.taxPaid, 0);
    expect(sum(deferred)).toBeGreaterThan(0);
    expect(sum(free)).toBe(0);
    // Each year, tax paid = gross withdrawal − net lifestyle funded.
    for (const y of deferred.years) {
      expect(y.taxPaid).toBeCloseTo(y.grossWithdrawal - y.lifestyleSpending, 2);
    }
  });

  it('gross withdrawal / tax stay in balance when a taxed goal expense joins lifestyle spending', () => {
    // Same taxed setup as above, plus a one-off "goal" expense landing mid-plan.
    // Table rows Gross Withdrawal / Tax on Withdrawal are a single blended draw
    // covering lifestyle spending *and* goal expenses together, so the invariant
    // must hold with both terms present, not just lifestyle alone.
    const input: ProjectionInput = {
      startYear: 2026,
      horizonYears: 30,
      retirementYear: 2027,
      annualSpending: 80_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 60,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' as const },
      accountOrder: ['acct'],
      residence: 'US' as const,
      accounts: [{ id: 'acct', effectiveTaxRate: 0, incomeCoef: 1 }],
      assets: [
        {
          holdingId: 'a',
          symbol: 'A',
          startValue: 5_000_000,
          baseCagrPct: 3,
          annualContribution: 0,
          accountId: 'acct',
        },
      ],
      expensesIncomes: [
        {
          id: 'e',
          name: 'Boat',
          amount: 150_000,
          year: 2035,
          kind: 'expense',
          inflate: false,
        },
      ],
    } as ProjectionInput;
    const p = project(input, 'expected');
    for (const y of p.years) {
      expect(y.taxPaid).toBeCloseTo(y.grossWithdrawal - y.lifestyleSpending - y.flowExpense, 2);
    }
    // Confirms the goal year actually exercised the flowExpense term above.
    expect(p.years.find((y) => y.year === 2035)!.flowExpense).toBeCloseTo(150_000, 0);
  });

  it('taxPaid counts the tax on taxable flow income, not just on withdrawals', () => {
    const input: ProjectionInput = {
      startYear: 2026,
      horizonYears: 0,
      retirementYear: 2026,
      annualSpending: 40_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 65,
      residence: 'US',
      rmdEnabled: false,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
      accounts: [{ id: 'tax', kind: 'taxable', effectiveTaxRate: 0, incomeCoef: 0, flatRate: 0 }],
      accountOrder: ['tax'],
      assets: [
        {
          holdingId: 't',
          symbol: 'T',
          startValue: 1_000_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'tax',
          costBasis: 1_000_000,
        },
      ],
      expensesIncomes: [
        {
          id: 'p',
          name: 'Pension',
          amount: 80_000,
          year: 2026,
          kind: 'income',
          frequency: 'recurring',
          endYear: 2100,
          taxable: true,
          inflate: false,
        },
      ],
    };
    const y0 = project(input, 'expected').years[0]!;
    // An 80k pension alone funds the 40k budget, so nothing is withdrawn — but the
    // pension is still taxed: US single, 80,000 − 16,100 deduction = 63,900 taxable
    // → 1,240 + 4,560 + 2,970 = 8,770. Reporting only the withdrawal tax would show
    // a tax-free year and hide it from the projection table entirely.
    expect(y0.grossWithdrawal).toBeCloseTo(0, 2);
    expect(y0.taxPaid).toBeCloseTo(8_770, 0);
    // The tax really left the household: closing = 1m + (80k − 8,770 − 40k spent).
    expect(y0.closingBalance).toBeCloseTo(1_031_230, 0);
  });

  it('RMD forces a taxable withdrawal from deferred even when spending is low', () => {
    const input: ProjectionInput = {
      startYear: 2026,
      horizonYears: 5,
      retirementYear: 2026,
      annualSpending: 10_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 73,
      residence: 'US',
      rmdEnabled: true,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
      accounts: [
        { id: 'def', kind: 'tax_deferred', effectiveTaxRate: 0, incomeCoef: 1 },
        { id: 'tax', kind: 'taxable', effectiveTaxRate: 0, incomeCoef: 0, flatRate: 0 },
      ],
      accountOrder: ['tax', 'def'],
      assets: [
        {
          holdingId: 'd',
          symbol: 'D',
          startValue: 1_000_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'def',
        },
        {
          holdingId: 't',
          symbol: 'T',
          startValue: 50_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'tax',
        },
      ],
    };
    const y0 = project(input, 'expected').years[0]!;
    // RMD ≈ 1,000,000 / 26.5 ≈ 37,700 forced from deferred → tax paid despite low spend.
    expect(y0.grossWithdrawal).toBeGreaterThan(30_000);
    expect(y0.taxPaid).toBeGreaterThan(0);
  });

  it('a conversion moves deferred → tax-free and is taxed as income', () => {
    const input: ProjectionInput = {
      startYear: 2026,
      horizonYears: 3,
      retirementYear: 2026,
      annualSpending: 1,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 65,
      residence: 'US',
      rmdEnabled: false,
      conversions: [
        {
          id: 'c',
          fromAccountId: 'def',
          toAccountId: 'roth',
          annualAmount: 50_000,
          startAge: 65,
          endAge: 70,
        },
      ],
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
      accounts: [
        { id: 'def', kind: 'tax_deferred', effectiveTaxRate: 0, incomeCoef: 1 },
        { id: 'roth', kind: 'tax_free', effectiveTaxRate: 0, incomeCoef: 0, flatRate: 0 },
      ],
      accountOrder: ['roth', 'def'],
      assets: [
        {
          holdingId: 'd',
          symbol: 'D',
          startValue: 500_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'def',
        },
        {
          holdingId: 'r',
          symbol: 'R',
          startValue: 10_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'roth',
        },
      ],
    };
    const y0 = project(input, 'expected').years[0]!;
    const def0 = y0.perAsset.find((a) => a.holdingId === 'd')!.value;
    const roth0 = y0.perAsset.find((a) => a.holdingId === 'r')!.value;
    expect(def0).toBeLessThan(455_000); // 500k − 50k converted
    expect(roth0).toBeGreaterThan(52_000); // 10k + 50k − conversion tax funded here
    expect(y0.taxPaid).toBeGreaterThan(0); // conversion is ordinary income
  });

  it('dynamic cost basis: a fully-gained taxable account is taxed more than a zero-gain one', () => {
    const base = {
      startYear: 2026,
      horizonYears: 2,
      retirementYear: 2026,
      annualSpending: 50_000,
      inflationPct: 0,
      applyInflation: false,
      currentAge: 60,
      residence: 'FR' as const,
      rmdEnabled: false,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' as const },
      accountOrder: ['cto'],
      rawAccounts: [
        {
          id: 'cto',
          name: 'CTO',
          taxRatePct: 0,
          taxableBasePct: 100,
          kind: 'taxable' as const,
          sourceCountry: 'FR' as const,
          taxMode: 'auto' as const,
          costBasisPct: 0,
        },
      ],
    };
    const mk = (costBasis: number) =>
      project(
        {
          ...base,
          assets: [
            {
              holdingId: 'h',
              symbol: 'H',
              startValue: 1_000_000,
              baseCagrPct: 0,
              annualContribution: 0,
              accountId: 'cto',
              costBasis,
            },
          ],
        } as ProjectionInput,
        'expected',
      );
    const fullGain = mk(0); // basis 0 → 100% gain → full PFU
    const noGain = mk(1_000_000); // basis = value → 0% gain → ~no tax
    expect(fullGain.years[0]!.taxPaid).toBeGreaterThan(noGain.years[0]!.taxPaid);
    expect(noGain.years[0]!.taxPaid).toBeCloseTo(0, 0);
  });

  it('applies scenario adjustments to every asset CAGR', () => {
    const optimistic = project(referenceInput, 'optimistic');
    const expected = project(referenceInput, 'expected');
    expect(optimistic.years[0]!.closingBalance).toBeGreaterThan(expected.years[0]!.closingBalance);
  });

  it('does not deplete before retirement and never goes negative', () => {
    const p = project(referenceInput, 'expected');
    for (const y of p.years) {
      expect(y.closingBalance).toBeGreaterThanOrEqual(0);
      if (y.year < 2033) expect(y.lifestyleSpending).toBe(0);
    }
  });

  it('capitalises monthly contributions during the accumulation phase', () => {
    const withContrib: ProjectionInput = {
      ...referenceInput,
      assets: referenceInput.assets.map((a) =>
        a.holdingId === 'btc' ? { ...a, annualContribution: 12_000 } : a,
      ),
    };
    const base = project(referenceInput, 'expected');
    const contrib = project(withContrib, 'expected');

    // Contributions only appear before retirement, and lift the balance.
    const firstYear = contrib.years[0]!;
    expect(firstYear.contribution).toBe(12_000);
    // The contribution value (with intra-year CAGR) exceeds the raw cash.
    expect(firstYear.contributionValue).toBeGreaterThan(12_000);
    expect(firstYear.closingBalance).toBeGreaterThan(base.years[0]!.closingBalance);

    // No contributions once retired.
    const retiredYear = contrib.years.find((y) => y.year === 2040)!;
    expect(retiredYear.contribution).toBe(0);

    // More invested capital => savings last at least as long (null = never deplete).
    const baseDepletion = base.depletionYear ?? Number.POSITIVE_INFINITY;
    const contribDepletion = contrib.depletionYear ?? Number.POSITIVE_INFINITY;
    expect(contribDepletion).toBeGreaterThanOrEqual(baseDepletion);
  });

  it('lets monthly contributions earn the CAGR within the year they are made', () => {
    const input: ProjectionInput = {
      startYear: 2026,
      horizonYears: 5,
      retirementYear: 2031,
      annualSpending: 0,
      inflationPct: 0,
      applyInflation: false,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
      assets: [
        { holdingId: 'x', symbol: 'X', startValue: 0, baseCagrPct: 12, annualContribution: 1200 },
      ],
    };
    const p = project(input, 'expected');
    const y0 = p.years[0]!;
    // $1,200 contributed monthly at 12% must finish the year worth more than $1,200.
    expect(y0.contribution).toBe(1200);
    expect(y0.contributionValue).toBeGreaterThan(1200);
    expect(y0.closingBalance).toBeGreaterThan(1200);
  });

  it('grosses up withdrawals for account tax so the net lifestyle is funded', () => {
    const input: ProjectionInput = {
      startYear: 2026,
      horizonYears: 2,
      retirementYear: 2026,
      annualSpending: 1000, // desired NET
      inflationPct: 0,
      applyInflation: false,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
      assets: [
        {
          holdingId: 'a',
          symbol: 'A',
          startValue: 100_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'acc1',
        },
      ],
      accounts: [{ id: 'acc1', effectiveTaxRate: 0.25 }],
    };
    const y0 = project(input, 'expected').years[0]!;
    expect(y0.lifestyleSpending).toBeCloseTo(1000, 0); // net delivered
    expect(y0.grossWithdrawal).toBeCloseTo(1000 / 0.75, 0); // ~1333 gross
    expect(y0.taxPaid).toBeCloseTo(1000 / 0.75 - 1000, 0);
    expect(y0.closingBalance).toBeCloseTo(100_000 - 1000 / 0.75, 0);
  });

  it('does not gross up a tax-free account (gross equals net)', () => {
    const input: ProjectionInput = {
      startYear: 2026,
      horizonYears: 1,
      retirementYear: 2026,
      annualSpending: 1000,
      inflationPct: 0,
      applyInflation: false,
      scenario: { ...DEFAULT_SCENARIO_CONFIG, active: 'expected' },
      assets: [
        {
          holdingId: 'a',
          symbol: 'A',
          startValue: 50_000,
          baseCagrPct: 0,
          annualContribution: 0,
          accountId: 'tfsa',
        },
      ],
      accounts: [{ id: 'tfsa', effectiveTaxRate: 0 }],
    };
    const y0 = project(input, 'expected').years[0]!;
    expect(y0.grossWithdrawal).toBeCloseTo(1000, 0);
    expect(y0.taxPaid).toBeCloseTo(0, 0);
  });

  it('projects the future value of contributions to the retirement year', () => {
    // 10/mo for 0 years => 0; positive years & CAGR grow beyond the cash invested.
    expect(contributionFutureValue(10, 10, 0)).toBe(0);
    const fv = contributionFutureValue(100, 10, 10);
    const cash = totalContributed(100, 10);
    expect(cash).toBe(12_000);
    expect(fv).toBeGreaterThan(cash);
    // With 0% CAGR the future value equals the cash contributed.
    expect(contributionFutureValue(100, 0, 10)).toBeCloseTo(cash, 5);
  });
});
