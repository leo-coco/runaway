import { appError, type AppError } from '@/domain/errors';
import { err, ok, type Result } from '@/domain/result';
import type { CurrencyCode } from '@/domain/money';

/**
 * A snapshot of FX rates relative to a single base currency.
 * `rates[X]` = units of X per 1 unit of `base` (ExchangeRate-API convention).
 */
export interface RatesTable {
  readonly base: string;
  readonly rates: Readonly<Record<string, number>>;
  readonly asOf: number; // epoch ms
}

/**
 * Convert an amount between two currencies using a base-relative rates table.
 * Pure and React-free, so it is unit-testable in isolation.
 */
export const convert = (
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  table: RatesTable,
): Result<number, AppError> => {
  if (from === to) return ok(amount);

  const rateFrom = from === table.base ? 1 : table.rates[from];
  const rateTo = to === table.base ? 1 : table.rates[to];

  if (rateFrom === undefined) {
    return err(appError('not_found', `No exchange rate available for ${from}.`));
  }
  if (rateTo === undefined) {
    return err(appError('not_found', `No exchange rate available for ${to}.`));
  }
  if (rateFrom === 0) {
    return err(appError('unknown', `Invalid exchange rate for ${from}.`));
  }

  // amount(from) -> base -> to
  const inBase = amount / rateFrom;
  return ok(inBase * rateTo);
};

/** Convert and fall back to the raw amount if conversion is impossible. */
export const convertOr = (
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  table: RatesTable,
): number => {
  const r = convert(amount, from, to, table);
  return r.ok ? r.value : amount;
};
