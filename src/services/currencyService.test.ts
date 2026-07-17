import { describe, expect, it } from 'vitest';
import {
  bracketFxFactor,
  convert,
  convertChecked,
  missingRates,
  type RatesTable,
} from './currencyService';

const table: RatesTable = {
  base: 'USD',
  rates: { USD: 1, CAD: 1.35, EUR: 0.9 },
  asOf: 0,
};

describe('currencyService.convert', () => {
  it('returns the same amount for identical currencies', () => {
    const r = convert(100, 'USD', 'USD', table);
    expect(r.ok && r.value).toBe(100);
  });

  it('converts from base to a quoted currency', () => {
    const r = convert(100, 'USD', 'CAD', table);
    expect(r.ok && Math.round(r.value)).toBe(135);
  });

  it('converts between two non-base currencies', () => {
    const r = convert(135, 'CAD', 'EUR', table);
    // 135 CAD -> 100 USD -> 90 EUR
    expect(r.ok && Math.round(r.value)).toBe(90);
  });

  it('errors on an unknown currency', () => {
    const r = convert(100, 'USD', 'JPY', table);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not_found');
  });

  it('convertChecked throws rather than returning an unconverted amount', () => {
    expect(convertChecked(100, 'USD', 'CAD', table)).toBeCloseTo(135, 6);
    // Returning the raw 100 here would read as a real CAD figure. Callers sit
    // behind the missingRates guard, so this can only be a broken invariant.
    expect(() => convertChecked(100, 'USD', 'JPY', table)).toThrow();
  });
});

describe('missingRates', () => {
  it('is empty when the table covers every currency', () => {
    expect(missingRates(['USD', 'CAD', 'EUR'], 'USD', table)).toEqual([]);
  });

  it('reports only the uncovered currencies, without duplicates', () => {
    expect(missingRates(['USD', 'JPY', 'CAD', 'JPY'], 'USD', table)).toEqual(['JPY']);
  });

  it('checks convertibility into the plan currency, not just presence', () => {
    const zero: RatesTable = { base: 'USD', rates: { USD: 1, CAD: 0 }, asOf: 0 };
    expect(missingRates(['CAD'], 'USD', zero)).toEqual(['CAD']);
  });
});

describe('bracketFxFactor', () => {
  it('is 1 when the plan currency matches the residence currency', () => {
    expect(bracketFxFactor('US', 'USD', table)).toBe(1);
  });

  it('converts one residence-currency unit into plan currency', () => {
    // 1 EUR = 1/0.9 USD ≈ 1.111 — a French resident with a USD plan needs the
    // EUR bracket thresholds scaled up by that factor.
    expect(bracketFxFactor('FR', 'USD', table)).toBeCloseTo(1 / 0.9, 6);
    // 1 USD = 1.35 CAD.
    expect(bracketFxFactor('US', 'CAD', table)).toBeCloseTo(1.35, 6);
  });

  it('defaults to 1 without a rates table (legacy behaviour)', () => {
    expect(bracketFxFactor('FR', 'USD', undefined)).toBe(1);
  });
});
