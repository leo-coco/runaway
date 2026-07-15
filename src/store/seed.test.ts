import { describe, expect, it } from 'vitest';
import { createSandboxPlan } from './seed';

describe('createSandboxPlan', () => {
  it('creates the French $150,000 two-asset starter plan', () => {
    const plan = createSandboxPlan('fr');

    expect(plan.name).toBe('Ma retraite');
    expect(plan.accounts).toHaveLength(1);
    expect(plan.accounts[0]?.name).toBe('Mon compte');
    expect(plan.holdings.map((holding) => [holding.instrument.symbol, holding.quantity])).toEqual([
      ['VOO', 100],
      ['BTC', 2],
    ]);
    expect(plan.holdings.map((holding) => [holding.instrument.symbol, holding.costBasis])).toEqual([
      ['VOO', 95],
      ['BTC', 45_000],
    ]);
    expect(
      plan.holdings.map((holding) => [holding.instrument.symbol, holding.expectedCagrPct]),
    ).toEqual([
      ['VOO', 5],
      ['BTC', 6],
    ]);
    expect(
      plan.holdings.map((holding) => [holding.instrument.symbol, holding.monthlyContribution]),
    ).toEqual([
      ['VOO', 100],
      ['BTC', 0],
    ]);
    expect(plan.settings.retirementYear).toBe(new Date().getFullYear() + 20);
    expect(plan.settings.lifeExpectancyAge).toBe(85);
    expect(plan.settings.annualSpending).toBe(30_000);
    expect(
      plan.holdings.reduce((total, holding) => total + holding.quantity * holding.pricePerUnit, 0),
    ).toBe(150_000);
    expect(plan.holdings.every((holding) => holding.accountId === plan.accounts[0]?.id)).toBe(true);
  });

  it('localizes the English plan and account names', () => {
    const plan = createSandboxPlan('en');
    expect(plan.name).toBe('My retirement');
    expect(plan.accounts[0]?.name).toBe('My account');
  });
});
