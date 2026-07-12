/**
 * Ordering helpers for the Withdrawal Strategy presets. The actual draw-down
 * simulation runs through the shared projection engine (`retirementCalculator`)
 * so the modal and the main projection table always agree.
 */
export interface AccountRanking {
  readonly id: string;
  readonly returnPct: number;
  readonly effectiveTaxRate: number;
}

/** Tax-free accounts first (tax rate ascending). */
export const orderTaxOptimized = (accounts: readonly AccountRanking[]): string[] =>
  [...accounts].sort((a, b) => a.effectiveTaxRate - b.effectiveTaxRate).map((a) => a.id);

/** Drain slow growers first (return ascending), letting the best compound. */
export const orderPreserveGrowth = (accounts: readonly AccountRanking[]): string[] =>
  [...accounts].sort((a, b) => a.returnPct - b.returnPct).map((a) => a.id);

/** Spend the highest-growth account first (return descending). */
export const orderRiskOnFirst = (accounts: readonly AccountRanking[]): string[] =>
  [...accounts].sort((a, b) => b.returnPct - a.returnPct).map((a) => a.id);
