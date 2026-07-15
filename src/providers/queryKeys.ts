import type { CurrencyCode } from '@/domain/money';

/** Centralised, typed query keys with their intended freshness windows. */
export const queryKeys = {
  fx: (base: CurrencyCode) => ['fx', base] as const,
  cryptoPrice: (coinId: string, vs: CurrencyCode) => ['price', 'crypto', coinId, vs] as const,
  stockPrice: (symbol: string) => ['price', 'stock', symbol] as const,
  search: (query: string) => ['search', query] as const,
  // Keyed by user id (or 'guest') so it refetches on sign-in/out.
  entitlements: (userId: string) => ['entitlements', userId] as const,
};

/** staleTime budgets per data category (ms), per the architecture spec. */
export const STALE_TIME = {
  cryptoPrice: 30_000,
  stockPrice: 60_000,
  fx: 5 * 60_000,
  search: 60_000,
} as const;
