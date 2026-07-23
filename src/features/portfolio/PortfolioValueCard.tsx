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
  const depletedAtRetirement = retirementValue <= 0;

  const depletionYear = projection.active.depletionYear;
  const depletes = depletionYear !== null;
  const currentAge = plan.settings.currentAge;
  const depletionAge =
    depletes && currentAge > 0
      ? currentAge + (depletionYear - projection.active.years[0]!.year)
      : null;
  const endOfPlanValue = projection.active.years.at(-1)?.closingBalance ?? 0;

  return (
    <div className="hero hero--triple projection-summary" data-tour="projection-summary-cards">
      <div className="hero__card">
        <div className="hero__row">
          <span className="hero__label">{t('dashboard.portfolioToday')}</span>
        </div>
        <span className="hero__big hero__big--sm">{fmt.compact(todayValue)}</span>
        <span className="hero__big-note">{t('projChart.legendClosing')}</span>
      </div>

      <div className={cn('hero__card', depletedAtRetirement && 'hero__card--depletion')}>
        <div className="hero__row">
          <span className="hero__label">{t('dashboard.portfolioAtRetirement')}</span>
        </div>
        <span className="hero__big hero__big--sm">{fmt.compact(retirementValue)}</span>
        <span className="hero__big-note">{t('projChart.legendClosing')}</span>
      </div>

      <div className={cn('hero__card', depletes && 'hero__card--depletion')}>
        <div className="hero__row">
          <span className="hero__label">
            {t(depletes ? 'dashboard.depletionTitle' : 'dashboard.portfolioAtPlanEnd')}
          </span>
        </div>
        <span className="hero__big hero__big--sm">
          {depletes ? depletionYear : fmt.compact(endOfPlanValue)}
        </span>
        {depletionAge !== null ? (
          <span className="hero__big-note">
            {t('dashboard.depletionAgeNote', { age: depletionAge })}
          </span>
        ) : (
          <span className="hero__big-note">{t('projChart.legendClosing')}</span>
        )}
      </div>
    </div>
  );
};
