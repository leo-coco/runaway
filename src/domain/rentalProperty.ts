import type { ExpenseIncome } from './expenseIncome';
import {
  mortgageAnnualPayment,
  mortgageBalanceAt,
  type HomePurchase,
  type HomeSale,
  type Mortgage,
  type ProceedsReinvest,
} from './home';

export type { HomePurchase, HomeSale, Mortgage, ProceedsReinvest };

/**
 * A rental (investment) property attached to a plan. Unlike the primary
 * {@link Home}, a rental *produces income*: it is modelled through the cashflows
 * it generates — a purchase outlay, mortgage payments, ongoing operating costs,
 * the rent it collects and (optionally) sale proceeds — emitted as
 * {@link ExpenseIncome} flows the projection and Monte Carlo engines already
 * understand. Its equity (value − mortgage) is tracked separately for the
 * net-worth view. A plan can hold several. The property itself is never part of
 * the drawdown pool.
 *
 * All monetary fields are in the plan currency, in today's money.
 */

/** How the rental income is taxed. */
export type RentalTaxMode =
  | 'net' // taxable base = rent − deductible operating costs − loan interest (default)
  | 'gross'; // taxable base = the full collected rent

export interface RentalProperty {
  readonly id: string;
  readonly name: string;
  /** Market value at the plan's start year, today's money (or expected price at a future purchase). */
  readonly currentValue: number;
  /** Annual appreciation rate, percent (nominal). */
  readonly appreciationPct: number;
  /** Gross monthly rent, today's money, before vacancy. */
  readonly monthlyRent: number;
  /** Annual rent indexation, percent (e.g. 2 = 2%/yr). */
  readonly rentInflationPct: number;
  /** Share of the year the unit sits empty, percent (0-100). Reduces collected rent. */
  readonly vacancyPct: number;
  /** Management / letting fee as a percent of collected rent. Default 0. */
  readonly managementFeePct?: number;
  /** Property tax (e.g. taxe foncière), today's money per year. Default 0. */
  readonly propertyTaxAnnual?: number;
  /** Maintenance / repairs as a percent of the property value per year. Default 0. */
  readonly maintenancePct?: number;
  /** Landlord insurance, today's money per year. Default 0. */
  readonly insuranceAnnual?: number;
  /**
   * How the rent is taxed. 'net' (default) deducts operating costs and loan
   * interest from the taxable base year by year; 'gross' taxes the full rent.
   */
  readonly taxMode?: RentalTaxMode;
  /** Set when the property is bought during the plan rather than already owned. */
  readonly purchase?: HomePurchase;
  /** Current financing, if any. */
  readonly mortgage?: Mortgage;
  /** Planned sale, if any. */
  readonly sale?: HomeSale;
}

/**
 * Sentinel end year for open-ended recurring flows — must match the value baked
 * into {@link isOpenEndedYear} in home.ts so the UI treats a kept rental the same
 * way (shown as ongoing rather than a far-future year).
 */
const OPEN_ENDED_OFFSET = 100;

/**
 * i18n key for each rental flow *type* (the third segment of its `rental:{id}:*`
 * id). Ids carry the property id so several rentals don't collide, so callers
 * resolve the label via {@link rentalFlowLabelKey} rather than a direct lookup.
 */
export const RENTAL_FLOW_TYPE_KEY: Record<string, string> = {
  purchase: 'rental.flowPurchase',
  mortgage: 'rental.flowMortgage',
  income: 'rental.flowIncome',
  operating: 'rental.flowOperating',
  sale: 'rental.flowSale',
};

/** i18n label key for a `rental:{id}:{type}` flow id, or undefined if not a rental flow. */
export const rentalFlowLabelKey = (id: string): string | undefined => {
  if (!id.startsWith('rental:')) return undefined;
  const type = id.split(':')[2];
  return type ? RENTAL_FLOW_TYPE_KEY[type] : undefined;
};

/** The first year the property is owned: the purchase year, else the plan start year. */
const ownershipStartYear = (p: RentalProperty, startYear: number): number =>
  p.purchase ? p.purchase.year : startYear;

/** Nominal property value at `year` (today's `currentValue` appreciated from `startYear`). */
const valueAt = (p: RentalProperty, startYear: number, year: number): number =>
  p.currentValue * Math.pow(1 + p.appreciationPct / 100, year - startYear);

