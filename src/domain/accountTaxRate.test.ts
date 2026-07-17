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

  it('a foreign tax-deferred account where withholding dominates is flat (withholdingBinds)', () => {
    // CA RRSP for a US resident: the whole withdrawal is ordinary income, so the
    // 25% Part XIII withholding bites on all of it and beats the US progressive
    // tax at this spending — the rate goes flat (no brackets).
    const a = base({ kind: 'tax_deferred', sourceCountry: 'CA' });
    const r = accountTaxAtSpending(a, 'US', 60_000);
    expect(r.withholding).toBeCloseTo(0.25, 6);
    expect(r.withholdingBinds).toBe(true);
    expect(r.effective).toBeCloseTo(0.25, 6);
    expect(r.brackets).toEqual([]);
  });

  it('withholding on a taxable account is charged on the gain, not the gross', () => {
    // US taxable for a FR resident, 95% basis. A sale mostly returns the investor's
    // own basis, which no treaty taxes: withholding is 15% of the 5% gain (0.75%),
    // not 15% of the whole withdrawal, so it no longer dominates the residence tax.
    const a = base({ kind: 'taxable', sourceCountry: 'US', costBasisPct: 95 });
    const r = accountTaxAtSpending(a, 'FR', 60_000);
    expect(r.withholding).toBeCloseTo(0.15 * 0.05, 6);
    expect(r.withholdingBinds).toBe(false);
    expect(r.effective).toBeCloseTo(0.314 * 0.05, 6);
  });
});
