import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_PRESETS,
  accountEffectiveRate,
  accountFromPreset,
  accountTaxProfile,
  defaultFreeAccount,
  effectiveTaxRate,
  grossFromNet,
  taxOnGross,
  type Account,
} from './account';

const acct = (over: Partial<Account>): Account => ({
  id: 'a',
  name: 'A',
  taxRatePct: 0,
  taxableBasePct: 100,
  ...over,
});

/** Instantiate an account from a named preset (throws if the preset is gone). */
const fromPreset = (name: string): Account => {
  const preset = ACCOUNT_PRESETS.find((p) => p.name === name);
  if (!preset) throw new Error(`preset not found: ${name}`);
  return accountFromPreset(preset);
};

describe('account tax math', () => {
  it('computes the effective tax rate from rate × inclusion', () => {
    expect(effectiveTaxRate({ taxRatePct: 0, taxableBasePct: 0 })).toBe(0); // TFSA
    expect(effectiveTaxRate({ taxRatePct: 40, taxableBasePct: 100 })).toBeCloseTo(0.4); // RRSP
    expect(effectiveTaxRate({ taxRatePct: 40, taxableBasePct: 50 })).toBeCloseTo(0.2); // cap gains
  });

  it('grosses up a net amount to cover tax', () => {
    // To net $1,000 at a 20% effective rate, withdraw $1,250 gross.
    expect(grossFromNet(1000, 0.2)).toBeCloseTo(1250);
    // Tax-free account: gross equals net.
    expect(grossFromNet(1000, 0)).toBe(1000);
  });

  it('computes tax on a gross withdrawal', () => {
    expect(taxOnGross(1250, 0.2)).toBeCloseTo(250);
    expect(grossFromNet(1000, 0.2) - 1000).toBeCloseTo(taxOnGross(grossFromNet(1000, 0.2), 0.2));
  });
});

describe('accountEffectiveRate (residence-driven)', () => {
  it('manual mode keeps the legacy flat rate', () => {
    const a = acct({ taxMode: 'manual', taxRatePct: 17.2, taxableBasePct: 100, kind: 'tax_free' });
    expect(accountEffectiveRate(a, 'FR')).toBeCloseTo(0.172);
  });

  it('tax-free is exempt at home but taxed abroad', () => {
    const peaAtHome = acct({ taxMode: 'auto', kind: 'tax_free', sourceCountry: 'FR' });
    expect(accountEffectiveRate(peaAtHome, 'FR')).toBe(0);
    // Same account, resident in the US: the French exemption is not portable.
    expect(accountEffectiveRate(peaAtHome, 'US')).toBeGreaterThan(0);
  });

  it('deferred is taxed as income at the residence rate', () => {
    const per = acct({ taxMode: 'auto', kind: 'tax_deferred', sourceCountry: 'FR' });
    expect(accountEffectiveRate(per, 'FR')).toBeCloseTo(0.3); // FR income flat
    expect(accountEffectiveRate(per, 'US')).toBeGreaterThan(0); // max(US income, FR withholding)
  });

  it('taxable only taxes the gain fraction', () => {
    const full = acct({ taxMode: 'auto', kind: 'taxable', sourceCountry: 'US', costBasisPct: 0 });
    const halfBasis = acct({
      taxMode: 'auto',
      kind: 'taxable',
      sourceCountry: 'US',
      costBasisPct: 50,
    });
    expect(accountEffectiveRate(halfBasis, 'US')).toBeLessThan(accountEffectiveRate(full, 'US'));
  });
});

describe('accountTaxProfile (progressive decomposition)', () => {
  it('deferred flows fully into ordinary income', () => {
    const p = accountTaxProfile(
      acct({ taxMode: 'auto', kind: 'tax_deferred', sourceCountry: 'FR' }),
      'FR',
    );
    expect(p.incomeCoef).toBe(1);
    expect(p.flatRate).toBe(0);
  });

  it('taxable is a flat capital-gains rate where gains are taxed separately (FR/US)', () => {
    const p = accountTaxProfile(
      acct({ taxMode: 'auto', kind: 'taxable', sourceCountry: 'FR', costBasisPct: 0 }),
      'FR',
    );
    expect(p.incomeCoef).toBe(0);
    expect(p.flatRate).toBeCloseTo(0.314); // PFU 2026 (12.8% + 18.6% social)
  });

  it('Canada includes half the gain in ordinary income', () => {
    const p = accountTaxProfile(
      acct({ taxMode: 'auto', kind: 'taxable', sourceCountry: 'CA', costBasisPct: 0 }),
      'CA',
    );
    expect(p.incomeCoef).toBeCloseTo(0.5);
    expect(p.flatRate).toBe(0);
  });

  it('a reduced home rate overrides the kind (assurance-vie), only at home', () => {
    const av = acct({
      taxMode: 'auto',
      kind: 'taxable',
      sourceCountry: 'FR',
      reducedRatePct: 24.7,
    });
    expect(accountEffectiveRate(av, 'FR')).toBeCloseTo(0.247);
    const p = accountTaxProfile(av, 'FR');
    expect(p.flatRate).toBeCloseTo(0.247);
    expect(p.incomeCoef).toBe(0);
    // Abroad the favourable rate no longer applies → normal taxable treatment.
    expect(accountEffectiveRate(av, 'US')).not.toBeCloseTo(0.247);
  });

  it('manual mode is a flat rate, no progressive income', () => {
    const p = accountTaxProfile(
      acct({ taxMode: 'manual', taxRatePct: 30, taxableBasePct: 100 }),
      'FR',
    );
    expect(p.incomeCoef).toBe(0);
    expect(p.flatRate).toBeCloseTo(0.3);
  });
});

