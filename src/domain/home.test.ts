import { describe, expect, it } from 'vitest';
import {
  homeEquitySeries,
  homeFlows,
  homeSaleProceeds,
  mortgageAnnualPayment,
  mortgageBalanceAt,
  type Home,
} from './home';

const START = 2025;

const ownedHome: Home = {
  id: 'h1',
  name: 'Maison',
  currentValue: 500_000,
  appreciationPct: 3,
  ownershipCostPct: 2,
};

describe('mortgageAnnualPayment', () => {
  it('is zero for a non-positive balance or term', () => {
    expect(mortgageAnnualPayment(0, 5, 25)).toBe(0);
    expect(mortgageAnnualPayment(300_000, 5, 0)).toBe(0);
  });

  it('reduces to straight-line principal at ~0% rate', () => {
    expect(mortgageAnnualPayment(300_000, 0, 25)).toBeCloseTo(12_000, 6);
  });

  it('matches the standard amortization formula', () => {
    // 300k @ 5% over 25y ≈ $1,753.77/mo → ~$21,045/yr.
    expect(mortgageAnnualPayment(300_000, 5, 25)).toBeCloseTo(21_045.3, 0);
  });
});

describe('mortgageBalanceAt', () => {
  const m = { balance: 300_000, ratePct: 5, termYearsRemaining: 25 };

  it('is the full balance at or before ownership start', () => {
    expect(mortgageBalanceAt(m, START, START)).toBe(300_000);
    expect(mortgageBalanceAt(m, START, START - 3)).toBe(300_000);
  });

  it('is zero once the term is paid off', () => {
    expect(mortgageBalanceAt(m, START, START + 25)).toBe(0);
    expect(mortgageBalanceAt(m, START, START + 40)).toBe(0);
  });

  it('amortizes down over the term (balance falls each year)', () => {
    const y5 = mortgageBalanceAt(m, START, START + 5);
    const y15 = mortgageBalanceAt(m, START, START + 15);
    expect(y5).toBeLessThan(300_000);
    expect(y15).toBeLessThan(y5);
    expect(y15).toBeGreaterThan(0);
  });
});

describe('homeSaleProceeds', () => {
  it('is null without a planned sale', () => {
    expect(homeSaleProceeds(ownedHome, START)).toBeNull();
  });

  it('is the appreciated value net of fees and the outstanding mortgage', () => {
    const home: Home = {
      ...ownedHome,
      mortgage: { balance: 200_000, ratePct: 5, termYearsRemaining: 25 },
      sale: { year: START + 10, feePct: 5 },
    };
    const gross = 500_000 * Math.pow(1.03, 10);
    const remaining = mortgageBalanceAt(home.mortgage!, START, START + 10);
    expect(homeSaleProceeds(home, START)).toBeCloseTo(gross * 0.95 - remaining, 4);
  });

  it('floors at zero when fees + mortgage exceed the price', () => {
    const home: Home = {
      ...ownedHome,
      currentValue: 100_000,
      appreciationPct: 0,
      mortgage: { balance: 100_000, ratePct: 0, termYearsRemaining: 30 },
      sale: { year: START + 1, feePct: 10 },
    };
    expect(homeSaleProceeds(home, START)).toBe(0);
  });
});

describe('homeEquitySeries', () => {
  it('tracks value, mortgage and equity year by year', () => {
    const home: Home = {
      ...ownedHome,
      mortgage: { balance: 300_000, ratePct: 5, termYearsRemaining: 25 },
    };
    const series = homeEquitySeries(home, START, 5);
    expect(series).toHaveLength(6);
    expect(series[0]!.value).toBeCloseTo(500_000, 4);
    expect(series[0]!.mortgageBalance).toBe(300_000);
    expect(series[0]!.equity).toBeCloseTo(200_000, 4);
    // Value appreciates and equity grows as the mortgage amortizes.
    expect(series[5]!.value).toBeGreaterThan(series[0]!.value);
    expect(series[5]!.equity).toBeGreaterThan(series[0]!.equity);
  });

  it('is zero before a future purchase and after a sale', () => {
    const home: Home = {
      ...ownedHome,
      purchase: { year: START + 2, downPayment: 100_000 },
      sale: { year: START + 8 },
    };
    const series = homeEquitySeries(home, START, 10);
    expect(series[0]!.value).toBe(0); // before purchase
    expect(series[1]!.value).toBe(0);
    expect(series[2]!.value).toBeGreaterThan(0); // purchase year
    expect(series.find((s) => s.year === START + 8)!.value).toBe(0); // sale year onward
    expect(series.find((s) => s.year === START + 9)!.value).toBe(0);
  });
});

