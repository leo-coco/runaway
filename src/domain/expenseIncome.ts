/**
 * A named cashflow tied to specific year(s) — a home purchase or sale, education
 * costs, an inheritance received. Unlike recurring spending or income streams,
 * these are one-off events by default, but can also recur every year across a
 * range (e.g. tuition for a few years).
 */
export type FlowFrequency = 'once' | 'recurring';

/**
 * Optional tag chosen by the user, purely presentational: it drives which icon a
 * flow shows on the runway timeline. Absent = 'general'. Never affects amounts,
 * tax, or projection maths. 'home' is reserved for the premium Real Estate
 * module's own purchase/sale events (see runwayEvents.ts) and is deliberately
 * excluded from EXPENSE_CATEGORIES so it isn't user-selectable here.
 */
export type ExpenseCategory =
  | 'general'
  | 'vehicle'
  | 'travel'
  | 'education'
  | 'health'
  | 'wedding'
  | 'gift'
  | 'home'
  | 'insurance'
  | 'relocation'
  | 'family'
  | 'renovation'
  | 'business'
  | 'pension'
  | 'debt'
  | 'taxLegal'
  | 'salary'
  | 'rentalIncome';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'general',
  'vehicle',
  'travel',
  'education',
  'health',
  'wedding',
  'gift',
  'insurance',
  'relocation',
  'family',
  'renovation',
  'business',
  'pension',
  'debt',
  'taxLegal',
  'salary',
  'rentalIncome',
];

export interface ExpenseIncome {
  readonly id: string;
  readonly name: string;
  /** Amount in the plan currency, in today's money. Always a positive magnitude. */
  readonly amount: number;
  /** Calendar year it occurs (frequency 'once'), or the first year (inclusive) when 'recurring'. */
  readonly year: number;
  /** Outflow (purchase, big expense) or inflow (sale proceeds, inheritance). */
  readonly kind: 'expense' | 'income';
  /** Presentational tag driving the runway-timeline icon. Default 'general'. */
  readonly category?: ExpenseCategory;
  /** Grow with inflation from today to the target year(s). Default true. */
  readonly inflate?: boolean;
  /** 'once' (default) fires only in `year`; 'recurring' fires every year through `endYear`. */
  readonly frequency?: FlowFrequency;
  /** Recurring only: last year it occurs (inclusive). Ignored when frequency is 'once'. */
  readonly endYear?: number;
  /**
   * Income kind only: taxed as ordinary income at the residence brackets, so it
   * stacks *beneath* portfolio withdrawals in the progressive brackets — same
   * treatment as a pension/salary income stream. Default true. A one-off inflow
   * that isn't ordinary income (e.g. an inheritance, exempt in most residences)
   * should set this to false.
   */
  readonly taxable?: boolean;
}

export interface YearExpenseIncome {
  /** Total outflows landing in the year, in nominal money. */
  readonly expense: number;
  /** Total inflows landing in the year, in nominal money. */
  readonly income: number;
  /** Portion of `income` taxed as ordinary income this year (subset of `income`). */
  readonly taxableIncome: number;
}

const EMPTY: YearExpenseIncome = { expense: 0, income: 0, taxableIncome: 0 };

/**
 * A single item's nominal amount landing on `year`, or 0 if it doesn't land that
 * year. Same range/inflation rules as `expenseIncomeAmountsForYear` below, factored
 * out so callers can break a year's total down by item (e.g. an expandable table row).
 */
export const expenseIncomeItemAmountForYear = (
  item: ExpenseIncome,
  year: number,
  inflationFactor: number,
): number => {
  const inRange =
    item.frequency === 'recurring'
      ? year >= item.year && year <= (item.endYear ?? item.year)
      : item.year === year;
  if (!inRange) return 0;
  return item.amount * ((item.inflate ?? true) ? inflationFactor : 1);
};

/**
 * Expenses/income landing on `year`, in nominal money. `inflationFactor` is the
 * same `(1 + inflationRate) ^ offset` the projection loop already computes for
 * that year — items with `inflate: false` are left at their nominal amount. A
 * 'once' item matches only its `year`; a 'recurring' item matches every year in
 * `[year, endYear]` (inclusive, `endYear` falls back to `year` if unset).
 */
export const expenseIncomeAmountsForYear = (
  items: readonly ExpenseIncome[] | undefined,
  year: number,
  inflationFactor: number,
): YearExpenseIncome => {
  if (!items || items.length === 0) return EMPTY;
  let expense = 0;
  let income = 0;
  let taxableIncome = 0;
  for (const item of items) {
    const amount = expenseIncomeItemAmountForYear(item, year, inflationFactor);
    if (amount === 0) continue;
    if (item.kind === 'income') {
      income += amount;
      if (item.taxable ?? true) taxableIncome += amount;
    } else {
      expense += amount;
    }
  }
  return { expense, income, taxableIncome };
};
