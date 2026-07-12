import { describe, expect, it } from 'vitest';
import { explainEffectiveRate } from './taxExplain';
import { type Account } from './account';

const base = (over: Partial<Account>): Account => ({
  id: 'a1',
  name: 'Test',
  kind: 'taxable',
  taxRatePct: 0,
  taxableBasePct: 100,
  taxMode: 'auto',
  ...over,
});

const SPEND = 80_000;
const keys = (a: Account, residence: 'FR' | 'US' | 'CA') =>
  explainEffectiveRate(a, residence, SPEND).steps.map((s) => s.key);

describe('explainEffectiveRate', () => {
  it('manual mode yields a single manual step', () => {
    const a = base({ taxMode: 'manual', taxRatePct: 30, taxableBasePct: 80 });
    expect(keys(a, 'FR')).toEqual(['manual']);
    expect(explainEffectiveRate(a, 'FR', SPEND).effectivePct).toBeCloseTo(24, 6); // 30% × 80%
  });

  it('a home tax-deferred account is progressive (bracket table, no flat final)', () => {
    const a = base({ kind: 'tax_deferred', sourceCountry: 'FR' });
    const exp = explainEffectiveRate(a, 'FR', SPEND);
    expect(exp.steps.map((s) => s.key)).toEqual(['context', 'deferredIntro']);
    expect(exp.calc).toBeDefined();
    expect(exp.calc!.brackets.length).toBeGreaterThan(0);
  });

  it('a home taxable account (FR) is flat: gain portion then capital-gains', () => {
    const a = base({ kind: 'taxable', sourceCountry: 'FR', costBasisPct: 60 });
    expect(keys(a, 'FR')).toEqual([
      'context',
      'gainPortion',
      'dynamicBasis',
      'capitalGains',
      'final',
    ]);
    expect(explainEffectiveRate(a, 'FR', SPEND).calc).toBeUndefined();
  });

  it('a Canadian taxable account is progressive via 50% inclusion', () => {
    const a = base({ kind: 'taxable', sourceCountry: 'CA', costBasisPct: 60 });
    const exp = explainEffectiveRate(a, 'CA', SPEND);
    expect(exp.steps.map((s) => s.key)).toEqual([
      'context',
      'gainPortion',
      'dynamicBasis',
      'gainInclusion',
    ]);
    expect(exp.calc).toBeDefined();
  });

  it('a US taxable account explains the LTCG ladder and includes the ladder table', () => {
    const a = base({ kind: 'taxable', sourceCountry: 'US', costBasisPct: 60 });
    const exp = explainEffectiveRate(a, 'US', SPEND);
    expect(exp.steps.map((s) => s.key)).toEqual([
      'context',
      'gainPortion',
      'dynamicBasis',
      'ltcgIntro',
    ]);
    expect(exp.calc).toBeDefined();
    expect(exp.calc!.ltcgBrackets.length).toBeGreaterThan(0);
    expect(exp.calc!.niitTax).toBe(0); // 80k spend is far below the NIIT threshold
  });

  it('a US Roth held by a FR resident is exempt via treaty', () => {
    const roth = base({ kind: 'tax_free', sourceCountry: 'US' });
    const exp = explainEffectiveRate(roth, 'FR', SPEND);
    expect(exp.steps.map((s) => s.key)).toEqual(['context', 'freeTreaty']);
    expect(exp.effectivePct).toBe(0);
  });

  it('a foreign deferred account credits withholding when residence tax is higher', () => {
    const a = base({ kind: 'tax_deferred', sourceCountry: 'US' });
    expect(keys(a, 'FR')).toEqual(['context', 'deferredIntro', 'withholdingCredited']);
  });

  it('a home special-rate account (assurance-vie) taxes the reduced rate on the gain', () => {
    const a = base({
      kind: 'taxable',
      sourceCountry: 'FR',
      costBasisPct: 60,
      reducedRatePct: 24.7,
    });
    expect(keys(a, 'FR')).toEqual(['context', 'reduced']);
    // 24.7% applied to the 40% gain (60% cost basis) → 9.88%.
    expect(explainEffectiveRate(a, 'FR', SPEND).effectivePct).toBeCloseTo(9.9, 1);
  });

  it('a PEA bears social charges (18.6%) on the gain, not 0%', () => {
    const pea = base({
      kind: 'tax_free',
      sourceCountry: 'FR',
      costBasisPct: 60,
      reducedRatePct: 18.6,
    });
    // 18.6% × 40% gain ≈ 7.4% — no longer tax-free.
    expect(explainEffectiveRate(pea, 'FR', SPEND).effectivePct).toBeCloseTo(7.4, 1);
  });

  it('uses the live gain-fraction override instead of the static cost basis', () => {
    const pea = base({
      kind: 'tax_free',
      sourceCountry: 'FR',
      reducedRatePct: 18.6,
      costBasisPct: 60,
    });
    const staticExp = explainEffectiveRate(pea, 'FR', SPEND); // 40% gain → 18.6%×0.4 ≈ 7.4%
    const liveExp = explainEffectiveRate(pea, 'FR', SPEND, 0.75); // 75% gain → 18.6%×0.75 ≈ 14%
    expect(staticExp.effectivePct).toBeCloseTo(7.4, 1);
    expect(liveExp.effectivePct).toBeGreaterThan(staticExp.effectivePct);
    expect(liveExp.effectivePct).toBeCloseTo(14, 1);
  });

  it('a home tax-free account is exempt (0%)', () => {
    const a = base({ kind: 'tax_free', sourceCountry: 'FR' });
    expect(keys(a, 'FR')).toEqual(['context', 'freeHome', 'final']);
    expect(explainEffectiveRate(a, 'FR', SPEND).effectivePct).toBe(0);
  });
});
