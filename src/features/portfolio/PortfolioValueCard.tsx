import { useTranslation } from 'react-i18next';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { cn } from '@/lib/cn';
import { usePlanContext } from './PlanLayout';

/**
 * Three deterministic stat cards atop the Projection page: portfolio value today,
 * projected value at retirement, and when (if ever) savings deplete.
 */
export const PortfolioValueCard = () => {
  const { plan, projection } = usePlanContext();
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);

  const todayValue = projection.active.years[0]?.closingBalance ?? 0;

  const retirementValue =
    projection.active.years.find((y) => y.year === plan.settings.retirementYear)?.closingBalance ??
    0;

  const depletionYear = projection.active.depletionYear;
  const yearsAfterRetiring =
    depletionYear !== null ? depletionYear - plan.settings.retirementYear : null;
  const depletes = depletionYear !== null;

  return (
    <div className="hero hero--triple">
      <div className="hero__card">
        <div className="hero__row">
          <span className="hero__label">{t('dashboard.portfolioToday')}</span>
        </div>
        <span className="hero__big hero__big--sm">{fmt.compact(todayValue)}</span>
        <span className="hero__big-note">{t('projChart.legendClosing')}</span>
      </div>

      <div className="hero__card">
        <div className="hero__row">
          <span className="hero__label">{t('dashboard.portfolioAtRetirement')}</span>
        </div>
        <span className="hero__big hero__big--sm">{fmt.compact(retirementValue)}</span>
        <span className="hero__big-note">{t('projChart.legendClosing')}</span>
      </div>

      <div className={cn('hero__card', depletes ? 'hero__card--warn' : 'hero__card--success')}>
        <div className="hero__row">
          <span className="hero__label">{t('dashboard.depletionTitle')}</span>
        </div>
        <span className="hero__big hero__big--sm">
          {depletes ? depletionYear : t('dashboard.neverDepletes')}
        </span>
        <span className={cn('hero__badge', depletes ? 'hero__badge--warn' : 'hero__badge--ok')}>
          {depletes
            ? t('dashboard.depletes', { year: depletionYear, years: yearsAfterRetiring })
            : t('dashboard.fullyFunded')}
        </span>
      </div>
    </div>
  );
};
