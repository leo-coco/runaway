import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { successStatus, type SuccessZone } from '@/domain/successRate';
import { useFeature } from '@/hooks/useEntitlements';
import { useAppStore } from '@/store';
import { ProBadge } from '@/features/billing/ProBadge';
import { ShieldIcon, StarIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { usePlanContext } from './PlanLayout';

const ZONE_COLOR: Record<SuccessZone, string> = {
  strong: 'var(--success)',
  borderline: 'var(--amber)',
  weak: 'var(--danger, #f43f5e)',
};

const BADGE_KEY: Record<SuccessZone, string> = {
  strong: 'dashboard.mc.badgeStrong',
  borderline: 'dashboard.mc.badgeBorderline',
  weak: 'dashboard.mc.badgeWeak',
};

const TITLE_KEY: Record<SuccessZone, string> = {
  strong: 'dashboard.mc.titleStrong',
  borderline: 'dashboard.mc.titleBorderline',
  weak: 'dashboard.mc.titleWeak',
};

const DESC_KEY: Record<SuccessZone, string> = {
  strong: 'dashboard.mc.descStrong',
  borderline: 'dashboard.mc.descBorderline',
  weak: 'dashboard.mc.descWeak',
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

  if (!mcEnabled) {
    return (
      <div
        className="hero__card mc-card mc-card--locked"
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
    <div className={cn('hero__card', 'mc-card', sx?.zone === 'weak' && 'hero__card--risk')}>
      <div className="mc-card__text">
        {!hasAssets ? (
          <span className="mc-card__note">{t('dashboard.mc.noData')}</span>
        ) : sx ? (
          <>
            <span className="mc-card__badge" style={{ color: ZONE_COLOR[sx.zone] }}>
              <ShieldIcon size={16} />
              {t(BADGE_KEY[sx.zone])}
            </span>
            <h2 className="mc-card__title">{t(TITLE_KEY[sx.zone])}</h2>
            <p className="mc-card__desc">{t(DESC_KEY[sx.zone], { pct: sx.pct.toFixed(0) })}</p>
            <Link to={`/plan/${plan.id}/monte-carlo`} className="btn btn--accent mc-card__cta">
              {t('dashboard.mc.cta')} →
            </Link>
          </>
        ) : (
          <span className="mc-card__note">{t('dashboard.mc.simulating')}</span>
        )}
      </div>

      {hasAssets && sx ? (
        <div className="mc-card__donut-wrap">
          <div
            className="mc-donut"
            style={{
              ['--mc-pct' as string]: sx.pct,
              ['--mc-color' as string]: ZONE_COLOR[sx.zone],
            }}
          >
            <div className="mc-donut__hole">
              <span className="mc-donut__pct">{sx.pct.toFixed(0)}%</span>
            </div>
          </div>
          <span className="mc-card__donut-label">{t('dashboard.mc.ringLabel')}</span>
        </div>
      ) : null}
    </div>
  );
};
