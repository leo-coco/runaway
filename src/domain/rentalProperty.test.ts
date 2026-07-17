import { describe, expect, it } from 'vitest';
import {
  rentalPropertiesEquitySeries,
  rentalPropertyEquitySeries,
  rentalPropertyFlows,
  rentalSaleProceeds,
  type RentalProperty,
} from './rentalProperty';
import { mortgageAnnualPayment, mortgageBalanceAt } from './home';

const START = 2025;
const INFL = 2;

const base: RentalProperty = {
  id: 'r1',
  name: 'Studio',
  currentValue: 300_000,
  appreciationPct: 3,
  monthlyRent: 1_500,
  rentInflationPct: 2,
  vacancyPct: 0,
};

const flowById = (p: RentalProperty, suffix: string) =>
  rentalPropertyFlows(p, START, INFL).find((f) => f.id === `rental:${p.id}:${suffix}`);

describe('rentalPropertyFlows income', () => {
  it('emits recurring rent net of vacancy, indexed at rentInflationPct', () => {
    const income = flowById({ ...base, vacancyPct: 10 }, 'income')!;
    expect(income.kind).toBe('income');
    expect(income.frequency).toBe('recurring');
    expect(income.category).toBe('rentalIncome');
    expect(income.growthPct).toBe(2);
    expect(income.amount).toBeCloseTo(1_500 * 12 * 0.9, 4); // 10% vacancy
    expect(income.year).toBe(START);
  });

  it('taxes the gross rent in gross mode (no per-year taxable schedule)', () => {
    const income = flowById({ ...base, taxMode: 'gross' }, 'income')!;
    expect(income.taxable).toBe(true);
    expect(income.taxableAmounts).toBeUndefined();
  });

  it('nets operating costs and loan interest out of the taxable base in net mode', () => {
    const p: RentalProperty = {
      ...base,
      taxMode: 'net',
      managementFeePct: 8,
      propertyTaxAnnual: 1_200,
      maintenancePct: 1,
      insuranceAnnual: 400,
      mortgage: { balance: 200_000, ratePct: 4, termYearsRemaining: 20 },
    };
    const income = flowById(p, 'income')!;
    const taxable = income.taxableAmounts!;
    // First year: taxable base = rent − operating − interest, and strictly below
    // the gross rent since deductibles are positive.
    const rent = 1_500 * 12;
    const management = 0.08 * rent;
    const maintenance = 0.01 * 300_000;
    const operating = management + maintenance + 1_200 + 400;
    const interest =
      mortgageAnnualPayment(200_000, 4, 20) -
      (200_000 - mortgageBalanceAt(p.mortgage!, START, START + 1));
    expect(taxable[START]).toBeCloseTo(Math.max(0, rent - operating - interest), 2);
    expect(taxable[START]).toBeLessThan(rent);
  });

  it('floors the net taxable base at zero when deductibles exceed the rent', () => {
    const p: RentalProperty = {
      ...base,
      monthlyRent: 500,
      maintenancePct: 5, // 15k/yr on a 300k property, far above the 6k rent
    };
    const income = flowById(p, 'income')!;
    expect(income.taxableAmounts![START]).toBe(0);
  });
});

describe('rentalPropertyFlows operating and mortgage', () => {
  it('aggregates operating costs into one CPI-indexed expense', () => {
    const p: RentalProperty = { ...base, propertyTaxAnnual: 1_000, insuranceAnnual: 500 };
    const operating = flowById(p, 'operating')!;
    expect(operating.kind).toBe('expense');
    expect(operating.frequency).toBe('recurring');
    expect(operating.growthPct).toBe(INFL);
    expect(operating.amount).toBeCloseTo(1_500, 4); // 1000 + 500, no vacancy/mgmt/maint
  });

  it('emits no operating flow when there are no operating costs', () => {
    expect(flowById(base, 'operating')).toBeUndefined();
  });

  it('sizes a future-purchase mortgage on the price at purchase', () => {
    const p: RentalProperty = {
      ...base,
      purchase: { year: START + 10, downPayment: 60_000 },
      mortgage: { balance: 240_000, ratePct: 4, termYearsRemaining: 25 },
    };
    const mortgage = flowById(p, 'mortgage')!;
    expect(mortgage.inflate).toBe(false);
    expect(mortgage.amount).toBeCloseTo(mortgageAnnualPayment(240_000 * 1.03 ** 10, 4, 25), 4);
    expect(mortgage.year).toBe(START + 10);
  });
});

describe('rentalPropertyFlows sale', () => {
  it('taxes the capital gain by default (no principal-residence exemption)', () => {
    const p: RentalProperty = { ...base, sale: { year: START + 8, feePct: 4 } };
    const sale = flowById(p, 'sale')!;
    expect(sale.kind).toBe('income');
    expect(sale.taxable).toBe(true);
    expect(sale.amount).toBeCloseTo(rentalSaleProceeds(p, START)!, 4);
    const grossPrice = 300_000 * 1.03 ** 8;
    const gain = grossPrice * 0.96 - 300_000; // fees 4%, basis = currentValue
    expect(sale.taxableFraction! * sale.amount).toBeCloseTo(gain, 2);
  });

  it('stops rent and operating costs the year before the sale', () => {
    const p: RentalProperty = { ...base, propertyTaxAnnual: 1_000, sale: { year: START + 5 } };
    expect(flowById(p, 'income')!.endYear).toBe(START + 4);
    expect(flowById(p, 'operating')!.endYear).toBe(START + 4);
  });
});

describe('rental equity series', () => {
  it('tracks value, mortgage and equity, and combines across properties', () => {
    const p: RentalProperty = {
      ...base,
      mortgage: { balance: 200_000, ratePct: 4, termYearsRemaining: 25 },
    };
    const single = rentalPropertyEquitySeries(p, START, 3);
    expect(single[0]!.value).toBeCloseTo(300_000, 4);
    expect(single[0]!.mortgageBalance).toBe(200_000);
    expect(single[0]!.equity).toBeCloseTo(100_000, 4);

    const combined = rentalPropertiesEquitySeries([p, { ...p, id: 'r2' }], START, 3);
    expect(combined[0]!.equity).toBeCloseTo(2 * single[0]!.equity, 4);
  });

  it('is zero before a future purchase and after a sale', () => {
    const p: RentalProperty = {
      ...base,
      purchase: { year: START + 2, downPayment: 50_000 },
      sale: { year: START + 6 },
    };
    const series = rentalPropertyEquitySeries(p, START, 8);
    expect(series[0]!.value).toBe(0);
    expect(series[2]!.value).toBeGreaterThan(0);
    expect(series.find((s) => s.year === START + 6)!.value).toBe(0);
  });
});