describe('homeFlows', () => {
  it('is empty for an undefined home', () => {
    expect(homeFlows(undefined, START)).toEqual([]);
  });

  it('emits only an ownership cost for an owned home with no mortgage or sale', () => {
    const flows = homeFlows(ownedHome, START);
    expect(flows).toHaveLength(1);
    const ownership = flows[0]!;
    expect(ownership.id).toBe('home:ownership');
    expect(ownership.kind).toBe('expense');
    expect(ownership.frequency).toBe('recurring');
    expect(ownership.amount).toBeCloseTo(10_000, 4); // 2% of 500k
    expect(ownership.growthPct).toBe(3); // tracks the home's own appreciation
  });

  it('emits a nominal, fixed mortgage payment stopping at the payoff year', () => {
    const home: Home = {
      ...ownedHome,
      ownershipCostPct: 0,
      mortgage: { balance: 300_000, ratePct: 5, termYearsRemaining: 25 },
    };
    const flows = homeFlows(home, START);
    const mortgage = flows.find((f) => f.id === 'home:mortgage')!;
    expect(mortgage.frequency).toBe('recurring');
    expect(mortgage.inflate).toBe(false);
    expect(mortgage.year).toBe(START);
    expect(mortgage.endYear).toBe(START + 24);
    expect(mortgage.amount).toBeCloseTo(21_045.3, 0);
  });

  it('emits a purchase outlay = down payment + closing costs, appreciated to the purchase year', () => {
    const home: Home = {
      ...ownedHome,
      ownershipCostPct: 0,
      purchase: { year: START + 3, downPayment: 100_000, closingCostPct: 2 },
    };
    const purchase = homeFlows(home, START).find((f) => f.id === 'home:purchase')!;
    expect(purchase.kind).toBe('expense');
    expect(purchase.frequency).toBeUndefined(); // one-off
    // Already nominal: both parts are pinned to the home's price, so they ride
    // its 3%/yr appreciation over the 3 years to purchase rather than CPI.
    expect(purchase.inflate).toBe(false);
    const factor = 1.03 ** 3;
    expect(purchase.amount).toBeCloseTo((100_000 + 0.02 * 500_000) * factor, 4);
  });

  it('sizes a future purchase mortgage on the price at purchase, not today', () => {
    const home: Home = {
      ...ownedHome,
      ownershipCostPct: 0,
      purchase: { year: START + 10, downPayment: 100_000 },
      mortgage: { balance: 400_000, ratePct: 5, termYearsRemaining: 25 },
    };
    const mortgage = homeFlows(home, START).find((f) => f.id === 'home:mortgage')!;
    // The loan funds a home that costs 1.03^10 more by then, so the payment is on
    // the grown balance. Still nominal once drawn: a fixed rate does not index.
    expect(mortgage.inflate).toBe(false);
    expect(mortgage.amount).toBeCloseTo(mortgageAnnualPayment(400_000 * 1.03 ** 10, 5, 25), 4);
  });

  it('leaves an already-owned home mortgage on its today balance', () => {
    const home: Home = {
      ...ownedHome,
      mortgage: { balance: 300_000, ratePct: 5, termYearsRemaining: 25 },
    };
    const mortgage = homeFlows(home, START).find((f) => f.id === 'home:mortgage')!;
    expect(mortgage.amount).toBeCloseTo(mortgageAnnualPayment(300_000, 5, 25), 4);
  });

  it('emits a non-taxable sale income and stops ownership costs the year before', () => {
    const home: Home = {
      ...ownedHome,
      sale: { year: START + 10, feePct: 5 },
    };
    const flows = homeFlows(home, START);
    const ownership = flows.find((f) => f.id === 'home:ownership')!;
    expect(ownership.endYear).toBe(START + 9); // stops the year before the sale
    const sale = flows.find((f) => f.id === 'home:sale')!;
    expect(sale.kind).toBe('income');
    expect(sale.inflate).toBe(false);
    expect(sale.taxable).toBe(false);
    expect(sale.amount).toBeCloseTo(homeSaleProceeds(home, START)!, 4);
  });

  it('taxes only the gain above cost basis, not the full proceeds, when capitalGainsTaxable is set', () => {
    const home: Home = { ...ownedHome, sale: { year: START + 5, capitalGainsTaxable: true } };
    const sale = homeFlows(home, START).find((f) => f.id === 'home:sale')!;
    const grossPrice = 500_000 * 1.03 ** 5;
    const gain = grossPrice - 500_000; // no costBasis set → defaults to currentValue
    expect(sale.taxable).toBe(true);
    expect(sale.amount).toBeCloseTo(grossPrice, 4);
    expect(sale.taxableFraction).toBeCloseTo(gain / grossPrice, 6);
  });

  it('uses an explicit cost basis to size the taxable gain on an already-owned home', () => {
    const home: Home = {
      ...ownedHome,
      sale: { year: START + 5, capitalGainsTaxable: true, costBasis: 300_000 },
    };
    const sale = homeFlows(home, START).find((f) => f.id === 'home:sale')!;
    const grossPrice = 500_000 * 1.03 ** 5;
    const gain = grossPrice - 300_000;
    expect(sale.taxableFraction).toBeCloseTo(gain / grossPrice, 6);
  });
});
