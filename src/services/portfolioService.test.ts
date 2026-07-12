import { describe, expect, it } from 'vitest';
import {
  allocationByClass,
  gainForHoldings,
  totalMonthlyContribution,
  totalValue,
  valueHoldings,
} from './portfolioService';
import type { RatesTable } from './currencyService';
import type { Account } from '@/domain/account';
import type { Holding } from '@/domain/asset';

const rates: RatesTable = {
  base: 'USD',
  rates: { USD: 1, CAD: 1.35 },
  asOf: 0,
};

const cadEquity: Holding = {
  id: 'h1',
  quantity: 10,
  pricePerUnit: 135, // 1350 CAD total
  expectedCagrPct: 5,
  monthlyContribution: 135, // 135 CAD/mo
  accountId: null,
  instrument: {
    id: 'alphavantage:SHOP.TO',
    symbol: 'SHOP.TO',
    name: 'Shopify',
    assetClass: 'ca_equity',
    exchange: 'TSX',
    nativeCurrency: 'CAD',
  },
};

const usdCrypto: Holding = {
  id: 'h2',
  quantity: 2,
  pricePerUnit: 1000, // 2000 USD total
  expectedCagrPct: 12,
  monthlyContribution: 100, // 100 USD/mo
  accountId: null,
  instrument: {
    id: 'coingecko:bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    assetClass: 'crypto',
    exchange: 'Crypto',
    nativeCurrency: 'USD',
  },
};

describe('portfolioService.valueHoldings', () => {
  it('converts each holding into the master currency', () => {
    const values = valueHoldings([cadEquity, usdCrypto], 'USD', rates);
    const cad = values.find((v) => v.holdingId === 'h1')!;
    const usd = values.find((v) => v.holdingId === 'h2')!;
    expect(Math.round(cad.value)).toBe(1000); // 1350 CAD / 1.35 = 1000 USD
    expect(usd.value).toBe(2000); // already USD
  });

  it('totals all holdings in the master currency', () => {
    const total = totalValue(valueHoldings([cadEquity, usdCrypto], 'USD', rates));
    expect(Math.round(total)).toBe(3000);
  });

  it('values natively when no rates table is available', () => {
    const total = totalValue(valueHoldings([cadEquity, usdCrypto], 'USD', undefined));
    expect(total).toBe(1350 + 2000);
  });

  it('aggregates allocation by asset class', () => {
    const alloc = allocationByClass(valueHoldings([cadEquity, usdCrypto], 'USD', rates));
    const crypto = alloc.find((a) => a.assetClass === 'crypto')!;
    expect(Math.round(crypto.value)).toBe(2000);
  });

  it('converts and totals monthly contributions in the master currency', () => {
    const values = valueHoldings([cadEquity, usdCrypto], 'USD', rates);
    // 135 CAD / 1.35 = 100 USD ; plus 100 USD = 200 USD/mo total.
    expect(Math.round(totalMonthlyContribution(values))).toBe(200);
  });
});

describe('portfolioService.gainForHoldings', () => {
  const brokerage: Account = {
    id: 'a1',
    name: 'Brokerage',
    taxRatePct: 30,
    taxableBasePct: 100,
    costBasisPct: 60,
  };

  it('uses the explicit cost basis when the user set one', () => {
    // 2 units at 1000 USD = 2000 value; basis 800/unit → 1600 basis; +400 (+25%).
    const holding: Holding = { ...usdCrypto, accountId: 'a1', costBasis: 800 };
    const g = gainForHoldings(valueHoldings([holding], 'USD', rates), [brokerage]);
    expect(g.value).toBe(2000);
    expect(g.basis).toBe(1600);
    expect(g.gain).toBe(400);
    expect(g.pct).toBeCloseTo(25);
  });

  it("falls back to the account's costBasisPct when no basis is set", () => {
    // No costBasis → basis = value * 60% = 1200; gain 800 (+66.7%).
    const holding: Holding = { ...usdCrypto, accountId: 'a1' };
    const g = gainForHoldings(valueHoldings([holding], 'USD', rates), [brokerage]);
    expect(g.basis).toBe(1200);
    expect(g.gain).toBe(800);
    expect(g.pct).toBeCloseTo((800 / 1200) * 100);
  });

  it('returns a null percentage when there is no basis at all', () => {
    // Unassigned holding, no costBasis, no account share → basis 0.
    const g = gainForHoldings(valueHoldings([usdCrypto], 'USD', rates), []);
    expect(g.basis).toBe(0);
    expect(g.pct).toBeNull();
  });

  it('aggregates value and basis across several holdings', () => {
    const a: Holding = { ...usdCrypto, id: 'x', accountId: 'a1', costBasis: 800 };
    const b: Holding = { ...cadEquity, id: 'y', accountId: 'a1', costBasis: 100 }; // 1350 CAD → 1000 USD; basis 1000 CAD → 741 USD
    const g = gainForHoldings(valueHoldings([a, b], 'USD', rates), [brokerage]);
    expect(Math.round(g.value)).toBe(3000);
    expect(Math.round(g.basis)).toBe(1600 + Math.round((100 * 10) / 1.35));
    expect(g.gain).toBeGreaterThan(0);
  });
});
