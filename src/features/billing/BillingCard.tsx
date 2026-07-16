import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StarIcon } from '@/components/icons';
import { useSession } from '@/lib/authClient';
import { useEntitlements } from '@/hooks/useEntitlements';
import { effectivePrice } from '@/domain/entitlements';
import { queryKeys } from '@/providers/queryKeys';
import { startCheckout, openBillingPortal, BillingUnavailableError } from './billingApi';

/**
 * Subscription management on the Account page: shows the current tier and either an
 * Upgrade (free) or Manage-billing (premium) action, both redirecting to Stripe.
 * Also reconciles the client after a checkout return: Stripe sends the user back to
 * `/account?checkout=success`, and since the tier is written asynchronously by the
 * webhook we invalidate the cached entitlements so the new tier appears once it lands.
 */
export const BillingCard = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { tier, pricing } = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;
    if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.entitlements(userId) });
    // Drop the marker so a refresh doesn't re-trigger the refetch.
    window.history.replaceState({}, '', window.location.pathname);
  }, [queryClient, userId]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof BillingUnavailableError) setUnavailable(true);
      else setError(t('billing.checkoutError'));
      setBusy(false);
    }
  };

  const isPremium = tier === 'premium';
  const price = effectivePrice(pricing);

  return (
    <Card padded className="account-card">
      <div className="account-card__head">
        <div>
          <h2>{t('billing.subscriptionTitle')}</h2>
          <p>
            {t('billing.currentPlan')}:{' '}
            <strong>{isPremium ? t('billing.premium') : t('billing.free')}</strong>
          </p>
        </div>
        {isPremium && <StarIcon size={22} aria-hidden="true" />}
      </div>

      <div className="account-card__actions">
        {isPremium ? (
          <Button
            variant="default"
            disabled={busy || unavailable}
            onClick={() => void run(openBillingPortal)}
          >
            {busy ? t('billing.redirecting') : t('billing.manageBilling')}
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={busy || unavailable}
            onClick={() => void run(startCheckout)}
          >
            {busy
              ? t('billing.redirecting')
              : t('billing.priceCta', { price, currency: pricing.currency })}
          </Button>
        )}
        {error && <span className="field-error">{error}</span>}
        {unavailable && <span className="field__hint">{t('billing.comingSoon')}</span>}
      </div>
    </Card>
  );
};
