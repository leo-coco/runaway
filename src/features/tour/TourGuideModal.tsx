import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ProBadge } from '@/features/billing/ProBadge';
import type { TierFeatures } from '@/domain/entitlements';
import type { PaywallReason } from '@/store/uiSlice';
import type { TourGuideId } from './tourSteps';
import { useTour } from './TourProvider';

interface Props {
  onClose: () => void;
}

/** A guide may require a premium feature; the Monte Carlo guide sits behind it. */
interface GuideEntry {
  key: TourGuideId;
  titleKey: string;
  descKey: string;
  requires?: keyof TierFeatures & PaywallReason;
}

const GUIDES: readonly GuideEntry[] = [
  {
    key: 'dashboard',
    titleKey: 'tour.picker.dashboardTitle',
    descKey: 'tour.picker.dashboardDesc',
  },
  {
    key: 'projection',
    titleKey: 'tour.picker.projectionTitle',
    descKey: 'tour.picker.projectionDesc',
  },
  {
    key: 'monte-carlo',
    titleKey: 'tour.picker.monteCarloTitle',
    descKey: 'tour.picker.monteCarloDesc',
    requires: 'monteCarlo',
  },
];

/** Lets the user pick which of the three independent guides to run. */
export const TourGuideModal = ({ onClose }: Props) => {
  const { t } = useTranslation();
  const { startTour } = useTour();
  const openPaywall = useAppStore((s) => s.openPaywall);
  const { features } = useEntitlements();

  const start = (guide: TourGuideId) => {
    onClose();
    startTour(guide);
  };

  return (
    <Modal title={t('tour.picker.title')} onClose={onClose} wide>
      <div className="tour-picker">
        {GUIDES.map((g) => {
          // The MC guide walks the (premium) Monte Carlo page, so it stays locked
          // for free even though the dashboard/projection guides are open.
          const locked = g.requires ? !features[g.requires] : false;
          return (
            <div className="tour-picker__card card card--pad" key={g.key}>
              <h3 className="tour-picker__title">
                {t(g.titleKey)}
                {locked && <ProBadge />}
              </h3>
              <p className="tour-picker__desc">{t(g.descKey)}</p>
              <Button
                variant="accent"
                size="sm"
                onClick={() => (locked && g.requires ? openPaywall(g.requires) : start(g.key))}
              >
                {t('tour.picker.start')}
              </Button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
