import { describe, it, expect } from 'vitest';
import {
  BROAD_MARKET_CAGR_DEFAULT,
  accountsForDraft,
  annualSpendingFrom,
  broadMarketHolding,
  equityClassFor,
  retirementYearFromAges,
} from './quickStartPlan';
import { ACCOUNT_PRESETS } from '@/domain/account';

describe('retirementYearFromAges', () => {
  it('adds the years to retirement to the current calendar year', () => {
    const year = new Date().getFullYear();
    expect(retirementYearFromAges(40, 60)).toBe(year + 20);
  });

  it('never goes backward when already past the retirement age', () => {
    const year = new Date().getFullYear();
    expect(retirementYearFromAges(70, 65)).toBe(year);
  });
});

describe('annualSpendingFrom', () => {
  it('annualizes a monthly amount', () => {
    expect(annualSpendingFrom(2500, 'monthly')).toBe(30_000);
  });
  it('passes a yearly amount through', () => {
    expect(annualSpendingFrom(48_000, 'yearly')).toBe(48_000);
  });
  it('never returns a negative amount', () => {
    expect(annualSpendingFrom(-100, 'monthly')).toBe(0);
  });
});

describe('equityClassFor', () => {
  it('maps residence to a broad-equity class', () => {
    expect(equityClassFor('CA')).toBe('ca_equity');
    expect(equityClassFor('FR')).toBe('eu_equity');
    expect(equityClassFor('US')).toBe('us_equity');
  });
});

describe('broadMarketHolding', () => {
  it('carries the whole amount in price with quantity 1 and a default CAGR', () => {
    const h = broadMarketHolding('US', 'USD', 75_000, 500, 'acc-1', 'Diversified');
    expect(h.quantity).toBe(1);
    expect(h.pricePerUnit).toBe(75_000);
    expect(h.monthlyContribution).toBe(500);
    expect(h.expectedCagrPct).toBe(BROAD_MARKET_CAGR_DEFAULT);
    expect(h.accountId).toBe('acc-1');
    expect(h.instrument.assetClass).toBe('us_equity');
    expect(h.instrument.nativeCurrency).toBe('USD');
  });

  it('clamps negative inputs to zero', () => {
    const h = broadMarketHolding('FR', 'EUR', -1, -1, 'acc', 'x');
    expect(h.pricePerUnit).toBe(0);
    expect(h.monthlyContribution).toBe(0);
  });
});

describe('accountsForDraft', () => {
  it('falls back to a single default taxable account when nothing is selected', () => {
    const accounts = accountsForDraft([], 'CA');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.sourceCountry).toBe('CA');
  });

  it('creates one account per selected preset', () => {
    const presets = ACCOUNT_PRESETS.filter(
      (p) => p.name === 'RRSP / REER' || p.name === 'TFSA / CELI',
    );
    const accounts = accountsForDraft(presets, 'CA');
    expect(accounts).toHaveLength(2);
    expect(accounts.map((a) => a.name)).toEqual(['RRSP / REER', 'TFSA / CELI']);
  });
});
