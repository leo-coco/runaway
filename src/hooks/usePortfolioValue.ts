import { useMemo } from 'react';
import type { Plan } from '@/domain/plan';
import { totalValue, valueHoldings } from '@/services/portfolioService';
import type { RatesTable } from '@/services/currencyService';

/** Total portfolio value normalised to the plan currency. */
export const usePortfolioValue = (plan: Plan | undefined, rates: RatesTable | undefined): number =>
  useMemo(
    () => (plan ? totalValue(valueHoldings(plan.holdings, plan.currency, rates)) : 0),
    [plan, rates],
  );
