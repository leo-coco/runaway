import { describe, expect, it } from 'vitest';
import { accountTaxAtSpending } from './accountTaxRate';
import { withdrawNet, type WithdrawableAsset } from '@/services/retirementCalculator';
import { accountTaxProfile, type Account } from './account';

const base = (over: Partial<Account>): Account => ({
  id: 'a1',
  name: 'Test',
  kind: 'taxable',
  taxRatePct: 0,
  taxableBasePct: 100,
  taxMode: 'auto',
  ...over,
});

describe('accountTaxAtSpending', () => {
  it('keeps net = gross − tax and a consistent effective rate', () => {
    const a = base({ kind: 'tax_deferred', sourceCountry: 'FR' });
    const r = accountTaxAtSpending(a, 'FR', 80_000);
    expect(r.gross - r.tax).toBeCloseTo(80_000, 2);
    expect(r.effective).toBeCloseTo(r.tax / r.gross, 6);
  });

  it('a tax-deferred rate rises with the withdrawal level (progressive brackets)', () => {
    const a = base({ kind: 'tax_deferred', sourceCountry: 'FR' });
    const low = accountTaxAtSpending(a, 'FR', 20_000).effective;
    const high = accountTaxAtSpending(a, 'FR', 200_000).effective;
    expect(high).toBeGreaterThan(low);
  });

  it('bracket slices sum to the ordinary income and to the income tax', () => {
    const a = base({ kind: 'tax_deferred', sourceCountry: 'CA' });
    const r = accountTaxAtSpending(a, 'CA', 120_000);
    const sliceSum = r.brackets.reduce((s, b) => s + b.amount, 0);
    const taxSum = r.brackets.reduce((s, b) => s + b.tax, 0);
    expect(sliceSum).toBeCloseTo(r.ordinaryIncome, 2);
    expect(taxSum).toBeCloseTo(r.tax, 2);
  });

  it('matches the engine: grossing the same net from one deferred account', () => {
    // The single-account breakdown should equal withdrawNet on the same account.
    const a = base({ kind: 'tax_deferred', sourceCountry: 'FR' });
    const p = accountTaxProfile(a, 'FR');
    const state: WithdrawableAsset[] = [{ value: 10_000_000, accountId: a.id }];
    const engine = withdrawNet(
      state,
      80_000,
      [
        {
          id: a.id,
          effectiveTaxRate: 0,
          incomeCoef: p.incomeCoef,
          flatRate: p.flatRate,
          withholding: p.withholding,
        },
      ],
      [a.id],
      { residence: 'FR', inflationFactor: 1 },
    );
    const mine = accountTaxAtSpending(a, 'FR', 80_000);
    expect(mine.gross).toBeCloseTo(engine.gross, 0);
    expect(mine.tax).toBeCloseTo(engine.tax, 0);
  });

  it('a foreign account where withholding dominates is flat (withholdingBinds)', () => {
    // US taxable account for a FR resident with a high cost basis: the residence
    // capital-gains tax on the tiny gain (~1.5%) is below the 15% US withholding,
    // so withholding binds and the rate is flat (no progressive brackets).
    const a = base({ kind: 'taxable', sourceCountry: 'US', costBasisPct: 95 });
    const r = accountTaxAtSpending(a, 'FR', 60_000);
    expect(r.withholding).toBeCloseTo(0.15, 6);
    expect(r.effective).toBeCloseTo(0.15, 6);
  });
});
