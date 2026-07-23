import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import premiumMountain from '@/assets/premium-mountain.png';
import { useAppStore } from '@/store';
import { useSession } from '@/lib/authClient';
import { useEntitlements } from '@/hooks/useEntitlements';
import { effectivePrice } from '@/domain/entitlements';
import { startCheckout, BillingUnavailableError } from './billingApi';
import { ProBadge } from './ProBadge';

/**
 * Global upgrade paywall. Opened via `openPaywall(reason)` from any gated surface;
 * shows what Premium unlocks + the live price. The CTA starts Stripe Checkout for
 * signed-in users (routing guests to sign-in first). When billing isn't configured
 * server-side it falls back to the informational "coming soon" note.
 */
export const PaywallDialog = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const reason = useAppStore((s) => s.paywall);
  const close = useAppStore((s) => s.closePaywall);
  const { pricing, limits } = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!reason) return null;
  const price = effectivePrice(pricing);
  const comparisonRows = [
    { feature: 'projection', free: '✓', premium: '✓', freeStatus: 'yes' },
    { feature: 'monteCarlo', free: '—', premium: '✓', freeStatus: 'no' },
    {
      feature: 'accountTax',
      free: t('billing.comparison.limit', { count: limits.maxAccounts }),
      premium: t('billing.comparison.unlimited'),
      freeStatus: 'limit',
    },
    { feature: 'withdrawal', free: '—', premium: '✓', freeStatus: 'no' },
    { feature: 'realEstate', free: '—', premium: '✓', freeStatus: 'no' },
    { feature: 'phased', free: '—', premium: '✓', freeStatus: 'no' },
    {
      feature: 'plans',
      free: t('billing.comparison.limit', { count: limits.maxPlans }),
      premium: t('billing.comparison.unlimited'),
      freeStatus: 'limit',
    },
    {
      feature: 'assets',
      free: t('billing.comparison.limit', { count: limits.maxAssets }),
      premium: t('billing.comparison.unlimited'),
      freeStatus: 'limit',
    },
  ] as const;

  const upgrade = async () => {
    if (!session?.user) {
      close();
      navigate('/signin');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startCheckout();
    } catch (err) {
      if (err instanceof BillingUnavailableError) setUnavailable(true);
      else setError(t('billing.checkoutError'));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('billing.compareTitle')}
      onClose={close}
      className="modal--paywall"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {t('billing.notNow')}
          </Button>
          <Button
            variant="primary"
            className="premium-cta"
            onClick={() => void upgrade()}
            disabled={busy || unavailable}
          >
            {busy
              ? t('billing.redirecting')
              : t('billing.priceCta', { price, currency: pricing.currency })}
          </Button>
        </>
      }
    >
      <div className="paywall__banner" aria-hidden="true">
        <img
          src={premiumMountain.src}
          width={premiumMountain.width}
          height={premiumMountain.height}
          alt=""
        />
      </div>
      <div className="paywall__content">
        <p className="paywall__eyebrow">
          {t('billing.unlock')} <ProBadge />
        </p>
        <div className="paywall__comparison" role="table" aria-label={t('billing.compareTitle')}>
          <div className="paywall__comparison-row paywall__comparison-row--head" role="row">
            <span role="columnheader">{t('billing.compareFeature')}</span>
            <span role="columnheader">{t('billing.free')}</span>
            <span role="columnheader">{t('billing.premium')}</span>
          </div>
          {comparisonRows.map((row) => (
            <div className="paywall__comparison-row" role="row" key={row.feature}>
              <span role="cell">{t(`billing.comparison.${row.feature}`)}</span>
              <span role="cell" className={`paywall__comparison-${row.freeStatus}`}>
                {row.free}
              </span>
              <span role="cell" className="paywall__comparison-yes">
                {row.premium}
              </span>
            </div>
          ))}
        </div>
      </div>
      {error && <p className="paywall__note field-error">{error}</p>}
      {unavailable && <p className="paywall__note">{t('billing.comingSoon')}</p>}
    </Modal>
  );
};
