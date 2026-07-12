import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ProbabilityView } from '@/features/projections/ProbabilityView';
import { usePlanContext } from './PlanLayout';

export const MonteCarloPage = () => {
  const { plan, monteCarlo, rates } = usePlanContext();
  return (
    <ErrorBoundary feature="probability">
      <ProbabilityView plan={plan} monteCarlo={monteCarlo} rates={rates} />
    </ErrorBoundary>
  );
};
