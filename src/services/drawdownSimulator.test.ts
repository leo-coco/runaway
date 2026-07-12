import { describe, expect, it } from 'vitest';
import {
  orderPreserveGrowth,
  orderRiskOnFirst,
  orderTaxOptimized,
  type AccountRanking,
} from './drawdownSimulator';

const accounts: AccountRanking[] = [
  { id: 'celi', returnPct: 8, effectiveTaxRate: 0 },
  { id: 'pea', returnPct: 5, effectiveTaxRate: 0 },
  { id: 'rrsp', returnPct: 12, effectiveTaxRate: 0.3 },
];

describe('withdrawal ordering presets', () => {
  it('tax-optimized puts the taxed account last', () => {
    expect(orderTaxOptimized(accounts).at(-1)).toBe('rrsp');
  });

  it('preserve-growth drains the slowest grower first', () => {
    expect(orderPreserveGrowth(accounts)[0]).toBe('pea'); // 5% is lowest
    expect(orderPreserveGrowth(accounts).at(-1)).toBe('rrsp'); // 12% is highest
  });

  it('risk-on-first drains the highest grower first', () => {
    expect(orderRiskOnFirst(accounts)[0]).toBe('rrsp');
  });
});
