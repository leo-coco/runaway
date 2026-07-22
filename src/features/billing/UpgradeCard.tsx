import { useTranslation } from 'react-i18next';
import { StarIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store';
import type { PaywallReason } from '@/store/uiSlice';

/**
 * In-place premium upsell shown where a locked feature's content would render
 * (e.g. the Monte Carlo route for free users). Clicking through opens the paywall.
 */
export const UpgradeCard = ({
  reason,
  title,
  body,
}: {
  reason: PaywallReason;
  title: string;
  body: string;
}) => {
  const { t } = useTranslation();
  const openPaywall = useAppStore((s) => s.openPaywall);
  return (
    <div className="upgrade-card">
      <StarIcon size={28} className="upgrade-card__icon" />
      <div className="upgrade-card__title">{title}</div>
      <p className="upgrade-card__body">{body}</p>
      <Button variant="primary" className="premium-cta" onClick={() => openPaywall(reason)}>
        {t('billing.seePlans')}
      </Button>
    </div>
  );
};
