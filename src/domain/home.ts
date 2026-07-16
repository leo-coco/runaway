import type { ExpenseIncome } from './expenseIncome';

/**
 * A home / primary residence attached to a plan. Unlike a portfolio holding, a
 * home is never part of the drawdown pool: you live in it, so it funds no
 * spending until it is sold. Instead the home is modelled purely through its
 * cashflow effects — a purchase outlay, mortgage payments, ongoing ownership
 * costs and (optionally) sale proceeds — which are generated as {@link ExpenseIncome}
 * flows the projection and Monte Carlo engines already understand. Its equity
 * (value − mortgage) is tracked separately for the net-worth view only.
 *
 * All monetary fields are in the plan currency, in today's money.
 */
export interface Mortgage {
  /** Outstanding balance today (at the plan's start year), plan currency. */
  readonly balance: number;
  /** Annual nominal interest rate, percent (e.g. 5 = 5%/yr). */
  readonly ratePct: number;
  /** Remaining amortization in years from the start of ownership. */
  readonly termYearsRemaining: number;
}

/** A future purchase (leave undefined when the home is already owned today). */
export interface HomePurchase {
  /** Calendar year the home is bought. */
  readonly year: number;
  /** Down payment paid in cash at purchase (today's money). The mortgage funds the rest. */
  readonly downPayment: number;
  /** One-off closing/transfer costs as a percent of the home value at purchase. Default 0. */
  readonly closingCostPct?: number;
}

/** A planned sale / downsizing (leave undefined when the home is kept for the whole plan). */
export interface HomeSale {
  /** Calendar year the home is sold. */
  readonly year: number;
  /** Selling costs (agent commission + legal) as a percent of the sale price. Default 0. */
  readonly feePct?: number;
  /**
   * Whether the capital gain on the sale is taxed as ordinary income. Default false:
   * a primary residence is usually exempt (Canada principal-residence exemption,
   * US §121 exclusion), so the proceeds arrive as pure cash.
   */
  readonly capitalGainsTaxable?: boolean;
}

export interface Home {
  readonly id: string;
  readonly name: string;
  /**
   * Market value at the plan's start year, today's money. For a future purchase
   * this is the expected price at purchase in today's money; it appreciates from
   * the start year at {@link appreciationPct}.
   */
  readonly currentValue: number;
  /** Annual appreciation rate, percent (nominal). */
  readonly appreciationPct: number;
  /**
   * Annual ownership cost — property tax + insurance + maintenance — as a percent
   * of the current value. A common rule of thumb is 2–3%/yr. Default 0.
   */
  readonly ownershipCostPct?: number;
  /** Set when the home is bought during the plan rather than already owned. */
  readonly purchase?: HomePurchase;
  /** Current financing, if any. */
  readonly mortgage?: Mortgage;
  /** Planned downsizing / sale, if any. */
  readonly sale?: HomeSale;
}

/** Sentinel end year for open-ended recurring flows — far beyond any life expectancy. */
const OPEN_ENDED_OFFSET = 100;

/**
 * True when `endYear` is the {@link OPEN_ENDED_OFFSET} sentinel rather than a
 * real date (e.g. a home kept with no planned sale): UIs should show it as
 * ongoing instead of printing the arbitrary far-future year.
 */
export const isOpenEndedYear = (endYear: number, startYear: number): boolean =>
  endYear >= startYear + OPEN_ENDED_OFFSET;

/**
 * i18n key for each generated home-flow id, so UIs can label the flows (in the
 * projection tables, the modal preview…) instead of showing the raw home name
 * four times. Keyed by the stable ids {@link homeFlows} emits.
 */
export const HOME_FLOW_LABEL_KEY: Record<string, string> = {
  'home:purchase': 'home.flowPurchase',
  'home:mortgage': 'home.flowMortgage',
  'home:ownership': 'home.flowOwnership',
  'home:sale': 'home.flowSale',
};

