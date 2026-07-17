import { describe, expect, it } from 'vitest';
import { bracketsFor, capitalGainsTax, incomeTax } from './tax';
import { CA_PROVINCES_TABLES, US_LTCG_BRACKETS, US_NIIT, combineBrackets } from './taxTables';

describe('incomeTax (progressive brackets)', () => {
  it('is zero below the first taxable threshold (FR)', () => {
    expect(incomeTax(0, 'FR')).toBe(0);
    expect(incomeTax(10_000, 'FR')).toBe(0); // under the 11,600€ 0% band (2026)
  });

  it('applies brackets progressively (FR), after the 10% pension allowance', () => {
    // Allowance 10% of 20,000 = 2,000 → taxable 18,000; 11% above 11,600.
    expect(incomeTax(20_000, 'FR')).toBeCloseTo(0.11 * (18_000 - 11_600), 0);
  });

  it('FR: the 10% allowance shows in the marginal rate, and its cap restores it', () => {
    // In the 10% zone the marginal rate is 0.9 × bracket rate (each extra euro
    // only adds 0.90€ of taxable income)…
    const marginalLow = incomeTax(20_001, 'FR') - incomeTax(20_000, 'FR');
    expect(marginalLow).toBeCloseTo(0.9 * 0.11, 4);
    // …but once the allowance is capped (income > 44,390) the full bracket
    // rate applies again.
    const marginalHigh = incomeTax(200_001, 'FR') - incomeTax(200_000, 'FR');
    expect(marginalHigh).toBeCloseTo(0.45, 4);
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

  it('US 2026: standard deduction (16,100), then 10% up to 12,400 of taxable', () => {
    expect(incomeTax(16_100, 'US')).toBe(0); // fully absorbed by the deduction
    expect(incomeTax(16_100 + 12_400, 'US')).toBeCloseTo(1_240, 5);
    expect(incomeTax(36_100, 'US')).toBeCloseTo(1_240 + 0.12 * (36_100 - 16_100 - 12_400), 5);
  });

  it('CA: basic personal amounts form a 0% band at the bottom', () => {
    expect(incomeTax(12_989, 'CA', 1, 'ON')).toBe(0); // under both BPAs
    // Between the ON BPA (12,989) and the federal BPA (16,452) only the
    // provincial 5.05% applies.
    expect(incomeTax(16_452, 'CA', 1, 'ON')).toBeCloseTo(0.0505 * (16_452 - 12_989), 4);
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

  it('ON combined: BPA 0% bands first, then federal 14% + provincial 5.05%', () => {
    const on = CA_PROVINCES_TABLES.ON.brackets;
    expect(on[0]).toEqual({ upTo: 12_989, rate: 0 }); // ON BPA
    expect(on[1]!.upTo).toBe(16_452); // federal BPA band: provincial rate only
    expect(on[1]!.rate).toBeCloseTo(0.0505, 10);
    expect(on[2]!.rate).toBeCloseTo(0.14 + 0.0505, 10);
  });

  it('QC applies the 16.5% federal abatement above both BPA bands', () => {
    const qc = CA_PROVINCES_TABLES.QC.brackets;
    // 0 → fed BPA 16,452 → QC BPA 18,952 → first fully-taxed segment.
    expect(qc[0]!.rate).toBe(0);
    expect(qc[2]!.rate).toBeCloseTo(0.14 * 0.835 + 0.14, 10);
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
    // With 100k ordinary income the 0% band (65,550 on the gross scale, i.e.
    // 49,450 official + the 16,100 standard deduction) is filled → 15% on the gain.
    expect(capitalGainsTax(10_000, 100_000, 'US')).toBeCloseTo(1_500, 5);
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
