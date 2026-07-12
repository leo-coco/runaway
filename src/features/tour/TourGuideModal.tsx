import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { TourPage } from './tourSteps';
import { useTour } from './TourProvider';

interface Props {
  onClose: () => void;
}

const GUIDES: readonly { key: TourPage; titleKey: string; descKey: string }[] = [
  { key: 'dashboard', titleKey: 'tour.picker.dashboardTitle', descKey: 'tour.picker.dashboardDesc' },
  { key: 'projection', titleKey: 'tour.picker.projectionTitle', descKey: 'tour.picker.projectionDesc' },
  {
    key: 'monte-carlo',
    titleKey: 'tour.picker.monteCarloTitle',
    descKey: 'tour.picker.monteCarloDesc',
  },
];

/** Lets the user pick which of the three independent guides to run. */
export const TourGuideModal = ({ onClose }: Props) => {
  const { t } = useTranslation();
  const { startTour } = useTour();

  const start = (guide: TourPage) => {
    onClose();
    startTour(guide);
  };

  return (
    <Modal title={t('tour.picker.title')} onClose={onClose} wide>
      <div className="tour-picker">
        {GUIDES.map((g) => (
          <div className="tour-picker__card card card--pad" key={g.key}>
            <h3 className="tour-picker__title">{t(g.titleKey)}</h3>
            <p className="tour-picker__desc">{t(g.descKey)}</p>
            <Button variant="accent" size="sm" onClick={() => start(g.key)}>
              {t('tour.picker.start')}
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
};