/**
 * Level annual payment that fully amortizes `balance` over `termYears` at
 * `ratePct` (monthly compounding, the standard mortgage convention). Returns 0
 * for a non-positive balance or term. A ~0% rate reduces to straight-line
 * principal (balance / term).
 */
export const mortgageAnnualPayment = (
  balance: number,
  ratePct: number,
  termYears: number,
): number => {
  if (balance <= 0 || termYears <= 0) return 0;
  const r = ratePct / 100 / 12;
  const n = termYears * 12;
  if (Math.abs(r) < 1e-9) return balance / termYears;
  const monthly = (balance * r) / (1 - Math.pow(1 + r, -n));
  return monthly * 12;
};

/**
 * Outstanding mortgage balance at the start of `year`, given ownership (and thus
 * the first payment) begins in `ownStartYear`. Full balance at/before the start
 * of ownership, 0 once the term is paid off, otherwise the amortized remainder.
 */
export const mortgageBalanceAt = (
  mortgage: Mortgage,
  ownStartYear: number,
  year: number,
): number => {
  const { balance, ratePct, termYearsRemaining } = mortgage;
  if (balance <= 0 || termYearsRemaining <= 0) return 0;
  const yearsElapsed = year - ownStartYear;
  if (yearsElapsed <= 0) return balance;
  if (yearsElapsed >= termYearsRemaining) return 0;
  const r = ratePct / 100 / 12;
  const months = yearsElapsed * 12;
  if (Math.abs(r) < 1e-9) {
    const monthly = balance / (termYearsRemaining * 12);
    return Math.max(0, balance - monthly * months);
  }
  const payment = mortgageAnnualPayment(balance, ratePct, termYearsRemaining) / 12;
  const grown = balance * Math.pow(1 + r, months);
  const paid = payment * ((Math.pow(1 + r, months) - 1) / r);
  return Math.max(0, grown - paid);
};

/** The first year the home is owned: the purchase year, else the plan start year. */
const ownershipStartYear = (home: Home, startYear: number): number =>
  home.purchase ? home.purchase.year : startYear;

/** Nominal home value at `year` (today's `currentValue` appreciated from `startYear`). */
const homeValueAt = (home: Home, startYear: number, year: number): number =>
  home.currentValue * Math.pow(1 + home.appreciationPct / 100, year - startYear);

/** A point on the home's equity trajectory, for the net-worth view (nominal). */
export interface HomeEquityYear {
  readonly year: number;
  /** Market value that year (0 before a future purchase and after a sale). */
  readonly value: number;
  /** Outstanding mortgage balance that year. */
  readonly mortgageBalance: number;
  /** value − mortgageBalance. */
  readonly equity: number;
}

/**
 * Home value, mortgage balance and equity for each year in
 * `[startYear, startYear + horizonYears]`. Value is 0 before a future purchase
 * year and from the sale year onward (the home has left the balance sheet). This
 * series is display-only: it never feeds the drawdown engine.
 */
export const homeEquitySeries = (
  home: Home,
  startYear: number,
  horizonYears: number,
): readonly HomeEquityYear[] => {
  const ownStart = ownershipStartYear(home, startYear);
  const out: HomeEquityYear[] = [];
  for (let offset = 0; offset <= horizonYears; offset += 1) {
    const year = startYear + offset;
    const owned = year >= ownStart && (!home.sale || year < home.sale.year);
    const value = owned ? homeValueAt(home, startYear, year) : 0;
    const mortgageBalance =
      owned && home.mortgage ? mortgageBalanceAt(home.mortgage, ownStart, year) : 0;
    out.push({ year, value, mortgageBalance, equity: value - mortgageBalance });
  }
  return out;
};

/**
 * Net cash from selling the home in its sale year: the appreciated value less
 * selling fees and the mortgage still outstanding (which is paid off at closing).
 * Floored at 0. Returns null when the home has no planned sale.
 */
