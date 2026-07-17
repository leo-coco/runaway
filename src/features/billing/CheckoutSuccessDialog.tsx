import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import premiumMountain from '@/assets/premium-mountain.png';
import { useSession } from '@/lib/authClient';
import { queryKeys } from '@/providers/queryKeys';

/** Displays after Stripe Checkout, independently of the page the customer lands on. */
export const CheckoutSuccessDialog = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [checkoutSucceeded] = useState(
    () => new URLSearchParams(window.location.search).get('checkout') === 'success',
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!checkoutSucceeded) return;
    if (session?.user?.id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.entitlements(session.user.id) });
    }

    const params = new URLSearchParams(window.location.search);
    params.delete('checkout');
    const search = params.size > 0 ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', `${window.location.pathname}${search}`);
  }, [checkoutSucceeded, queryClient, session?.user?.id]);

  if (!checkoutSucceeded || dismissed) return null;

  return (
    <Modal
      title={t('billing.checkoutSuccessTitle')}
      onClose={() => setDismissed(true)}
      className="modal--checkout-success"
      footer={
        <Button variant="primary" onClick={() => setDismissed(true)}>
          {t('billing.checkoutSuccessCta')}
        </Button>
      }
    >
      <div className="checkout-success__banner" aria-hidden="true">
        <img
          src={premiumMountain.src}
          width={premiumMountain.width}
          height={premiumMountain.height}
          alt=""
        />
      </div>
      <div className="checkout-success__content">
        <p>{t('billing.checkoutSuccessBody')}</p>
      </div>
    </Modal>
  );
};
