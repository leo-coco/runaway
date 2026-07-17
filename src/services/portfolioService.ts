import type { Holding } from '@/domain/asset';
import type { Account } from '@/domain/account';
import type { AssetClass } from '@/domain/assetClass';
import type { CurrencyCode } from '@/domain/money';
import { holdingNativeValue } from '@/domain/asset';
import { convertChecked, type RatesTable } from './currencyService';

/** A holding's value expressed in the plan's reference currency. */
export interface HoldingValue {
  readonly holdingId: string;
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly baseCagrPct: number;
  /** Value in the plan currency (FX-converted from native when a rates table is given). */
  readonly value: number;
  /** Monthly contribution in the plan currency. */
  readonly monthlyContribution: number;
  /** Tax envelope this holding belongs to, or null. */
  readonly accountId: string | null;
  /** Cost basis in the plan currency, when the user set one (else undefined). */
  readonly costBasis: number | undefined;
  /** False when the holding is illiquid and must never be drawn down. */
  readonly drawable?: boolean;
}

/**
 * Normalise every holding into the plan currency. Pure and React-free.
 * Without a rates table, native amounts are used as-is (single-currency plans).
 */
export const valueHoldings = (
  holdings: readonly Holding[],
  planCurrency: CurrencyCode,
  rates: RatesTable | undefined,
): readonly HoldingValue[] =>
  holdings.map((h) => {
    const native = holdingNativeValue(h);
    const fx = (amount: number): number =>
      rates ? convertChecked(amount, h.instrument.nativeCurrency, planCurrency, rates) : amount;
    return {
      holdingId: h.id,
      symbol: h.instrument.symbol,
      assetClass: h.instrument.assetClass,
      baseCagrPct: h.expectedCagrPct,
      value: fx(native),
      monthlyContribution: fx(h.monthlyContribution ?? 0),
      accountId: h.accountId ?? null,
      costBasis: h.costBasis !== undefined ? fx(h.costBasis * h.quantity) : undefined,
      drawable: h.drawable,
    };
  });

export const totalValue = (values: readonly HoldingValue[]): number =>
  values.reduce((sum, v) => sum + v.value, 0);

/** Total monthly contribution across holdings, in the plan currency. */
export const totalMonthlyContribution = (values: readonly HoldingValue[]): number =>
  values.reduce((sum, v) => sum + v.monthlyContribution, 0);

/** Unrealised gain/loss for a set of holdings, in the plan currency. */
export interface GainSummary {
  /** Current market value. */
  readonly value: number;
  /** Cost basis: the user-set basis when present, else the account's static share. */
  readonly basis: number;
  /** value − basis. Positive is a gain, negative a loss. */
  readonly gain: number;
  /** gain / basis as a percentage, or null when there is no basis to compare to. */
  readonly pct: number | null;
}

/**
 * Aggregate unrealised gain/loss across holdings, in the plan currency. Mirrors
 * the per-row math in AssetRow: a holding's basis is its explicit cost basis when
 * the user set one, otherwise the account's static cost-basis share (`costBasisPct`)
 * of the holding's value. `value` totals every holding (used for subtotal display),
 * but a holding with no determinable basis (no explicit cost basis and no account
 * `costBasisPct`) is excluded from `basis`/`gain` entirely — including its full
 * value in the numerator while contributing nothing to the denominator would
 * inflate the aggregate `pct`. `pct` is null only when no holding in the set has
 * a determinable basis.
 */
export const gainForHoldings = (
  values: readonly HoldingValue[],
  accounts: readonly Account[],
): GainSummary => {
  const pctByAccount = new Map(accounts.map((a) => [a.id, a.costBasisPct ?? 0]));
  let value = 0;
  let valueWithBasis = 0;
  let basis = 0;
  for (const v of values) {
    value += v.value;
    const accountPct = v.accountId ? pctByAccount.get(v.accountId) : undefined;
    const hasBasis = v.costBasis !== undefined || !!accountPct;
    if (!hasBasis) continue;
    const defaultBasis = v.value * ((accountPct ?? 0) / 100);
    valueWithBasis += v.value;
    basis += v.costBasis ?? defaultBasis;
  }
  const gain = valueWithBasis - basis;
  return { value, basis, gain, pct: basis > 0 ? (gain / basis) * 100 : null };
};

/** Aggregate values by asset class for allocation charts. */
export const allocationByClass = (
  values: readonly HoldingValue[],
): readonly { assetClass: AssetClass; value: number }[] => {
  const map = new Map<AssetClass, number>();
  for (const v of values) {
    map.set(v.assetClass, (map.get(v.assetClass) ?? 0) + v.value);
  }
  return [...map.entries()].map(([assetClass, value]) => ({ assetClass, value }));
};
