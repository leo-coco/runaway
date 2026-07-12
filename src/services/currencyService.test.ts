import { describe, expect, it } from 'vitest';
import { convert, convertOr, type RatesTable } from './currencyService';

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

  it('convertOr falls back to the raw amount on failure', () => {
    expect(convertOr(100, 'USD', 'JPY', table)).toBe(100);
  });
});
