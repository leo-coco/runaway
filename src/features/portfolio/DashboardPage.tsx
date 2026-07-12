import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { successStatus, type SuccessZone } from '@/domain/successRate';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { cn } from '@/lib/cn';
import { OverviewCards } from './OverviewCards';
import { usePlanContext } from './PlanLayout';

const SUCCESS_COLOR: Record<SuccessZone, string> = {
  strong: 'var(--success)',
  borderline: 'var(--amber)',
  weak: 'var(--danger, #f43f5e)',
};

export const DashboardPage = () => {
  const { plan, rates, totalValue, projection, monteCarlo } = usePlanContext();
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);

  const hasAssets = plan.holdings.length > 0;
  const sx = monteCarlo.result ? successStatus(monteCarlo.result.successRate) : null;
  const depletionYear = projection.active.depletionYear;
  const yearsAfterRetiring =
    depletionYear !== null ? depletionYear - plan.settings.retirementYear : null;

  return (
    <>
      <div className="hero">
        <div className="hero__card">
          <div className="hero__row">
            <span className="hero__label">{t('dashboard.portfolioValue')}</span>
          </div>
          <span className="hero__big">{fmt.compact(totalValue)}</span>
          {depletionYear !== null ? (
            <span className="hero__badge hero__badge--warn">
              {t('dashboard.depletes', { year: depletionYear, years: yearsAfterRetiring })}
            </span>
          ) : null}
        </div>

        <div className={cn('hero__card', sx?.zone === 'weak' && 'hero__card--risk')}>
          <div className="hero__row">
            <span className="hero__label">{t('dashboard.successRate')}</span>
          </div>
          {!hasAssets ? (
            <span className="hero__big">—</span>
          ) : sx ? (
            <>
              <div className="hero__big-row">
                <span className="hero__big" style={{ color: SUCCESS_COLOR[sx.zone] }}>
                  {sx.pct.toFixed(0)}%
                </span>
                <span className="hero__big-note">{t('dashboard.oddsNote')}</span>
              </div>
              <div className="hero__bar">
                <span
                  className="hero__bar-fill"
                  style={{ width: `${sx.pct}%`, background: SUCCESS_COLOR[sx.zone] }}
                />
              </div>
            </>
          ) : (
            <span className="hero__big" style={{ fontSize: 32 }}>
              {t('dashboard.simulating')}
            </span>
          )}
        </div>
      </div>

      <div className="settings-head">
        <span className="settings-head__title">{t('dashboard.planSettings')}</span>
      </div>
      <ErrorBoundary feature="plan settings">
        <OverviewCards plan={plan} rates={rates} />
      </ErrorBoundary>
    </>
  );
};
