import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { successStatus, type SuccessBand } from '@/domain/successRate';
import { useFeature } from '@/hooks/useEntitlements';
import { useAppStore } from '@/store';
import { ProBadge } from '@/features/billing/ProBadge';
import { StarIcon } from '@/components/icons';
import { SUCCESS_BAND_COLOR, SuccessRateDonut } from '@/components/ui/SuccessRateDonut';
import { cn } from '@/lib/cn';
import { usePlanContext } from './PlanLayout';

const TITLE_KEY: Record<SuccessBand, string> = {
  excellent: 'dashboard.mc.titleExcellent',
  good: 'dashboard.mc.titleGood',
  fair: 'dashboard.mc.titleFair',
  risky: 'dashboard.mc.titleRisky',
  concerning: 'dashboard.mc.titleConcerning',
  nonViable: 'dashboard.mc.titleNonViable',
};

const DESC_KEY: Record<SuccessBand, string> = {
  excellent: 'dashboard.mc.descExcellent',
  good: 'dashboard.mc.descGood',
  fair: 'dashboard.mc.descFair',
  risky: 'dashboard.mc.descRisky',
  concerning: 'dashboard.mc.descConcerning',
  nonViable: 'dashboard.mc.descNonViable',
};

/**
 * Left card of the dashboard hero: the Monte-Carlo verdict. Left half carries a
 * plain-language read of the odds (badge, title, description, CTA to the full
 * simulation), right half is a donut of the success rate itself.
 */
export const MonteCarloSummaryCard = () => {
  const { plan, monteCarlo } = usePlanContext();
  const { t } = useTranslation();
  const mcEnabled = useFeature('monteCarlo');
  const openPaywall = useAppStore((s) => s.openPaywall);

  const hasAssets = plan.holdings.length > 0;
  const sx = monteCarlo.result ? successStatus(monteCarlo.result.successRate) : null;
  const isCalculating = monteCarlo.status === 'running';

  if (!mcEnabled) {
    return (
      <div
        className="hero__card mc-card mc-card--locked"
        data-tour="mc-summary-card"
        role="button"
        tabIndex={0}
        onClick={() => openPaywall('monteCarlo')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openPaywall('monteCarlo');
        }}
      >
        <span className="hero__lock">
          <StarIcon size={16} />
          {t('billing.unlock')}
        </span>
        <ProBadge />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'hero__card',
        'mc-card',
        isCalculating && 'mc-card--calculating',
        (sx?.band === 'concerning' || sx?.band === 'nonViable') && 'hero__card--risk',
      )}
      style={
        sx
          ? {
              borderColor: SUCCESS_BAND_COLOR[sx.band],
              ['--mc-color' as string]: SUCCESS_BAND_COLOR[sx.band],
            }
          : undefined
      }
      data-tour="mc-summary-card"
      aria-busy={isCalculating}
    >
      <div className="mc-card__text">
        {!hasAssets ? (
          <span className="mc-card__note">{t('dashboard.mc.noData')}</span>
        ) : sx ? (
          <>
            <h2 className="mc-card__title" style={{ color: SUCCESS_BAND_COLOR[sx.band] }}>
              {t(TITLE_KEY[sx.band])}
            </h2>
            <p className="mc-card__desc">{t(DESC_KEY[sx.band], { pct: sx.pct.toFixed(0) })}</p>
            <Link to={`/plan/${plan.id}/monte-carlo`} className="runway__more mc-card__cta">
              {t('dashboard.mc.cta')} →
            </Link>
          </>
        ) : (
          <span className="mc-card__note">{t('dashboard.mc.simulating')}</span>
        )}
      </div>

      {hasAssets && sx ? (
        <SuccessRateDonut
          percent={sx.pct}
          band={sx.band}
          label={t('dashboard.mc.ringLabel')}
          isCalculating={isCalculating}
          calculatingLabel={t('dashboard.mc.simulating')}
        />
      ) : null}
    </div>
  );
};
