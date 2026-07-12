import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InfoPanel } from '@/components/ui/InfoPanel';
import { ProjectionsPanel } from '@/features/projections/ProjectionsPanel';
import { YearlyJourneyTable } from '@/features/projections/YearlyJourneyTable';
import { CalculationDetailsContent } from '@/features/projections/CalculationDetails';
import { usePlanContext } from './PlanLayout';

export const ProjectionPage = () => {
  const { plan, projection } = usePlanContext();
  const { t } = useTranslation();
  return (
    <ErrorBoundary feature="projections">
      <ProjectionsPanel plan={plan} projection={projection} />
      <YearlyJourneyTable plan={plan} projection={projection.active} />
      <div data-tour="calc-details">
        <InfoPanel title={t('calc.title')}>
          <CalculationDetailsContent plan={plan} projection={projection.active} />
          <p className="section__desc" style={{ marginTop: 12 }}>
            <Link to={`/plan/${plan.id}/methodology`} className="method-link">
              {t('methodology.seeFull')}
            </Link>
          </p>
        </InfoPanel>
      </div>
    </ErrorBoundary>
  );
};
