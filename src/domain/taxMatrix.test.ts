import { describe, expect, it } from 'vitest';
import { accountEffectiveRate, accountTaxProfile, type Account, type AccountKind } from './account';
import { accountTaxAtSpending } from './accountTaxRate';
import { taxableOrdinaryIncome } from './tax';
import type { Country } from './country';
import {
  CAPITAL_GAINS_FLAT,
  GAINS_INCLUSION,
  INCOME_TAX_FLAT,
  TAX_FREE_TREATY_RECOGNITION,
  US_LTCG_BRACKETS,
  WITHHOLDING,
} from './taxTables';

const RESIDENCES: Country[] = ['FR', 'US', 'CA'];
const KINDS: AccountKind[] = ['tax_deferred', 'tax_free', 'taxable'];

const acct = (over: Partial<Account>): Account => ({
  id: 'a',
  name: 'Test',
  taxRatePct: 0,
  taxableBasePct: 100,
  taxMode: 'auto',
  kind: 'taxable',
  ...over,
});

// ---------------------------------------------------------------------------
// Headline effective rate (accountEffectiveRate) — the figure shown per account.
// ---------------------------------------------------------------------------
describe('accountEffectiveRate — home accounts, every residence × kind', () => {
  for (const residence of RESIDENCES) {
    describe(`resident in ${residence}`, () => {
      it('tax-deferred is taxed as ordinary income at the residence flat rate', () => {
        const a = acct({ kind: 'tax_deferred', sourceCountry: residence });
        expect(accountEffectiveRate(a, residence)).toBeCloseTo(INCOME_TAX_FLAT[residence], 6);
      });

      it('taxable (no cost basis) is the full capital-gains flat rate', () => {
        const a = acct({ kind: 'taxable', sourceCountry: residence, costBasisPct: 0 });
        expect(accountEffectiveRate(a, residence)).toBeCloseTo(CAPITAL_GAINS_FLAT[residence], 6);
      });

      it('taxable only taxes the gain portion (cost basis scales the rate down)', () => {
        const a = acct({ kind: 'taxable', sourceCountry: residence, costBasisPct: 50 });
        expect(accountEffectiveRate(a, residence)).toBeCloseTo(
          CAPITAL_GAINS_FLAT[residence] * 0.5,
          6,
        );
      });

      it('tax-free is exempt at home (0%)', () => {
        const a = acct({ kind: 'tax_free', sourceCountry: residence });
        expect(accountEffectiveRate(a, residence)).toBe(0);
      });
    });
  }
});

describe('accountEffectiveRate — foreign accounts apply max(residence, withholding)', () => {
  // For each residence, hold the account in each OTHER country and check the
  // credited-withholding rule. Treaty-recognized tax-free wrappers are exempt.
  for (const residence of RESIDENCES) {
    for (const source of RESIDENCES.filter((c) => c !== residence)) {
      for (const kind of KINDS) {
        const recognized = kind === 'tax_free' && TAX_FREE_TREATY_RECOGNITION[source][residence];
        it(`${kind} held in ${source} for a ${residence} resident = ${recognized ? '0 (treaty)' : 'max(residence, withholding)'}`, () => {
          const a = acct({ kind, sourceCountry: source, costBasisPct: 0 });
          if (recognized) {
            expect(accountEffectiveRate(a, residence)).toBe(0);
            return;
          }
          const withholding = WITHHOLDING[source][kind];
          const residenceRate =
            kind === 'tax_deferred' ? INCOME_TAX_FLAT[residence] : CAPITAL_GAINS_FLAT[residence]; // taxable & unrecognized tax-free taxed as a gain
          expect(accountEffectiveRate(a, residence)).toBeCloseTo(
            Math.min(Math.max(residenceRate, withholding), 0.99),
            6,
          );
        });
      }
    }
  }

  it('CA RRSP for a non-resident is withheld at 25% (Part XIII lump-sum)', () => {
    expect(WITHHOLDING.CA.tax_deferred).toBe(0.25);
  });

  it('US Roth stays tax-free for CA and FR residents (treaty recognition)', () => {
    const roth = acct({ kind: 'tax_free', sourceCountry: 'US' });
    expect(accountEffectiveRate(roth, 'CA')).toBe(0);
    expect(accountEffectiveRate(roth, 'FR')).toBe(0);
    const pCA = accountTaxProfile(roth, 'CA');
    expect(pCA).toEqual({ incomeCoef: 0, gainsCoef: 0, flatRate: 0, withholding: 0 });
    expect(accountTaxAtSpending(roth, 'FR', 50_000).effective).toBe(0);
  });

  it('TFSA and PEA are NOT recognized abroad — taxed as a gain by the residence', () => {
    const tfsa = acct({ kind: 'tax_free', sourceCountry: 'CA', costBasisPct: 0 });
    expect(accountEffectiveRate(tfsa, 'US')).toBeGreaterThan(0);
    expect(accountEffectiveRate(tfsa, 'FR')).toBeGreaterThan(0);
    const peaAbroad = acct({ kind: 'tax_free', sourceCountry: 'FR', costBasisPct: 0 });
    expect(accountEffectiveRate(peaAbroad, 'US')).toBeGreaterThan(0);
    expect(accountEffectiveRate(peaAbroad, 'CA')).toBeGreaterThan(0);
  });

  it('withholding binds when it exceeds the residence tax (high cost basis)', () => {
    // US taxable for an FR resident: gain tax ≈ 31.4%×5% = 1.6% < 15% withholding.
    const a = acct({ kind: 'taxable', sourceCountry: 'US', costBasisPct: 95 });
    expect(accountEffectiveRate(a, 'FR')).toBeCloseTo(WITHHOLDING.US.taxable, 6);
  });
});

