import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StarIcon } from '@/components/icons';
import { useEntitlements } from '@/hooks/useEntitlements';
import { effectivePrice } from '@/domain/entitlements';
import { startCheckout, openBillingPortal, BillingUnavailableError } from './billingApi';

/**
 * Subscription management on the Account page: shows the current tier and either an
 * Upgrade (free) or Manage-billing (premium) action, both redirecting to Stripe.
 */
export const BillingCard = () => {
  const { t } = useTranslation();
  const { tier, pricing } = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
