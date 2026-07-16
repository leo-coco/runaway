import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import premiumMountain from '@/assets/premium-mountain.png';
import { useAppStore } from '@/store';
import { useEntitlements } from '@/hooks/useEntitlements';
import { effectivePrice } from '@/domain/entitlements';

/**
 * Global upgrade paywall. Opened via `openPaywall(reason)` from any gated surface;
 * shows what Premium unlocks + the live price. Phase 1 has no self-serve checkout
 * (Premium is granted from the admin panel), so the CTA is informational; phase 2
 * wires it to Stripe Checkout.
 */
export const PaywallDialog = () => {
  const { t } = useTranslation();
  const reason = useAppStore((s) => s.paywall);
  const close = useAppStore((s) => s.closePaywall);
  const { pricing, limits } = useEntitlements();

  if (!reason) return null;
  const price = effectivePrice(pricing);

  return (
    <Modal
      title={t('billing.premium')}
      onClose={close}
      className="modal--paywall"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('billing.notNow')}
          </Button>
          <Button variant="primary" onClick={close}>
            {t('billing.priceCta', { price, currency: pricing.currency })}
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
      <p className="paywall__note">{t('billing.comingSoon')}</p>
    </Modal>
  );
};
