/**
 * Safe Withdrawal Rate (SWR) analysis, based on the industry-standard "4% rule".
 * The rate is the first-year retirement spending as a percentage of the
 * portfolio value at the retirement (target) year.
 */
export type SwrZone = 'safe' | 'caution' | 'high_risk';

export interface SwrStatus {
  /** Withdrawal rate as a percentage (e.g. 9.4). */
  readonly rate: number;
  readonly zone: SwrZone;
}

export const SWR_ZONE_LABEL: Record<SwrZone, string> = {
  safe: 'Ultra-safe',
  caution: 'Watch',
  high_risk: 'High',
};

export const SWR_ZONE_DESCRIPTION: Record<SwrZone, string> = {
  safe: 'Below 4% — historically very sustainable.',
  caution: 'Between 4% and 6% — keep an eye on spending and returns.',
  high_risk: 'Above 6% — elevated risk of running out of money early.',
};

/**
 * Classify a withdrawal rate by sustainability zone:
 *  - Safe:      rate < 4%
 *  - Caution:   4% <= rate <= 6%
 *  - High risk: rate > 6%
 */
export const classifySwr = (rate: number): SwrZone => {
  if (rate < 4) return 'safe';
  if (rate <= 6) return 'caution';
  return 'high_risk';
};

/**
 * Compute the withdrawal rate and its zone. Returns null when the portfolio
 * value is not positive (rate is undefined / not meaningful).
 */
export const safeWithdrawalRate = (
  annualSpending: number,
  portfolioValue: number,
): SwrStatus | null => {
  if (!Number.isFinite(portfolioValue) || portfolioValue <= 0) return null;
  const rate = (annualSpending / portfolioValue) * 100;
  return { rate, zone: classifySwr(rate) };
};