export const homeSaleProceeds = (home: Home, startYear: number): number | null => {
  if (!home.sale) return null;
  const ownStart = ownershipStartYear(home, startYear);
  const grossPrice = homeValueAt(home, startYear, home.sale.year);
  const fees = grossPrice * ((home.sale.feePct ?? 0) / 100);
  const remaining = home.mortgage ? mortgageBalanceAt(home.mortgage, ownStart, home.sale.year) : 0;
  return Math.max(0, grossPrice - fees - remaining);
};

/**
 * Translate a home into the {@link ExpenseIncome} flows that drive its impact on
 * the projection and Monte Carlo engines:
 *
 *  - **purchase** (future purchase only): a one-off expense = down payment +
 *    closing costs, in today's money (inflated to the purchase year).
 *  - **mortgage**: a recurring expense = the level annual payment, held nominal
 *    (`inflate: false`) since a fixed-rate payment does not rise with inflation,
 *    running from the start of ownership until the term ends or the home is sold.
 *  - **ownership**: a recurring expense = ownershipCostPct × the current value, in
 *    today's money (grows with general inflation), until the home is sold.
 *  - **sale**: a one-off income = {@link homeSaleProceeds}, already nominal
 *    (`inflate: false`), taxed per the sale's `capitalGainsTaxable` flag.
 *
 * Ids are stable (`home:*`) so the flows can be re-generated and diffed. The home
 * is never emitted as a portfolio holding, so it can never be drawn down.
 */
export const homeFlows = (home: Home | undefined, startYear: number): readonly ExpenseIncome[] => {
  if (!home) return [];
  const flows: ExpenseIncome[] = [];
  const ownStart = ownershipStartYear(home, startYear);
  // Ownership costs and mortgage stop the year before a sale; open-ended otherwise.
  const occupancyEndYear = home.sale ? home.sale.year - 1 : startYear + OPEN_ENDED_OFFSET;

  if (home.purchase) {
    // Cash outlay at purchase, all in today's money (inflated to the purchase
    // year by the engine): the down payment plus closing costs, which scale with
    // the home value.
    const closing = ((home.purchase.closingCostPct ?? 0) / 100) * home.currentValue;
    flows.push({
      id: 'home:purchase',
      name: home.name,
      amount: home.purchase.downPayment + closing,
      year: home.purchase.year,
      kind: 'expense',
      inflate: true,
    });
  }

  if (home.mortgage && home.mortgage.balance > 0 && home.mortgage.termYearsRemaining > 0) {
    const payment = mortgageAnnualPayment(
      home.mortgage.balance,
      home.mortgage.ratePct,
      home.mortgage.termYearsRemaining,
    );
    const payoffYear = ownStart + home.mortgage.termYearsRemaining - 1;
    const endYear = Math.min(payoffYear, occupancyEndYear);
    if (endYear >= ownStart) {
      flows.push({
        id: 'home:mortgage',
        name: home.name,
        amount: payment,
        year: ownStart,
        endYear,
        kind: 'expense',
        frequency: 'recurring',
        inflate: false,
      });
    }
  }

  const ownershipCostPct = home.ownershipCostPct ?? 0;
  if (ownershipCostPct > 0 && occupancyEndYear >= ownStart) {
    flows.push({
      id: 'home:ownership',
      name: home.name,
      amount: (ownershipCostPct / 100) * home.currentValue,
      year: ownStart,
      endYear: occupancyEndYear,
      kind: 'expense',
      frequency: 'recurring',
      inflate: true,
    });
  }

  if (home.sale) {
    const proceeds = homeSaleProceeds(home, startYear) ?? 0;
    flows.push({
      id: 'home:sale',
      name: home.name,
      amount: proceeds,
      year: home.sale.year,
      kind: 'income',
      inflate: false,
      taxable: home.sale.capitalGainsTaxable ?? false,
    });
  }

  return flows;
};