describe('new account envelopes', () => {
  // Checking accounts (compte courant / Checking Account): country-specific,
  // ~0% yield so there is no gain to tax in normal use, and exempt at home even
  // on a forced gain. Unlike a true tax-free wrapper (PEA/TFSA), that exemption
  // does not travel abroad.
  it('checking accounts are exempt at home and have no gain to tax by default', () => {
    for (const [name, home] of [
      ['Compte courant', 'FR'],
      ['Checking Account', 'US'],
    ] as const) {
      const acc = fromPreset(name);
      expect(accountEffectiveRate(acc, home)).toBe(0);
      // No costBasisPct override: natural gain fraction is 0 (costBasisPct 100).
      const p = accountTaxProfile(acc, home);
      expect(p.flatRate).toBe(0);
      expect(p.incomeCoef).toBe(0);
      expect(p.gainsCoef).toBe(0);
    }
  });

  it('checking accounts stay exempt at home even on a forced gain, but not abroad', () => {
    const cash = fromPreset('Compte courant');
    expect(accountEffectiveRate({ ...cash, costBasisPct: 0 }, 'FR')).toBe(0);
    // Abroad, the home-only reducedRatePct no longer applies: a forced gain is taxed.
    expect(accountEffectiveRate({ ...cash, costBasisPct: 0 }, 'US')).toBeGreaterThan(0);
  });

  // 🇫🇷 France
  it('LEP and Livret Jeune are exempt at home, taxed abroad', () => {
    for (const name of ['LEP', 'Livret Jeune']) {
      const a = fromPreset(name);
      expect(accountEffectiveRate(a, 'FR')).toBe(0);
      expect(accountEffectiveRate(a, 'US')).toBeGreaterThan(0);
    }
  });

  it('PERP / Madelin is taxed as ordinary income at home (like the PER)', () => {
    const p = accountTaxProfile(fromPreset('PERP / Madelin'), 'FR');
    expect(p.incomeCoef).toBe(1);
    expect(p.flatRate).toBe(0);
  });

  it('PEL/CEL and term deposits bear the flat PFU on the gain fraction', () => {
    for (const name of ['PEL / CEL', 'Compte à terme']) {
      const p = accountTaxProfile(fromPreset(name), 'FR');
      // costBasisPct 80 → gain fraction 0.2 → 0.314 (PFU 2026) × 0.2.
      expect(p.flatRate).toBeCloseTo(0.314 * 0.2);
      expect(p.incomeCoef).toBe(0);
    }
  });

  it('Contrat de capitalisation mirrors the assurance-vie regime at home', () => {
    const cc = fromPreset('Contrat de capitalisation');
    const av = fromPreset('Assurance-vie');
    expect(accountEffectiveRate(cc, 'FR')).toBeCloseTo(accountEffectiveRate(av, 'FR'));
    // reduced home rate 24.7% applied to the 40% gain fraction (costBasisPct 60).
    expect(accountEffectiveRate(cc, 'FR')).toBeCloseTo(0.247 * 0.4);
    // Abroad the favourable rate no longer applies.
    expect(accountEffectiveRate(cc, 'US')).not.toBeCloseTo(0.247 * 0.4);
  });

  // 🇨🇦 Canada — new registered plans, taxable as income on withdrawal.
  it('LIF/FRV, RESP, RDSP and DPSP are taxed as income at home', () => {
    for (const name of ['LIF / FRV', 'RESP / REEE', 'RDSP / REEI', 'DPSP / RPDB']) {
      const p = accountTaxProfile(fromPreset(name), 'CA');
      expect(p.incomeCoef).toBe(1);
      expect(p.flatRate).toBe(0);
    }
  });

  // 🇺🇸 USA
  it('Traditional IRA, TSP and DB pension are taxed as income at home', () => {
    for (const name of ['Traditional IRA', 'TSP', 'Pension (DB)']) {
      const p = accountTaxProfile(fromPreset(name), 'US');
      expect(p.incomeCoef).toBe(1);
      expect(p.flatRate).toBe(0);
    }
  });

  it('529 Plan and Coverdell ESA are tax-free at home', () => {
    for (const name of ['529 Plan', 'Coverdell ESA']) {
      expect(accountEffectiveRate(fromPreset(name), 'US')).toBe(0);
    }
  });

  it('every preset instantiates in auto mode with a defined kind', () => {
    for (const preset of ACCOUNT_PRESETS) {
      const a = accountFromPreset(preset);
      expect(a.taxMode).toBe('auto');
      expect(a.kind).toBeDefined();
    }
  });
});

describe('defaultFreeAccount', () => {
  it('is a custom tax-free account named "My account"', () => {
    const a = defaultFreeAccount();
    expect(a.name).toBe('My account');
    expect(a.kind).toBe('tax_free');
    expect(a.custom).toBe(true);
    expect(accountEffectiveRate(a, 'US')).toBe(0);
  });
});
