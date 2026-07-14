import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
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
      title={t('billing.paywallTitle')}
      description={t(`billing.reason.${reason}`, { max: limits.maxAccounts })}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={close}>
            {t('billing.priceCta', { price, currency: pricing.currency })}
          </Button>
        </>
      }
    >
      <ul className="paywall__benefits">
        <li>{t('billing.benefit.monteCarlo')}</li>
        <li>{t('billing.benefit.accounts')}</li>
        <li>{t('billing.benefit.withdrawal')}</li>
        <li>{t('billing.benefit.plans')}</li>
      </ul>
      <p className="paywall__note">{t('billing.comingSoon')}</p>
    </Modal>
  );
};