// ---------------------------------------------------------------------------
// Progressive decomposition (accountTaxProfile) used by the engine.
// ---------------------------------------------------------------------------
describe('accountTaxProfile — decomposition per residence × kind (home)', () => {
  for (const residence of RESIDENCES) {
    describe(`resident in ${residence}`, () => {
      it('deferred flows fully into ordinary income (progressive)', () => {
        const p = accountTaxProfile(
          acct({ kind: 'tax_deferred', sourceCountry: residence }),
          residence,
        );
        expect(p).toEqual({ incomeCoef: 1, gainsCoef: 0, flatRate: 0, withholding: 0 });
      });

      it('tax-free at home owes nothing', () => {
        const p = accountTaxProfile(
          acct({ kind: 'tax_free', sourceCountry: residence }),
          residence,
        );
        expect(p).toEqual({ incomeCoef: 0, gainsCoef: 0, flatRate: 0, withholding: 0 });
      });

      it('taxable uses inclusion (CA), the LTCG ladder (US) or a flat rate (FR)', () => {
        const p = accountTaxProfile(
          acct({ kind: 'taxable', sourceCountry: residence, costBasisPct: 0 }),
          residence,
        );
        if (GAINS_INCLUSION[residence] > 0) {
          // Canada: half the gain is ordinary income, no flat tax.
          expect(p.incomeCoef).toBeCloseTo(GAINS_INCLUSION[residence], 6);
          expect(p.gainsCoef).toBe(0);
          expect(p.flatRate).toBe(0);
        } else if (residence === 'US') {
          // US: the gain enters the progressive LTCG ladder.
          expect(p.incomeCoef).toBe(0);
          expect(p.gainsCoef).toBeCloseTo(1, 6);
          expect(p.flatRate).toBe(0);
        } else {
          // France: flat PFU, no progressive component.
          expect(p.incomeCoef).toBe(0);
          expect(p.gainsCoef).toBe(0);
          expect(p.flatRate).toBeCloseTo(CAPITAL_GAINS_FLAT[residence], 6);
        }
        expect(p.withholding).toBe(0);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// French social charges (prélèvements sociaux) on the gain.
// ---------------------------------------------------------------------------
describe('French social charges apply to the gain (reducedRatePct × gainFraction)', () => {
  const cases: Array<[string, number, number]> = [
    // [name, reducedRatePct, costBasisPct]
    ['PEA (18.6% social, 2026)', 18.6, 60],
    ['PEE/PERCO (17.2% social)', 17.2, 60],
    ['Assurance-vie (24.7% blended)', 24.7, 60],
  ];
  for (const [name, reducedRatePct, costBasisPct] of cases) {
    it(`${name}: rate applies only to the gain portion`, () => {
      const a = acct({ kind: 'tax_free', sourceCountry: 'FR', reducedRatePct, costBasisPct });
      const gainFraction = 1 - costBasisPct / 100;
      expect(accountEffectiveRate(a, 'FR')).toBeCloseTo((reducedRatePct / 100) * gainFraction, 6);
      const p = accountTaxProfile(a, 'FR');
      expect(p.flatRate).toBeCloseTo((reducedRatePct / 100) * gainFraction, 6);
      expect(p.incomeCoef).toBe(0);
    });
  }

  it('a reduced home rate is NOT applied abroad (privilege not portable)', () => {
    const pea = acct({
      kind: 'tax_free',
      sourceCountry: 'FR',
      reducedRatePct: 18.6,
      costBasisPct: 60,
    });
    const home = accountEffectiveRate(pea, 'FR');
    const abroad = accountEffectiveRate(pea, 'US');
    expect(abroad).not.toBeCloseTo(home, 4);
  });
});

// ---------------------------------------------------------------------------
// Engine-faithful progressive brackets (accountTaxAtSpending), per residence.
// ---------------------------------------------------------------------------
describe('accountTaxAtSpending — progressive brackets depend on the withdrawal level', () => {
  for (const residence of RESIDENCES) {
    it(`${residence} deferred: effective rate rises with the amount withdrawn`, () => {
      const a = acct({ kind: 'tax_deferred', sourceCountry: residence });
      const low = accountTaxAtSpending(a, residence, 20_000);
      const high = accountTaxAtSpending(a, residence, 250_000);
      expect(low.progressive).toBe(true);
      expect(high.effective).toBeGreaterThan(low.effective);
      // Bracket slices reconcile with the income exposed to the schedule (after
      // the FR pension allowance; identity elsewhere) and with the tax owed.
      const sliceSum = high.brackets.reduce((s, b) => s + b.amount, 0);
      const taxSum = high.brackets.reduce((s, b) => s + b.tax, 0);
      expect(sliceSum).toBeCloseTo(taxableOrdinaryIncome(high.ordinaryIncome, residence), 1);
      expect(taxSum).toBeCloseTo(high.tax, 1);
      // net = gross − tax holds.
      expect(high.gross - high.tax).toBeCloseTo(high.net, 1);
    });
  }

  it('Canada taxable is progressive via the 50% inclusion; France is flat', () => {
    const ca = accountTaxAtSpending(
      acct({ kind: 'taxable', sourceCountry: 'CA', costBasisPct: 0 }),
      'CA',
      120_000,
    );
    expect(ca.progressive).toBe(true);
    expect(ca.brackets.length).toBeGreaterThan(0);

    const fr = accountTaxAtSpending(
      acct({ kind: 'taxable', sourceCountry: 'FR', costBasisPct: 0 }),
      'FR',
      120_000,
    );
    expect(fr.progressive).toBe(false);
    expect(fr.effective).toBeCloseTo(CAPITAL_GAINS_FLAT.FR, 6);
  });

  it('US taxable is progressive via the LTCG ladder (0% band, then 15%)', () => {
    const a = acct({ kind: 'taxable', sourceCountry: 'US', costBasisPct: 0 });
    // Small withdrawal: all gains fit in the 0% band → no tax at all.
    const small = accountTaxAtSpending(a, 'US', 30_000);
    expect(small.effective).toBeCloseTo(0, 6);
    expect(small.ltcgBrackets.length).toBeGreaterThan(0);
    // Large withdrawal: gains spill into the 15% band → effective between 0 and 15%.
    const large = accountTaxAtSpending(a, 'US', 120_000);
    expect(large.progressive).toBe(true);
    expect(large.effective).toBeGreaterThan(0);
    expect(large.effective).toBeLessThan(0.15);
    // Ladder slices reconcile: gains income and total tax (no NIIT at this level).
    const sliceSum = large.ltcgBrackets.reduce((s, b) => s + b.amount, 0);
    const taxSum = large.ltcgBrackets.reduce((s, b) => s + b.tax, 0);
    expect(sliceSum).toBeCloseTo(large.gainsIncome, 1);
    expect(taxSum + large.niitTax).toBeCloseTo(large.tax, 1);
    expect(large.gross - large.tax).toBeCloseTo(large.net, 1);
    // Hand-check: the 0% band ends at zeroCap (49,450 official + the 16,100
    // standard deduction); solve g − 0.15·(g − zeroCap) = 120,000.
    const zeroCap = US_LTCG_BRACKETS[0]!.upTo;
    expect(large.gross).toBeCloseTo((120_000 - 0.15 * zeroCap) / 0.85, 0);
  });

  it('US taxable: NIIT (3.8%) kicks in above the 200k MAGI threshold', () => {
    const a = acct({ kind: 'taxable', sourceCountry: 'US', costBasisPct: 0 });
    const big = accountTaxAtSpending(a, 'US', 400_000);
    expect(big.niitTax).toBeGreaterThan(0);
    expect(big.gainsIncome).toBeGreaterThan(US_LTCG_BRACKETS[0]!.upTo);
  });

  it('matches the headline rate for the FR flat regime', () => {
    const a = acct({ kind: 'taxable', sourceCountry: 'FR', costBasisPct: 40 });
    const headline = accountEffectiveRate(a, 'FR');
    const atSpend = accountTaxAtSpending(a, 'FR', 80_000).effective;
    expect(atSpend).toBeCloseTo(headline, 6);
  });
});

// ---------------------------------------------------------------------------
// Dynamic (live) gain-fraction override — used by the engine each year and by
// the per-account card. Must scale the capital-gains tax for EVERY account type
// that taxes the gain, and be ignored where gain is irrelevant.
// ---------------------------------------------------------------------------
describe('live gain-fraction override scales the tax for every account type', () => {
  it('FR taxable (CTO / custom): effective = CG rate × live gain', () => {
    const a = acct({ kind: 'taxable', sourceCountry: 'FR', costBasisPct: 0 });
    expect(accountTaxAtSpending(a, 'FR', 50_000, 1.0).effective).toBeCloseTo(
      CAPITAL_GAINS_FLAT.FR,
      6,
    );
    expect(accountTaxAtSpending(a, 'FR', 50_000, 0.5).effective).toBeCloseTo(
      CAPITAL_GAINS_FLAT.FR * 0.5,
      6,
    );
  });

  it('US taxable (brokerage): a lower live gain lowers the LTCG tax', () => {
    const a = acct({ kind: 'taxable', sourceCountry: 'US', costBasisPct: 0 });
    const full = accountTaxAtSpending(a, 'US', 120_000, 1.0);
    const half = accountTaxAtSpending(a, 'US', 120_000, 0.5);
    expect(half.effective).toBeLessThan(full.effective);
    // With gain 0.5, gains ≈ 60k−ish still fit closer to the 0% band → tiny tax.
    expect(half.gainsIncome).toBeCloseTo(half.gross * 0.5, 1);
  });

  it('Canada taxable (50% inclusion): effective rises with the live gain', () => {
    const a = acct({ kind: 'taxable', sourceCountry: 'CA', costBasisPct: 0 });
    const low = accountTaxAtSpending(a, 'CA', 80_000, 0.3).effective;
    const high = accountTaxAtSpending(a, 'CA', 80_000, 0.9).effective;
    expect(high).toBeGreaterThan(low);
  });

  // French envelopes with social charges / reduced rate scale on the live gain.
  const frEnvelopes: Array<[string, number]> = [
    ['PEA / PEA-PME', 18.6],
    ['PEE / PERCO', 17.2],
    ['Assurance-vie', 24.7],
  ];
  for (const [name, reducedRatePct] of frEnvelopes) {
    it(`${name}: rate × live gain (not the static cost-basis share)`, () => {
      const a = acct({ kind: 'tax_free', sourceCountry: 'FR', reducedRatePct, costBasisPct: 60 });
      expect(accountTaxAtSpending(a, 'FR', 50_000, 0.5).effective).toBeCloseTo(
        (reducedRatePct / 100) * 0.5,
        6,
      );
      expect(accountTaxAtSpending(a, 'FR', 50_000, 1.0).effective).toBeCloseTo(
        reducedRatePct / 100,
        6,
      );
    });
  }

  it('tax-free abroad: taxed as a gain by residence, scales with the live gain', () => {
    // 120k spend: the full-gain draw spills past the LTCG 0% band (65,550 with
    // the deduction) while the half-gain draw stays inside it.
    const pea = acct({ kind: 'tax_free', sourceCountry: 'FR', costBasisPct: 0 });
    const half = accountTaxAtSpending(pea, 'US', 120_000, 0.5).effective;
    const full = accountTaxAtSpending(pea, 'US', 120_000, 1.0).effective;
    expect(full).toBeGreaterThan(half);
  });

  it('tax-deferred ignores the gain fraction (taxed as ordinary income)', () => {
    for (const residence of RESIDENCES) {
      const a = acct({ kind: 'tax_deferred', sourceCountry: residence });
      const lo = accountTaxAtSpending(a, residence, 50_000, 0.1).effective;
      const hi = accountTaxAtSpending(a, residence, 50_000, 0.9).effective;
      expect(hi).toBeCloseTo(lo, 6);
    }
  });

  it('tax-free at home stays exempt regardless of the gain', () => {
    const a = acct({ kind: 'tax_free', sourceCountry: 'FR' });
    expect(accountTaxAtSpending(a, 'FR', 50_000, 0.9).effective).toBe(0);
  });

  it('manual mode ignores the gain fraction (uses the typed rate × base)', () => {
    const a = acct({ taxMode: 'manual', taxRatePct: 30, taxableBasePct: 100, kind: 'taxable' });
    const lo = accountTaxAtSpending(a, 'FR', 50_000, 0.2).effective;
    const hi = accountTaxAtSpending(a, 'FR', 50_000, 0.9).effective;
    expect(lo).toBeCloseTo(0.3, 6);
    expect(hi).toBeCloseTo(0.3, 6);
  });
});
