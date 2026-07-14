import { useTranslation } from 'react-i18next';
import { StarIcon } from '@/components/icons';

/** Small "Pro" pill marking a premium-only surface. */
export const ProBadge = () => {
  const { t } = useTranslation();
  return (
    <span className="pro-badge">
      <StarIcon size={11} />
      {t('billing.pro')}
    </span>
  );
};
