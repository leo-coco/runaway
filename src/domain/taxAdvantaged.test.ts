import { describe, expect, it } from 'vitest';
import {
  applyForcedFlows,
  rmdFraction,
  type ConversionPlan,
  type FlowAsset,
} from './taxAdvantaged';
import type { AccountKind } from './account';

describe('rmdFraction', () => {
  it('is zero before the start age and for France', () => {
    expect(rmdFraction('US', 72)).toBe(0);
    expect(rmdFraction('CA', 71)).toBe(0);
    expect(rmdFraction('FR', 90)).toBe(0);
  });

  it('US uses the Uniform Lifetime divisor (1/divisor) and rises with age', () => {
    expect(rmdFraction('US', 73)).toBeCloseTo(1 / 26.5, 6);
    expect(rmdFraction('US', 90)).toBeCloseTo(1 / 12.2, 6);
    expect(rmdFraction('US', 90)).toBeGreaterThan(rmdFraction('US', 73));
  });

  it('Canada uses the RRIF factor from age 72 and rises with age', () => {
    expect(rmdFraction('CA', 72)).toBeCloseTo(0.054, 6);
    expect(rmdFraction('CA', 95)).toBeCloseTo(0.2, 6);
    expect(rmdFraction('CA', 95)).toBeGreaterThan(rmdFraction('CA', 72));
  });

  it('holds the top value past the end of the table', () => {
    expect(rmdFraction('CA', 110)).toBeCloseTo(0.2, 6);
    expect(rmdFraction('US', 130)).toBeCloseTo(1 / 3.5, 6);
  });
});

describe('applyForcedFlows', () => {
  const kinds: Record<string, AccountKind> = { rrsp: 'tax_deferred', roth: 'tax_free' };
  const kindOf = (id: string | null) => (id ? kinds[id] : undefined);

  const make = (): FlowAsset[] => [
    { value: 500_000, accountId: 'rrsp' },
    { value: 100_000, accountId: 'roth' },
  ];

  const conv: ConversionPlan = {
    id: 'c',
    fromAccountId: 'rrsp',
    toAccountId: 'roth',
    annualAmount: 30_000,
    startAge: 65,
    endAge: 70,
  };

  it('does nothing when age is unknown', () => {
    const a = make();
    const r = applyForcedFlows(a, kindOf, {
      residence: 'US',
      age: null,
      rmdEnabled: true,
      conversions: [conv],
      inflationFactor: 1,
    });
    expect(r).toEqual({ conversionIncome: 0, rmdGross: 0 });
    expect(a[0]!.value).toBe(500_000);
  });

  it('moves the conversion amount from deferred to tax-free, taxed as income', () => {
    const a = make();
    const r = applyForcedFlows(a, kindOf, {
      residence: 'US',
      age: 67,
      rmdEnabled: false,
      conversions: [conv],
      inflationFactor: 1,
    });
    expect(r.conversionIncome).toBeCloseTo(30_000, 6);
    expect(a[0]!.value).toBeCloseTo(470_000, 6); // rrsp down
    expect(a[1]!.value).toBeCloseTo(130_000, 6); // roth up
    // Conservation of principal (tax is settled by the engine, not here).
    expect(a[0]!.value + a[1]!.value).toBeCloseTo(600_000, 6);
  });

  it('inflates the conversion amount', () => {
    const a = make();
    const r = applyForcedFlows(a, kindOf, {
      residence: 'US',
      age: 67,
      rmdEnabled: false,
      conversions: [conv],
      inflationFactor: 1.5,
    });
    expect(r.conversionIncome).toBeCloseTo(45_000, 6);
  });

  it('caps the conversion at the available deferred balance', () => {
    const a: FlowAsset[] = [
      { value: 20_000, accountId: 'rrsp' },
      { value: 0, accountId: 'roth' },
    ];
    const r = applyForcedFlows(a, kindOf, {
      residence: 'US',
      age: 67,
      rmdEnabled: false,
      conversions: [conv],
      inflationFactor: 1,
    });
    expect(r.conversionIncome).toBeCloseTo(20_000, 6);
    expect(a[0]!.value).toBeCloseTo(0, 6);
  });

  it('forces an RMD from the deferred balance at the right fraction', () => {
    const a = make(); // rrsp 500k
    const r = applyForcedFlows(a, kindOf, {
      residence: 'US',
      age: 73,
      rmdEnabled: true,
      conversions: [],
      inflationFactor: 1,
    });
    const expected = 500_000 / 26.5;
    expect(r.rmdGross).toBeCloseTo(expected, 4);
    expect(a[0]!.value).toBeCloseTo(500_000 - expected, 4);
    expect(a[1]!.value).toBe(100_000); // tax-free untouched
  });

  it('applies conversions before the RMD (lower deferred balance → lower RMD)', () => {
    const a = make();
    const r = applyForcedFlows(a, kindOf, {
      residence: 'US',
      age: 73,
      rmdEnabled: true,
      conversions: [{ ...conv, startAge: 70, endAge: 80 }],
      inflationFactor: 1,
    });
    // Conversion moves 30k out first; RMD is on the remaining 470k.
    expect(r.conversionIncome).toBeCloseTo(30_000, 6);
    expect(r.rmdGross).toBeCloseTo(470_000 / 26.5, 4);
  });

  it('no RMD when disabled or below start age', () => {
    const a = make();
    const r = applyForcedFlows(a, kindOf, {
      residence: 'US',
      age: 70,
      rmdEnabled: true,
      conversions: [],
      inflationFactor: 1,
    });
    expect(r.rmdGross).toBe(0);
    expect(a[0]!.value).toBe(500_000);
  });
});
