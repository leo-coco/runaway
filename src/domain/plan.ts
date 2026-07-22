import type { Account } from './account';
import type { Holding } from './asset';
import type { Home } from './home';
import type { RentalProperty } from './rentalProperty';
import type { CurrencyCode } from './money';
import { RESIDENCE_CURRENCY, type Country, type Province } from './country';
import type { ExpenseIncome } from './expenseIncome';
import type { RetirementSettings } from './retirementSettings';
import type { ScenarioConfig } from './scenario';

/** A complete saved retirement plan. This is the unit persisted by the store. */
export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly currency: CurrencyCode;
  readonly holdings: readonly Holding[];
  /**
   * Primary residence, if the plan models one. Not a holding: it never enters the
   * drawdown pool. Its purchase/mortgage/ownership/sale cashflows are generated as
   * expense/income flows and merged into the projection, and its equity is tracked
   * separately for the net-worth view.
   */
  readonly home?: Home;
  /**
   * Rental / investment properties, if the plan models any. Not holdings: they
   * never enter the drawdown pool. Each one's purchase/mortgage/operating/rent/
   * sale cashflows are generated as expense/income flows and merged into the
   * projection (rent is taxable ordinary income); their equity is tracked
   * separately for the net-worth view.
   */
  readonly properties?: readonly RentalProperty[];
  /** Tax envelopes holdings can be grouped into. Empty = no tax modelling. */
  readonly accounts: readonly Account[];
  /** Account ids in the order they are drained during retirement (top first). */
  readonly withdrawalOrder: readonly string[];
  /** Tax residence — drives the tax engine for auto-mode accounts. */
  readonly residenceCountry?: Country;
  /** Canadian province (combined bracket schedule); only meaningful when CA. */
  readonly residenceProvince?: Province;
  /**
   * User overrides for the Monte Carlo correlation between two holdings, keyed by
   * `${idA}|${idB}` with the two holding ids sorted. Absent pairs fall back to the
   * asset-class default. Symmetric (stored once per pair).
   */
  readonly correlationOverrides?: Record<string, number>;
  readonly settings: RetirementSettings;
  readonly scenario: ScenarioConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Every currency the plan must be able to convert to price itself: its own
 * reference currency, each holding's native currency, and the residence's local
 * currency (whose tax brackets are legislated in it and scaled into plan money).
 * An FX table missing any of these cannot value the plan.
 */
export const planCurrencies = (plan: Plan): readonly CurrencyCode[] => [
  plan.currency,
  RESIDENCE_CURRENCY[plan.residenceCountry ?? 'US'],
  ...plan.holdings.map((h) => h.instrument.nativeCurrency),
];

/** Plan amounts are major units: sub-cent precision is FX noise, not information. */
const scale = (amount: number, factor: number): number => Math.round(amount * factor * 100) / 100;

const rescaleTaxableAmounts = (
  amounts: Readonly<Record<number, number>>,
  factor: number,
): Record<number, number> => {
  const out: Record<number, number> = {};
  for (const [year, amount] of Object.entries(amounts)) out[Number(year)] = scale(amount, factor);
  return out;
};

const rescaleFlow = (flow: ExpenseIncome, factor: number): ExpenseIncome => ({
  ...flow,
  amount: scale(flow.amount, factor),
  ...(flow.taxableAmounts
    ? { taxableAmounts: rescaleTaxableAmounts(flow.taxableAmounts, factor) }
    : {}),
});

const rescaleHome = (home: Home, factor: number): Home => ({
  ...home,
  currentValue: scale(home.currentValue, factor),
  ...(home.mortgage
    ? { mortgage: { ...home.mortgage, balance: scale(home.mortgage.balance, factor) } }
    : {}),
  ...(home.purchase
    ? { purchase: { ...home.purchase, downPayment: scale(home.purchase.downPayment, factor) } }
    : {}),
  ...(home.sale?.costBasis !== undefined
    ? { sale: { ...home.sale, costBasis: scale(home.sale.costBasis, factor) } }
    : {}),
});

const rescaleProperty = (property: RentalProperty, factor: number): RentalProperty => ({
  ...property,
  currentValue: scale(property.currentValue, factor),
  monthlyRent: scale(property.monthlyRent, factor),
  ...(property.propertyTaxAnnual !== undefined
    ? { propertyTaxAnnual: scale(property.propertyTaxAnnual, factor) }
    : {}),
  ...(property.insuranceAnnual !== undefined
    ? { insuranceAnnual: scale(property.insuranceAnnual, factor) }
    : {}),
  ...(property.mortgage
    ? { mortgage: { ...property.mortgage, balance: scale(property.mortgage.balance, factor) } }
    : {}),
  ...(property.purchase
    ? {
        purchase: {
          ...property.purchase,
          downPayment: scale(property.purchase.downPayment, factor),
        },
      }
    : {}),
  ...(property.sale?.costBasis !== undefined
    ? { sale: { ...property.sale, costBasis: scale(property.sale.costBasis, factor) } }
    : {}),
});

/**
 * Restate every amount the plan holds in its reference currency, scaled by
 * `factor` (units of the new currency per unit of the current one). Changing a
 * plan's currency is a change of unit, not of content: holdings are stored in
 * their native currency and re-converted on read, so the portfolio's real value
 * is already invariant — anything on the liability side left unscaled would
 * silently change what the plan actually models.
 *
 * Deliberately untouched: holdings (native currency, `costBasis` included),
 * every `*Pct` field, and `phasedSpending` (ages and percentages only).
 */
export const rescalePlanAmounts = (plan: Plan, factor: number): Plan => {
  if (factor === 1) return plan;
  const { settings } = plan;
  return {
    ...plan,
    settings: {
      ...settings,
      annualSpending: scale(settings.annualSpending, factor),
      ...(settings.expensesIncomes
        ? { expensesIncomes: settings.expensesIncomes.map((f) => rescaleFlow(f, factor)) }
        : {}),
      ...(settings.conversions
        ? {
            conversions: settings.conversions.map((c) => ({
              ...c,
              annualAmount: scale(c.annualAmount, factor),
            })),
          }
        : {}),
    },
    ...(plan.home ? { home: rescaleHome(plan.home, factor) } : {}),
    ...(plan.properties
      ? { properties: plan.properties.map((p) => rescaleProperty(p, factor)) }
      : {}),
  };
};