/** Scale factor from today's money to the price level of the acquisition year (see home.ts). */
const acquisitionFactor = (p: RentalProperty, startYear: number): number =>
  Math.pow(1 + p.appreciationPct / 100, ownershipStartYear(p, startYear) - startYear);

/** The mortgage as actually drawn: today's-money balance grown to the acquisition year's price level. */
const financedMortgage = (p: RentalProperty, startYear: number): Mortgage | undefined =>
  p.mortgage
    ? { ...p.mortgage, balance: p.mortgage.balance * acquisitionFactor(p, startYear) }
    : undefined;

/** Vacancy clamped to [0, 100] as a fraction. */
const vacancyFraction = (p: RentalProperty): number => Math.min(1, Math.max(0, p.vacancyPct / 100));

/** Rent actually collected in `year`, nominal: gross rent net of vacancy, indexed at `rentInflationPct`. */
const collectedRentAt = (p: RentalProperty, startYear: number, year: number): number => {
  const annualToday = p.monthlyRent * 12 * (1 - vacancyFraction(p));
  return annualToday * Math.pow(1 + p.rentInflationPct / 100, year - startYear);
};

/** Operating cost in today's money at the start year (management + tax + maintenance + insurance). */
const operatingCostToday = (p: RentalProperty): number => {
  const management =
    ((p.managementFeePct ?? 0) / 100) * (p.monthlyRent * 12 * (1 - vacancyFraction(p)));
  const maintenance = ((p.maintenancePct ?? 0) / 100) * p.currentValue;
  return management + maintenance + (p.propertyTaxAnnual ?? 0) + (p.insuranceAnnual ?? 0);
};

/** Aggregate operating cost in `year`, nominal — the today's-money total indexed at CPI (`inflationPct`). */
const operatingCostAt = (
  p: RentalProperty,
  startYear: number,
  year: number,
  inflationPct: number,
): number => operatingCostToday(p) * Math.pow(1 + inflationPct / 100, year - startYear);

/** Mortgage interest paid during `year`, nominal: the level payment less the principal it retired. */
const mortgageInterestAt = (mortgage: Mortgage, ownStart: number, year: number): number => {
  const balanceStart = mortgageBalanceAt(mortgage, ownStart, year);
  if (balanceStart <= 0) return 0;
  const balanceEnd = mortgageBalanceAt(mortgage, ownStart, year + 1);
  const payment = mortgageAnnualPayment(
    mortgage.balance,
    mortgage.ratePct,
    mortgage.termYearsRemaining,
  );
  return Math.max(0, payment - (balanceStart - balanceEnd));
};

/** What the property cost to acquire, at its acquisition-year price level. Mirrors home.ts. */
const acquisitionCost = (p: RentalProperty, startYear: number): number =>
  p.purchase ? valueAt(p, startYear, p.purchase.year) : (p.sale?.costBasis ?? p.currentValue);

/**
 * Net cash from selling the property in its sale year: appreciated value less
 * selling fees and the mortgage still outstanding (paid off at closing). Floored
 * at 0. Returns null when there is no planned sale.
 */
export const rentalSaleProceeds = (p: RentalProperty, startYear: number): number | null => {
  if (!p.sale) return null;
  const ownStart = ownershipStartYear(p, startYear);
  const grossPrice = valueAt(p, startYear, p.sale.year);
  const fees = grossPrice * ((p.sale.feePct ?? 0) / 100);
  const mortgage = financedMortgage(p, startYear);
  const remaining = mortgage ? mortgageBalanceAt(mortgage, ownStart, p.sale.year) : 0;
  return Math.max(0, grossPrice - fees - remaining);
};

/** Taxable capital gain on the sale: appreciated price less selling fees and acquisition cost, floored at 0. */
export const rentalSaleGain = (p: RentalProperty, startYear: number): number => {
  if (!p.sale) return 0;
  const grossPrice = valueAt(p, startYear, p.sale.year);
  const fees = grossPrice * ((p.sale.feePct ?? 0) / 100);
  return Math.max(0, grossPrice - fees - acquisitionCost(p, startYear));
};

