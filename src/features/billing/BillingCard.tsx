import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
    <Card
      padded
      className={`account-card billing-card${isPremium ? ' billing-card--premium' : ''}`}
    >
      <div className="billing-card__head">
        <div>
          <p className="billing-card__eyebrow">{t('billing.subscriptionTitle')}</p>
          <h2>{isPremium ? t('billing.premium') : t('billing.free')}</h2>
          <p className="billing-card__description">
            {isPremium
              ? t('billing.premiumActiveDescription')
              : `${t('billing.currentPlan')}: ${t('billing.free')}`}
          </p>
        </div>
        {isPremium && <span className="billing-card__status">{t('billing.active')}</span>}
      </div>

      <div className="account-card__actions billing-card__actions">
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
