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
      title={t('billing.premium')}
      onClose={close}
      className="modal--paywall"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {t('billing.notNow')}
          </Button>
          <Button variant="primary" onClick={() => void upgrade()} disabled={busy || unavailable}>
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
        <p className="paywall__eyebrow">{t('billing.unlock')}</p>
        <h3 className="paywall__heading">{t('billing.paywallTitle')}</h3>
        <p className="paywall__reason">
          {t(`billing.reason.${reason}`, { max: limits.maxAccounts })}
        </p>
        <ul className="paywall__benefits">
          <li>{t('billing.benefit.monteCarlo')}</li>
          <li>{t('billing.benefit.accounts')}</li>
          <li>{t('billing.benefit.withdrawal')}</li>
          <li>{t('billing.benefit.plans')}</li>
        </ul>
      </div>
      {error && <p className="paywall__note field-error">{error}</p>}
      {unavailable && <p className="paywall__note">{t('billing.comingSoon')}</p>}
    </Modal>
  );
};
