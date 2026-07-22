import { describe, expect, it } from 'vitest';
import type { Holding } from './asset';
import type { Home } from './home';
import type { RentalProperty } from './rentalProperty';
import { rescalePlanAmounts, type Plan } from './plan';
import { DEFAULT_RETIREMENT_SETTINGS } from './retirementSettings';
import { DEFAULT_SCENARIO_CONFIG } from './scenario';

const holding: Holding = {
  id: 'h1',
  instrument: {
    id: 'yahoo:VOO',
    symbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    assetClass: 'us_equity',
    exchange: 'NYSE Arca',
    nativeCurrency: 'USD',
  },
  quantity: 10,
  pricePerUnit: 500,
  expectedCagrPct: 5,
  monthlyContribution: 250,
  costBasis: 300,
  accountId: 'a1',
};

const home: Home = {
  id: 'home',
  name: 'Home',
  currentValue: 500_000,
  appreciationPct: 2,
  ownershipCostPct: 2.5,
  mortgage: { balance: 200_000, ratePct: 3, termYearsRemaining: 20 },
  purchase: { year: 2030, downPayment: 100_000, closingCostPct: 3 },
  sale: { year: 2050, feePct: 5, costBasis: 400_000 },
};

const rental: RentalProperty = {
  id: 'r1',
  name: 'Studio',
  currentValue: 250_000,
  appreciationPct: 1.5,
  monthlyRent: 1_200,
  rentInflationPct: 2,
  vacancyPct: 8,
  managementFeePct: 7,
  propertyTaxAnnual: 1_500,
  maintenancePct: 1,
  insuranceAnnual: 400,
};

const plan: Plan = {
  id: 'p1',
  name: 'Plan',
  description: '',
  currency: 'USD',
  holdings: [holding],
  home,
  properties: [rental],
  accounts: [{ id: 'a1', name: 'Brokerage', taxRatePct: 30, taxableBasePct: 50, costBasisPct: 60 }],
  withdrawalOrder: ['a1'],
  residenceCountry: 'US',
  settings: {
    ...DEFAULT_RETIREMENT_SETTINGS,
    annualSpending: 60_000,
    expensesIncomes: [
      {
        id: 'pension',
        name: 'Pension',
        amount: 20_000,
        year: 2040,
        kind: 'income',
        taxableAmounts: { 2040: 15_000, 2041: 16_000 },
      },
      { id: 'tuition', name: 'Tuition', amount: 30_000, year: 2035, kind: 'expense' },
    ],
    conversions: [
      {
        id: 'c1',
        fromAccountId: 'a1',
        toAccountId: 'a1',
        annualAmount: 25_000,
        startAge: 60,
        endAge: 70,
      },
    ],
  },
  scenario: { ...DEFAULT_SCENARIO_CONFIG },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('rescalePlanAmounts', () => {
  const scaled = rescalePlanAmounts(plan, 0.92);

  it('returns the same plan untouched when the factor is 1', () => {
    expect(rescalePlanAmounts(plan, 1)).toBe(plan);
  });

  it('rescales spending, flows and their explicit taxable bases', () => {
    expect(scaled.settings.annualSpending).toBe(55_200);
    expect(scaled.settings.expensesIncomes![0]!.amount).toBe(18_400);
    expect(scaled.settings.expensesIncomes![0]!.taxableAmounts).toEqual({
      2040: 13_800,
      2041: 14_720,
    });
    expect(scaled.settings.expensesIncomes![1]!.amount).toBe(27_600);
  });

  it('rescales scheduled conversions', () => {
    expect(scaled.settings.conversions![0]!.annualAmount).toBe(23_000);
  });

  it('rescales every monetary field of the home', () => {
    expect(scaled.home!.currentValue).toBe(460_000);
    expect(scaled.home!.mortgage!.balance).toBe(184_000);
    expect(scaled.home!.purchase!.downPayment).toBe(92_000);
    expect(scaled.home!.sale!.costBasis).toBe(368_000);
  });

  it('rescales every monetary field of a rental property', () => {
    const p = scaled.properties![0]!;
    expect(p.currentValue).toBe(230_000);
    expect(p.monthlyRent).toBe(1_104);
    expect(p.propertyTaxAnnual).toBe(1_380);
    expect(p.insuranceAnnual).toBe(368);
  });

  it('leaves holdings alone: they are stored in their native currency', () => {
    expect(scaled.holdings).toEqual(plan.holdings);
  });

  it('leaves percentages, accounts and phase settings alone', () => {
    expect(scaled.home!.appreciationPct).toBe(2);
    expect(scaled.home!.ownershipCostPct).toBe(2.5);
    expect(scaled.home!.sale!.feePct).toBe(5);
    expect(scaled.properties![0]!.vacancyPct).toBe(8);
    expect(scaled.properties![0]!.managementFeePct).toBe(7);
    expect(scaled.accounts).toEqual(plan.accounts);
    expect(scaled.settings.inflationPct).toBe(plan.settings.inflationPct);
  });

  it('handles a plan with no home, properties, flows or conversions', () => {
    const bare: Plan = {
      ...plan,
      settings: { ...DEFAULT_RETIREMENT_SETTINGS, annualSpending: 60_000 },
    };
    delete (bare as { home?: Home }).home;
    delete (bare as { properties?: readonly RentalProperty[] }).properties;

    const out = rescalePlanAmounts(bare, 0.92);

    expect(out.settings.annualSpending).toBe(55_200);
    expect(out.home).toBeUndefined();
    expect(out.properties).toBeUndefined();
    expect('home' in out).toBe(false);
    expect('properties' in out).toBe(false);
  });

  it('round-trips back to the original amounts', () => {
    const back = rescalePlanAmounts(scaled, 1 / 0.92);
    expect(back.settings.annualSpending).toBe(60_000);
    expect(back.home!.currentValue).toBe(500_000);
    expect(back.properties![0]!.monthlyRent).toBe(1_200);
  });
});
