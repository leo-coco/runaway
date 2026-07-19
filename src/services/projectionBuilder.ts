import type { Plan } from '@/domain/plan';
import { accountEffectiveRate, accountTaxProfile } from '@/domain/account';
import { homeFlows } from '@/domain/home';
import { rentalPropertiesFlows } from '@/domain/rentalProperty';
import { valueHoldings } from './portfolioService';
import {
  CASH_RESERVE_HOLDING_ID,
  CASH_RESERVE_SYMBOL,
  type ProjectionAssetInput,
  type ProjectionInput,
} from './retirementCalculator';
import { bracketFxFactor, type RatesTable } from './currencyService';

/** A non-growing, drawable cash bucket that receives `'cash'`-mode sale proceeds. */
const cashReserveAsset = (): ProjectionAssetInput => ({
  holdingId: CASH_RESERVE_HOLDING_ID,
  symbol: CASH_RESERVE_SYMBOL,
  startValue: 0,
  baseCagrPct: 0,
  annualContribution: 0,
  accountId: null,
  costBasis: 0,
  drawable: true,
});

/**
 * Build the projection engine input from a plan. Shared by the main projection
 * (useProjection) and the Withdrawal Strategy view so they are guaranteed to
 * produce identical numbers. `accountOrder` overrides the plan's stored order
 * (used to simulate alternative orderings without committing).
 */
export const buildProjectionInput = (
  plan: Plan,
  rates: RatesTable | undefined,
  startYear: number,
  horizonYears: number,
  accountOrder?: readonly string[],
): ProjectionInput => {
  const values = valueHoldings(plan.holdings, plan.currency, rates);
  const expensesIncomes = [
    ...(plan.settings.expensesIncomes ?? []),
    ...homeFlows(plan.home, startYear),
    ...rentalPropertiesFlows(plan.properties, startYear, plan.settings.inflationPct),
  ];
  const assets: ProjectionAssetInput[] = values.map((v) => ({
    holdingId: v.holdingId,
    symbol: v.symbol,
    startValue: v.value,
    baseCagrPct: v.baseCagrPct,
    annualContribution: v.monthlyContribution * 12,
    accountId: v.accountId,
    costBasis: v.costBasis,
    drawable: v.drawable,
  }));
  if (expensesIncomes.some((f) => f.reinvest === 'cash')) assets.push(cashReserveAsset());
  return {
    startYear,
    horizonYears,
    assets,
    retirementYear: plan.settings.retirementYear,
    annualSpending: plan.settings.annualSpending,
    inflationPct: plan.settings.inflationPct,
    spendingMode: plan.settings.spendingMode,
    phasedSpending: plan.settings.phasedSpending,
    currentAge: plan.settings.currentAge,
    // The home's and rentals' cashflows (purchase/mortgage/ownership/rent/sale)
    // are merged in as ordinary flows; the properties are never drawable holdings.
    expensesIncomes,
    conversions: plan.settings.conversions,
    rmdEnabled: plan.settings.rmdEnabled,
    scenario: plan.scenario,
    accounts: plan.accounts.map((a) => {
      const residence = plan.residenceCountry ?? 'US';
      const p = accountTaxProfile(a, residence);
      return {
        id: a.id,
        kind: a.kind ?? 'taxable',
        effectiveTaxRate: accountEffectiveRate(a, residence),
        incomeCoef: p.incomeCoef,
        gainsCoef: p.gainsCoef,
        flatRate: p.flatRate,
        withholding: p.withholding,
      };
    }),
    accountOrder: accountOrder ?? plan.withdrawalOrder,
    rawAccounts: plan.accounts,
    residence: plan.residenceCountry ?? 'US',
    province: plan.residenceProvince,
    taxFxFactor: bracketFxFactor(plan.residenceCountry ?? 'US', plan.currency, rates),
    growthFade: plan.settings.growthFade,
  };
};