/** A point on a rental's equity trajectory, for the net-worth view (nominal). */
export interface RentalEquityYear {
  readonly year: number;
  /** Market value that year (0 before a future purchase and from the sale year onward). */
  readonly value: number;
  /** Outstanding mortgage balance that year. */
  readonly mortgageBalance: number;
  /** value − mortgageBalance. */
  readonly equity: number;
}

/**
 * Value, mortgage balance and equity for each year in
 * `[startYear, startYear + horizonYears]`. Value is 0 before a future purchase
 * year and from the sale year onward. Display-only: never feeds the drawdown engine.
 */
export const rentalPropertyEquitySeries = (
  p: RentalProperty,
  startYear: number,
  horizonYears: number,
): readonly RentalEquityYear[] => {
  const ownStart = ownershipStartYear(p, startYear);
  const mortgage = financedMortgage(p, startYear);
  const out: RentalEquityYear[] = [];
  for (let offset = 0; offset <= horizonYears; offset += 1) {
    const year = startYear + offset;
    const owned = year >= ownStart && (!p.sale || year < p.sale.year);
    const value = owned ? valueAt(p, startYear, year) : 0;
    const mortgageBalance = owned && mortgage ? mortgageBalanceAt(mortgage, ownStart, year) : 0;
    out.push({ year, value, mortgageBalance, equity: value - mortgageBalance });
  }
  return out;
};

/**
 * Net monthly cash the property throws off in its first owned year, for the
 * summary tiles: collected rent (net of vacancy, indexed) less operating costs
 * and the full mortgage payment (principal + interest), divided by 12. Not
 * floored — a property that runs at a loss shows a negative figure. Display-only.
 */
export const rentalMonthlyNetCashflow = (
  p: RentalProperty,
  startYear: number,
  inflationPct: number,
): number => {
  const ownStart = ownershipStartYear(p, startYear);
  const year = Math.max(startYear, ownStart);
  const rent = collectedRentAt(p, startYear, year);
  const operating = operatingCostAt(p, startYear, year, inflationPct);
  const mortgage = financedMortgage(p, startYear);
  const payment =
    mortgage && mortgageBalanceAt(mortgage, ownStart, year) > 0
      ? mortgageAnnualPayment(mortgage.balance, mortgage.ratePct, mortgage.termYearsRemaining)
      : 0;
  return (rent - operating - payment) / 12;
};

/** Combined net monthly cashflow across every rental (nominal, first owned year). */
export const rentalPropertiesMonthlyNetCashflow = (
  properties: readonly RentalProperty[] | undefined,
  startYear: number,
  inflationPct: number,
): number =>
  (properties ?? []).reduce(
    (sum, p) => sum + rentalMonthlyNetCashflow(p, startYear, inflationPct),
    0,
  );

/** Combined equity across every rental for each year (nominal). */
export const rentalPropertiesEquitySeries = (
  properties: readonly RentalProperty[] | undefined,
  startYear: number,
  horizonYears: number,
): readonly RentalEquityYear[] => {
  const out: RentalEquityYear[] = [];
  for (let offset = 0; offset <= horizonYears; offset += 1) {
    out.push({ year: startYear + offset, value: 0, mortgageBalance: 0, equity: 0 });
  }
  for (const p of properties ?? []) {
    const series = rentalPropertyEquitySeries(p, startYear, horizonYears);
    for (let i = 0; i < out.length; i += 1) {
      const row = out[i]!;
      const add = series[i]!;
      out[i] = {
        year: row.year,
        value: row.value + add.value,
        mortgageBalance: row.mortgageBalance + add.mortgageBalance,
        equity: row.equity + add.equity,
      };
    }
  }
  return out;
};

/**
 * Translate a rental property into the {@link ExpenseIncome} flows that drive its
 * impact on the projection and Monte Carlo engines. Ids are `rental:{id}:*` so
 * flows are stable and never collide across properties:
 *
 *  - **purchase** (future purchase only): a one-off expense = down payment +
 *    closing costs, appreciated to the purchase year (`inflate: false`).
 *  - **mortgage**: a recurring, nominal expense = the level annual payment on the
 *    balance actually drawn, from ownership start until the term ends or the
 *    property is sold.
 *  - **income**: recurring rent collected (net of vacancy), growing at
 *    `rentInflationPct`, taxed as ordinary income. In `net` mode the taxable base
 *    is reduced year by year by operating costs and loan interest via
 *    {@link ExpenseIncome.taxableAmounts}; in `gross` mode the whole rent is taxed.
 *  - **operating**: recurring expense = management + property tax + maintenance +
 *    insurance, indexed to CPI (`inflationPct`), until the property is sold.
 *  - **sale**: a one-off income = {@link rentalSaleProceeds}; the capital gain is
 *    taxable by default (a rental has no principal-residence exemption).
 *
 * `inflationPct` is the plan's CPI rate — needed to index the (today's-money)
 * operating costs and to size the net taxable base consistently with the cash.
 */
