import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ProBadge } from './ProBadge';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useAppStore } from '@/store';

/** Dashboard invitation shown only while the account is on the Free tier. */
export const PremiumBanner = () => {
  const { t } = useTranslation();
  const { tier } = useEntitlements();
  const openPaywall = useAppStore((s) => s.openPaywall);

  if (tier !== 'free') return null;

  return (
    <section className="premium-banner" aria-labelledby="premium-banner-title">
      <div className="premium-banner__copy">
        <div>
          <h2 id="premium-banner-title">
            {t('billing.bannerTitle')} <ProBadge />
          </h2>
          <p>{t('billing.bannerBody')}</p>
        </div>
      </div>
      <Button variant="primary" className="premium-cta" onClick={() => openPaywall('upgrade')}>
        {t('billing.compareCta')}
      </Button>
    </section>
  );
};
