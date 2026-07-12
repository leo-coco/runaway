import { describe, expect, it } from 'vitest';
import { expenseIncomeAmountsForYear, type ExpenseIncome } from './expenseIncome';

describe('expenseIncomeAmountsForYear', () => {
  it('returns zeroes when the list is empty or undefined', () => {
    expect(expenseIncomeAmountsForYear(undefined, 2030, 1.5)).toEqual({
      expense: 0,
      income: 0,
      taxableIncome: 0,
    });
    expect(expenseIncomeAmountsForYear([], 2030, 1.5)).toEqual({
      expense: 0,
      income: 0,
      taxableIncome: 0,
    });
  });

  it('returns zeroes when no item matches the year', () => {
    const items: ExpenseIncome[] = [
      { id: 'a', name: 'House', amount: 100_000, year: 2031, kind: 'expense' },
    ];
    expect(expenseIncomeAmountsForYear(items, 2030, 1.5)).toEqual({
      expense: 0,
      income: 0,
      taxableIncome: 0,
    });
  });

  it('inflates an expense item by the inflation factor when inflate is true (default)', () => {
    const items: ExpenseIncome[] = [
      { id: 'a', name: 'House', amount: 100_000, year: 2030, kind: 'expense' },
    ];
    expect(expenseIncomeAmountsForYear(items, 2030, 1.2).expense).toBeCloseTo(120_000, 6);
  });

  it('leaves the amount nominal when inflate is false', () => {
    const items: ExpenseIncome[] = [
      { id: 'a', name: 'House', amount: 100_000, year: 2030, kind: 'expense', inflate: false },
    ];
    expect(expenseIncomeAmountsForYear(items, 2030, 1.2).expense).toBeCloseTo(100_000, 6);
  });

  it('routes kind: income into the income bucket, not expense', () => {
    const items: ExpenseIncome[] = [
      { id: 'a', name: 'Inheritance', amount: 50_000, year: 2030, kind: 'income', inflate: false },
    ];
    const result = expenseIncomeAmountsForYear(items, 2030, 1);
    expect(result.income).toBeCloseTo(50_000, 6);
    expect(result.expense).toBe(0);
  });

  it('sums multiple items landing on the same year, mixing expense and income', () => {
    const items: ExpenseIncome[] = [
      {
        id: 'a',
        name: 'House purchase',
        amount: 200_000,
        year: 2030,
        kind: 'expense',
        inflate: false,
      },
      { id: 'b', name: 'House sale', amount: 300_000, year: 2030, kind: 'income', inflate: false },
      { id: 'c', name: 'Car', amount: 40_000, year: 2030, kind: 'expense', inflate: false },
    ];
    const result = expenseIncomeAmountsForYear(items, 2030, 1);
    expect(result.expense).toBeCloseTo(240_000, 6);
    expect(result.income).toBeCloseTo(300_000, 6);
  });

  describe('recurring flows', () => {
    const tuition: ExpenseIncome = {
      id: 'r',
      name: 'Tuition',
      amount: 10_000,
      year: 2031,
      endYear: 2035,
      kind: 'expense',
      frequency: 'recurring',
      inflate: false,
    };

    it('matches every year inside [year, endYear] inclusive', () => {
      expect(expenseIncomeAmountsForYear([tuition], 2031, 1).expense).toBeCloseTo(10_000, 6);
      expect(expenseIncomeAmountsForYear([tuition], 2033, 1).expense).toBeCloseTo(10_000, 6);
      expect(expenseIncomeAmountsForYear([tuition], 2035, 1).expense).toBeCloseTo(10_000, 6);
    });

    it('does not match before the start year or after the end year', () => {
      expect(expenseIncomeAmountsForYear([tuition], 2030, 1).expense).toBe(0);
      expect(expenseIncomeAmountsForYear([tuition], 2036, 1).expense).toBe(0);
    });

    it('falls back to `year` as the end when endYear is unset', () => {
      const single: ExpenseIncome = { ...tuition, endYear: undefined };
      expect(expenseIncomeAmountsForYear([single], 2031, 1).expense).toBeCloseTo(10_000, 6);
      expect(expenseIncomeAmountsForYear([single], 2032, 1).expense).toBe(0);
    });

    it('applies that year’s inflation factor independently for each year in range', () => {
      const inflating: ExpenseIncome = { ...tuition, inflate: true };
      expect(expenseIncomeAmountsForYear([inflating], 2031, 1).expense).toBeCloseTo(10_000, 6);
      expect(expenseIncomeAmountsForYear([inflating], 2035, 1.2).expense).toBeCloseTo(12_000, 6);
    });

    it('coexists with a one-off item landing the same year', () => {
      const oneOff: ExpenseIncome = {
        id: 'o',
        name: 'Car',
        amount: 40_000,
        year: 2033,
        kind: 'income',
        inflate: false,
      };
      const result = expenseIncomeAmountsForYear([tuition, oneOff], 2033, 1);
      expect(result.expense).toBeCloseTo(10_000, 6);
      expect(result.income).toBeCloseTo(40_000, 6);
    });
  });

  describe('taxableIncome', () => {
    it('counts income as taxable by default (taxable unset)', () => {
      const items: ExpenseIncome[] = [
        { id: 'a', name: 'Rental', amount: 20_000, year: 2030, kind: 'income', inflate: false },
      ];
      const result = expenseIncomeAmountsForYear(items, 2030, 1);
      expect(result.income).toBeCloseTo(20_000, 6);
      expect(result.taxableIncome).toBeCloseTo(20_000, 6);
    });

    it('excludes income from taxableIncome when taxable is explicitly false', () => {
      const items: ExpenseIncome[] = [
        {
          id: 'a',
          name: 'Inheritance',
          amount: 50_000,
          year: 2030,
          kind: 'income',
          inflate: false,
          taxable: false,
        },
      ];
      const result = expenseIncomeAmountsForYear(items, 2030, 1);
      expect(result.income).toBeCloseTo(50_000, 6);
      expect(result.taxableIncome).toBe(0);
    });

    it('never counts an expense item toward taxableIncome', () => {
      const items: ExpenseIncome[] = [
        { id: 'a', name: 'House', amount: 100_000, year: 2030, kind: 'expense', inflate: false },
      ];
      expect(expenseIncomeAmountsForYear(items, 2030, 1).taxableIncome).toBe(0);
    });

    it('sums taxableIncome across only the taxable income items', () => {
      const items: ExpenseIncome[] = [
        {
          id: 'a',
          name: 'Rental',
          amount: 20_000,
          year: 2030,
          kind: 'income',
          inflate: false,
          taxable: true,
        },
        {
          id: 'b',
          name: 'Inheritance',
          amount: 50_000,
          year: 2030,
          kind: 'income',
          inflate: false,
          taxable: false,
        },
      ];
      const result = expenseIncomeAmountsForYear(items, 2030, 1);
      expect(result.income).toBeCloseTo(70_000, 6);
      expect(result.taxableIncome).toBeCloseTo(20_000, 6);
    });
  });
});