export const rentalPropertyFlows = (
  p: RentalProperty,
  startYear: number,
  inflationPct: number,
): readonly ExpenseIncome[] => {
  const flows: ExpenseIncome[] = [];
  const ownStart = ownershipStartYear(p, startYear);
  // Rent and operating costs stop the year before a sale; open-ended otherwise.
  const occupancyEndYear = p.sale ? p.sale.year - 1 : startYear + OPEN_ENDED_OFFSET;

  if (p.purchase) {
    const priceAtPurchase = valueAt(p, startYear, p.purchase.year);
    const closing = ((p.purchase.closingCostPct ?? 0) / 100) * priceAtPurchase;
    const down = p.purchase.downPayment * acquisitionFactor(p, startYear);
    flows.push({
      id: `rental:${p.id}:purchase`,
      name: p.name,
      amount: down + closing,
      year: p.purchase.year,
      kind: 'expense',
      inflate: false,
    });
  }

  const mortgage = financedMortgage(p, startYear);
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
        id: `rental:${p.id}:mortgage`,
        name: p.name,
        amount: payment,
        year: ownStart,
        endYear,
        kind: 'expense',
        frequency: 'recurring',
        inflate: false,
      });
    }
  }

  if (p.monthlyRent > 0 && occupancyEndYear >= ownStart) {
    const netMode = (p.taxMode ?? 'net') === 'net';
    let taxableAmounts: Record<number, number> | undefined;
    if (netMode) {
      taxableAmounts = {};
      for (let year = ownStart; year <= occupancyEndYear; year += 1) {
        const rent = collectedRentAt(p, startYear, year);
        const operating = operatingCostAt(p, startYear, year, inflationPct);
        const interest = mortgage ? mortgageInterestAt(mortgage, ownStart, year) : 0;
        taxableAmounts[year] = Math.max(0, rent - operating - interest);
      }
    }
    flows.push({
      id: `rental:${p.id}:income`,
      name: p.name,
      amount: collectedRentAt(p, startYear, ownStart),
      year: ownStart,
      endYear: occupancyEndYear,
      kind: 'income',
      category: 'rentalIncome',
      frequency: 'recurring',
      growthPct: p.rentInflationPct,
      taxable: true,
      ...(taxableAmounts ? { taxableAmounts } : {}),
    });
  }

  if (operatingCostToday(p) > 0 && occupancyEndYear >= ownStart) {
    flows.push({
      id: `rental:${p.id}:operating`,
      name: p.name,
      amount: operatingCostAt(p, startYear, ownStart, inflationPct),
      year: ownStart,
      endYear: occupancyEndYear,
      kind: 'expense',
      frequency: 'recurring',
      growthPct: inflationPct,
    });
  }

  if (p.sale) {
    const proceeds = rentalSaleProceeds(p, startYear) ?? 0;
    const taxable = p.sale.capitalGainsTaxable ?? true;
    const gain = taxable ? rentalSaleGain(p, startYear) : 0;
    flows.push({
      id: `rental:${p.id}:sale`,
      name: p.name,
      amount: proceeds,
      year: p.sale.year,
      kind: 'income',
      inflate: false,
      taxable,
      taxableFraction: proceeds > 0 ? gain / proceeds : 0,
      reinvest: p.sale.proceedsReinvest ?? 'spread',
    });
  }

  return flows;
};

/** Every rental's flows, flattened. */
export const rentalPropertiesFlows = (
  properties: readonly RentalProperty[] | undefined,
  startYear: number,
  inflationPct: number,
): readonly ExpenseIncome[] =>
  (properties ?? []).flatMap((p) => rentalPropertyFlows(p, startYear, inflationPct));
