import { useMemo } from 'react';
import type { CurrencyCode } from '@/domain/money';

export interface CurrencyFormatter {
  /** Full currency format, whole units, e.g. "$60,000". */
  format: (amount: number) => string;
  /** Compact currency format, e.g. "$258.31K". */
  compact: (amount: number) => string;
  /**
   * Precise currency format for unit prices and per-asset values. Always shows
   * at least 2 decimals, and up to 6 for sub-dollar amounts (e.g. small crypto
   * prices), so values are never rounded up to a whole dollar.
   */
  price: (amount: number) => string;
  /** The currency's symbol, e.g. "€" for EUR — for use as a field prefix. */
  symbol: string;
}

/**
 * The single, centralised way to render money. Components must use this hook
 * rather than calling Intl.NumberFormat or toFixed inline.
 */
export const useCurrencyFormatter = (currency: CurrencyCode): CurrencyFormatter =>
  useMemo(() => {
    const full = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    const compactFmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 2,
    });
    const twoDp = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const sixDp = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
    const symbol =
      full.formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
    return {
      format: (amount) => full.format(amount),
      compact: (amount) => compactFmt.format(amount),
      price: (amount) => {
        const abs = Math.abs(amount);
        return abs > 0 && abs < 1 ? sixDp.format(amount) : twoDp.format(amount);
      },
      symbol,
    };
  }, [currency]);
