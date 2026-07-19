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
  /**
   * Plan currency, today's money: the balance outstanding today for a home
   * already owned, or the amount borrowed for a future purchase (which is grown
   * to the purchase year's price level, like the home itself).
   */
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
  /**
   * Down payment paid in cash at purchase, today's money. The mortgage funds the
   * rest, and both grow with the home's appreciation to the purchase year, so
   * this fixes the share of the price paid in cash rather than a literal sum.
   */
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
  /**
   * Original cost basis (purchase price), today's money — only meaningful, and
   * only asked for, when the home has no {@link HomePurchase} (already owned):
   * a future purchase's basis is its price at acquisition, known automatically.
   * Defaults to `currentValue` (zero gain) when omitted.
   */
  readonly costBasis?: number;
  /**
   * What happens to the net sale proceeds in the projection. `'spread'` (default)
   * reinvests them across the existing portfolio holdings (pro-rata by value, or
   * split equally when the portfolio is depleted); `'cash'` parks them in a
   * non-growing cash reserve that funds later spending but never appreciates.
   * Without this, a lump sale is dumped into a single arbitrary holding.
   */
  readonly proceedsReinvest?: ProceedsReinvest;
}

/** Where a property's net sale proceeds go in the projection. */
export type ProceedsReinvest = 'spread' | 'cash';

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

/**
 * Scale factor from today's money to the nominal price level of the year the
 * home is acquired. 1 for a home already owned (acquired at the start year).
 * Every amount pinned to the home's price — the down payment, closing costs and
 * the mortgage that funds the balance — is entered in today's money and rides
 * this factor, so a purchase 10 years out keeps the loan-to-value the user
 * described instead of financing a future price with a present-day deposit.
 */
const acquisitionFactor = (home: Home, startYear: number): number =>
  Math.pow(1 + home.appreciationPct / 100, ownershipStartYear(home, startYear) - startYear);

/**
 * The mortgage as actually drawn: the user's today's-money balance grown to the
 * price level of the acquisition year. Identical to `home.mortgage` for a home
 * already owned, whose balance is already a nominal amount outstanding today.
 */
const financedMortgage = (home: Home, startYear: number): Mortgage | undefined =>
  home.mortgage
    ? { ...home.mortgage, balance: home.mortgage.balance * acquisitionFactor(home, startYear) }
    : undefined;

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
  const mortgage = financedMortgage(home, startYear);
  const out: HomeEquityYear[] = [];
  for (let offset = 0; offset <= horizonYears; offset += 1) {
    const year = startYear + offset;
    const owned = year >= ownStart && (!home.sale || year < home.sale.year);
    const value = owned ? homeValueAt(home, startYear, year) : 0;
    const mortgageBalance = owned && mortgage ? mortgageBalanceAt(mortgage, ownStart, year) : 0;
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
  const mortgage = financedMortgage(home, startYear);
  const remaining = mortgage ? mortgageBalanceAt(mortgage, ownStart, home.sale.year) : 0;
  return Math.max(0, grossPrice - fees - remaining);
};

/**
 * What the home cost to acquire, at the price level of its acquisition: for a
 * future purchase, the price paid (the home's value at the purchase year,
 * since {@link Home.currentValue} is defined relative to `startYear` regardless
 * of purchase timing); for a home already owned, the user-entered
 * {@link HomeSale.costBasis} (defaults to `currentValue`, i.e. zero gain).
 */
const acquisitionCost = (home: Home, startYear: number): number =>
  home.purchase
    ? homeValueAt(home, startYear, home.purchase.year)
    : (home.sale?.costBasis ?? home.currentValue);

/**
 * Taxable capital gain on the sale: the appreciated price less selling fees and
 * the acquisition cost, floored at 0. 0 when the home has no planned sale.
 */
export const homeSaleGain = (home: Home, startYear: number): number => {
  if (!home.sale) return 0;
  const grossPrice = homeValueAt(home, startYear, home.sale.year);
  const fees = grossPrice * ((home.sale.feePct ?? 0) / 100);
  return Math.max(0, grossPrice - fees - acquisitionCost(home, startYear));
};

/**
 * Translate a home into the {@link ExpenseIncome} flows that drive its impact on
 * the projection and Monte Carlo engines:
 *
 *  - **purchase** (future purchase only): a one-off expense = down payment +
 *    closing costs, already appreciated to the purchase year (`inflate: false`)
 *    since both are pinned to the home's price rather than to general CPI.
 *  - **mortgage**: a recurring expense = the level annual payment on the balance
 *    actually drawn (see {@link acquisitionFactor}), held nominal (`inflate: false`)
 *    since a fixed-rate payment does not rise with inflation, running from the
 *    start of ownership until the term ends or the home is sold.
 *  - **ownership**: a recurring expense = ownershipCostPct × the home's own
 *    (appreciating) value each year (`growthPct`), until the home is sold.
 *  - **sale**: a one-off income = {@link homeSaleProceeds}, already nominal
 *    (`inflate: false`); when `capitalGainsTaxable` is set, only the
 *    {@link homeSaleGain} portion (not the full proceeds) is taxable.
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
    // Cash outlay at purchase, already nominal (`inflate: false`): both the down
    // payment and the closing costs are pinned to the home's price, so they ride
    // the home's appreciation to the purchase year rather than general CPI.
    const priceAtPurchase = homeValueAt(home, startYear, home.purchase.year);
    const closing = ((home.purchase.closingCostPct ?? 0) / 100) * priceAtPurchase;
    const down = home.purchase.downPayment * acquisitionFactor(home, startYear);
    flows.push({
      id: 'home:purchase',
      name: home.name,
      amount: down + closing,
      year: home.purchase.year,
      kind: 'expense',
      inflate: false,
    });
  }

  const mortgage = financedMortgage(home, startYear);
  if (mortgage && mortgage.balance > 0 && mortgage.termYearsRemaining > 0) {
    const payment = mortgageAnnualPayment(
      mortgage.balance,
      mortgage.ratePct,
      mortgage.termYearsRemaining,
    );
    const payoffYear = ownStart + mortgage.termYearsRemaining - 1;
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
    // Pinned to the home's own appreciation (growthPct), not general CPI, so the
    // cost stays this percent of the home's actual value every year it's owned.
    flows.push({
      id: 'home:ownership',
      name: home.name,
      amount: (ownershipCostPct / 100) * homeValueAt(home, startYear, ownStart),
      year: ownStart,
      endYear: occupancyEndYear,
      kind: 'expense',
      frequency: 'recurring',
      growthPct: home.appreciationPct,
    });
  }

  if (home.sale) {
    const proceeds = homeSaleProceeds(home, startYear) ?? 0;
    const taxable = home.sale.capitalGainsTaxable ?? false;
    const gain = taxable ? homeSaleGain(home, startYear) : 0;
    flows.push({
      id: 'home:sale',
      name: home.name,
      amount: proceeds,
      year: home.sale.year,
      kind: 'income',
      inflate: false,
      taxable,
      taxableFraction: proceeds > 0 ? gain / proceeds : 0,
      reinvest: home.sale.proceedsReinvest ?? 'spread',
    });
  }

  return flows;
};
