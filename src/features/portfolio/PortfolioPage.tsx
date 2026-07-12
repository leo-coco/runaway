import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InvestmentBreakdown } from './InvestmentBreakdown';
import { usePlanContext } from './PlanLayout';

export const PortfolioPage = () => {
  const { plan, rates, totalValue } = usePlanContext();

  return (
    <ErrorBoundary feature="investment breakdown">
      <InvestmentBreakdown plan={plan} totalValue={totalValue} rates={rates} />
    </ErrorBoundary>
  );
};
