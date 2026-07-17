import type { ScenarioKey } from './scenario';

/** One asset's contribution within a single projected year (plan currency). */
export interface AssetYearValue {
  readonly holdingId: string;
  readonly symbol: string;
  /** Opening value (start of year, before growth/contributions). */
  readonly opening: number;
  /** Growth on the opening value this year. */
  readonly appreciation: number;
  /** Value after growth (opening + appreciation), before contributions/withdrawals. */
  readonly afterAppreciation: number;
  /** This asset's contribution value this year incl. intra-year CAGR growth, plan currency. */
  readonly contributionValue: number;
  readonly value: number; // closing value, plan currency
}

/** A single projected calendar year (plan currency throughout). */
export interface ProjectionYear {
  readonly year: number;
  readonly openingBalance: number;
  readonly appreciation: number;
  readonly balanceAfterAppreciation: number;
  /** Cash contributed this year (accumulation phase), plan currency — excludes growth. */
  readonly contribution: number;
  /** Contribution value incl. intra-year CAGR growth (what the table shows), plan currency. */
  readonly contributionValue: number;
  /** Net lifestyle amount delivered this year (after tax), plan currency. */
  readonly lifestyleSpending: number;
  /** Expense/income flow outflow landing this year (one-off or recurring), nominal. */
  readonly flowExpense: number;
  /** Expense/income flow inflow landing this year (one-off or recurring), nominal. */
  readonly flowIncome: number;
  /** Gross amount withdrawn from the portfolio (net + tax), plan currency. */
  readonly grossWithdrawal: number;
  /**
   * Every tax the household owes this year, plan currency: on withdrawals, on
   * conversions and the RMD, and on taxable flow income (pension, salary, rental).
   * Not all of it is raised from the portfolio — flow income is taxed at source of
   * the flow — so this is NOT bounded by `grossWithdrawal`.
   */
  readonly taxPaid: number;
  readonly closingBalance: number;
  readonly perAsset: readonly AssetYearValue[];
  readonly isRetired: boolean;
}

/** Full projection output for one scenario. */
export interface Projection {
  readonly scenario: ScenarioKey;
  readonly years: readonly ProjectionYear[];
  /** First year the closing balance hits zero, or null if savings never deplete in range. */
  readonly depletionYear: number | null;
  /** Years of survival once retired (depletionYear - retirementYear), or null. */
  readonly yearsOfSurvival: number | null;
}
