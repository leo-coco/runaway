import { describe, expect, it } from 'vitest';
import { bracketsFor, capitalGainsTax, incomeTax } from './tax';
import { CA_PROVINCES_TABLES, US_LTCG_BRACKETS, US_NIIT, combineBrackets } from './taxTables';

describe('incomeTax (progressive brackets)', () => {
  it('is zero below the first taxable threshold (FR)', () => {
    expect(incomeTax(0, 'FR')).toBe(0);
    expect(incomeTax(10_000, 'FR')).toBe(0); // under the 11,600€ 0% band (2026)
  });

  it('applies brackets progressively (FR)', () => {
    // 11% on the slice 11,600 → 20,000 (2026 barème).
    expect(incomeTax(20_000, 'FR')).toBeCloseTo(0.11 * (20_000 - 11_600), 0);
  });

  it('the effective rate rises with income', () => {
    const eff = (income: number, c: 'FR' | 'US' | 'CA') => incomeTax(income, c) / income;
    expect(eff(150_000, 'FR')).toBeGreaterThan(eff(40_000, 'FR'));
    expect(eff(300_000, 'US')).toBeGreaterThan(eff(50_000, 'US'));
    expect(eff(200_000, 'CA')).toBeGreaterThan(eff(60_000, 'CA'));
  });

  it('inflating the thresholds lowers the tax on a fixed nominal income', () => {
    // Same nominal income, but brackets pushed up 50% → less tax.
    expect(incomeTax(100_000, 'FR', 1.5)).toBeLessThan(incomeTax(100_000, 'FR', 1));
  });

  it('US 2026 first bracket: 10% up to 12,400', () => {
    expect(incomeTax(12_400, 'US')).toBeCloseTo(1_240, 5);
    expect(incomeTax(20_000, 'US')).toBeCloseTo(1_240 + 0.12 * (20_000 - 12_400), 5);
  });
});

describe('province selection (Canada)', () => {
  it('omitted province falls back to Ontario', () => {
    expect(incomeTax(80_000, 'CA')).toBeCloseTo(incomeTax(80_000, 'CA', 1, 'ON'), 8);
    expect(bracketsFor('CA')).toBe(CA_PROVINCES_TABLES.ON.brackets);
  });

  it('province is ignored outside Canada', () => {
    expect(incomeTax(80_000, 'FR', 1, 'QC')).toBeCloseTo(incomeTax(80_000, 'FR'), 8);
  });

  it('Alberta taxes less than Québec at the same income', () => {
    expect(incomeTax(120_000, 'CA', 1, 'AB')).toBeLessThan(incomeTax(120_000, 'CA', 1, 'QC'));
  });

  it('ON combined first marginal rate = federal 14% + provincial 5.05%', () => {
    const first = CA_PROVINCES_TABLES.ON.brackets[0]!;
    expect(first.rate).toBeCloseTo(0.14 + 0.0505, 10);
  });

  it('QC applies the 16.5% federal abatement', () => {
    const first = CA_PROVINCES_TABLES.QC.brackets[0]!;
    expect(first.rate).toBeCloseTo(0.14 * 0.835 + 0.14, 10);
  });

  it('OTHER aliases the representative Ontario schedule', () => {
    expect(CA_PROVINCES_TABLES.OTHER.brackets).toBe(CA_PROVINCES_TABLES.ON.brackets);
  });
});

describe('combineBrackets', () => {
  it('sums marginal rates on the union of thresholds', () => {
    const a = [
      { upTo: 100, rate: 0.1 },
      { upTo: Infinity, rate: 0.2 },
    ];
    const b = [
      { upTo: 50, rate: 0.05 },
      { upTo: Infinity, rate: 0.15 },
    ];
    const combined = combineBrackets(a, b);
    expect(combined.map((x) => x.upTo)).toEqual([50, 100, Infinity]);
    expect(combined[0]!.rate).toBeCloseTo(0.15, 10);
    expect(combined[1]!.rate).toBeCloseTo(0.25, 10);
    expect(combined[2]!.rate).toBeCloseTo(0.35, 10);
  });
});

describe('capitalGainsTax (US progressive LTCG + NIIT)', () => {
  it('0% band: small gains on low ordinary income are untaxed', () => {
    expect(capitalGainsTax(20_000, 0, 'US')).toBe(0);
    expect(capitalGainsTax(US_LTCG_BRACKETS[0]!.upTo, 0, 'US')).toBe(0);
  });

  it('gains stack on top of ordinary income', () => {
    // With 60k ordinary income the 0% band is already filled → 15% on the gain.
    expect(capitalGainsTax(10_000, 60_000, 'US')).toBeCloseTo(1_500, 5);
  });

  it('a gain straddling the 0%/15% threshold is taxed only on the excess', () => {
    const zeroCap = US_LTCG_BRACKETS[0]!.upTo; // 49,450
    expect(capitalGainsTax(zeroCap + 10_000, 0, 'US')).toBeCloseTo(0.15 * 10_000, 5);
  });

  it('20% bracket applies above the top threshold', () => {
    const topCap = US_LTCG_BRACKETS[1]!.upTo; // 545,500
    const tax = capitalGainsTax(10_000, topCap, 'US');
    // Full slice at 20% + NIIT 3.8% (income far above the 200k MAGI threshold).
    expect(tax).toBeCloseTo(10_000 * (0.2 + US_NIIT.rate), 5);
  });

  it('NIIT: 3.8% on investment income above the 200k MAGI threshold', () => {
    // ord 195k + 10k gains → 5k above threshold → NIIT on 5k; LTCG 15% on all 10k.
    const tax = capitalGainsTax(10_000, 195_000, 'US');
    expect(tax).toBeCloseTo(0.15 * 10_000 + US_NIIT.rate * 5_000, 5);
  });

  it('NIIT threshold is NOT inflation-indexed while LTCG thresholds are', () => {
    // Inflating thresholds ×2 doubles the 0% band (less LTCG) but the NIIT
    // threshold must stay at 200k nominal.
    const infl = 2;
    const gains = 30_000;
    const ord = 190_000;
    const tax = capitalGainsTax(gains, ord, 'US', infl);
    // LTCG: 0% band now 98,900 → fully covers... ord+gains=220k > 98,900, so
    // gains sit in the 15% band (ord already fills the 0% band).
    const ltcg = 0.15 * gains;
    const niit =
      US_NIIT.rate *
      (ord + gains - US_NIIT.threshold > gains ? gains : ord + gains - US_NIIT.threshold);
    expect(tax).toBeCloseTo(ltcg + niit, 5);
  });

  it('is monotonic in gains and in ordinary income', () => {
    expect(capitalGainsTax(50_000, 40_000, 'US')).toBeGreaterThan(
      capitalGainsTax(40_000, 40_000, 'US'),
    );
    expect(capitalGainsTax(50_000, 100_000, 'US')).toBeGreaterThanOrEqual(
      capitalGainsTax(50_000, 40_000, 'US'),
    );
  });

  it('non-US falls back to the flat representative rate', () => {
    expect(capitalGainsTax(10_000, 50_000, 'FR')).toBeCloseTo(10_000 * 0.314, 5);
  });
});
