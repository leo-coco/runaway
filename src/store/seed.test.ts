import { describe, expect, it } from 'vitest';
import { SANDBOX_PROFILE_IDS, createEmptySandboxPlan, createSandboxPlan } from './seed';
import { parseInstrumentId } from '@/services/instrumentRef';

describe('createSandboxPlan', () => {
  it('creates a genuinely blank sandbox plan on explicit request', () => {
    const plan = createEmptySandboxPlan('fr');

    expect(plan.name).toBe('Mon plan vide');
    expect(plan.currency).toBe('EUR');
    expect(plan.residenceCountry).toBe('FR');
    expect(plan.holdings).toEqual([]);
    expect(plan.accounts).toHaveLength(1);
  });

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

  it('creates holdings whose instrument ids resolve to a provider', () => {
    for (const holding of createSandboxPlan('en').holdings) {
      expect(parseInstrumentId(holding.instrument.id), holding.instrument.symbol).not.toBeNull();
    }
  });

  it.each(SANDBOX_PROFILE_IDS)(
    'creates the %s profile with two refreshable holdings',
    (profileId) => {
      const plan = createSandboxPlan('en', profileId);

      expect(plan.holdings).toHaveLength(2);
      expect(plan.accounts).toHaveLength(1);
      expect(plan.holdings.every((holding) => holding.accountId === plan.accounts[0]?.id)).toBe(
        true,
      );
      expect(plan.holdings.every((holding) => parseInstrumentId(holding.instrument.id))).toBe(true);
      expect(plan.settings.inflationPct).toBe(2.1);
      expect(plan.settings.lifeExpectancyAge).toBe(95);
      expect(plan.settings.expensesIncomes?.some((flow) => flow.category === 'pension')).toBe(true);
    },
  );

  it('keeps every public example on free-tier linear spending', () => {
    for (const profileId of SANDBOX_PROFILE_IDS) {
      expect(createSandboxPlan('en', profileId).settings.spendingMode).toBe('linear');
    }
  });

  it('keeps the young comparison identical except for crypto versus bonds', () => {
    const crypto = createSandboxPlan('en', 'young_crypto');
    const noCrypto = createSandboxPlan('en', 'young_no_crypto');
    const total = (plan: ReturnType<typeof createSandboxPlan>) =>
      plan.holdings.reduce((sum, holding) => sum + holding.quantity * holding.pricePerUnit, 0);

    expect(total(crypto)).toBe(50_000);
    expect(total(noCrypto)).toBe(50_000);
    expect(crypto.settings).toMatchObject({
      currentAge: noCrypto.settings.currentAge,
      retirementYear: noCrypto.settings.retirementYear,
      lifeExpectancyAge: noCrypto.settings.lifeExpectancyAge,
      annualSpending: noCrypto.settings.annualSpending,
      inflationPct: noCrypto.settings.inflationPct,
    });
    expect(crypto.holdings.map((holding) => holding.instrument.assetClass)).toEqual([
      'eu_equity',
      'crypto',
    ]);
    expect(noCrypto.holdings.map((holding) => holding.instrument.assetClass)).toEqual([
      'eu_equity',
      'other',
    ]);
  });

  it('creates the Canadian and retired profiles at their target balances', () => {
    const balance = (profileId: 'midlife_balanced' | 'retired_protective') =>
      createSandboxPlan('en', profileId).holdings.reduce(
        (sum, holding) => sum + holding.quantity * holding.pricePerUnit,
        0,
      );

    expect(balance('midlife_balanced')).toBeCloseTo(350_000, 2);
    expect(balance('retired_protective')).toBeCloseTo(500_000, 2);
  });
});
