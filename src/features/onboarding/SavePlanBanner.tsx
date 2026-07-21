import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanContext } from '@/features/portfolio/PlanLayout';
import { AuthDialog } from '@/features/auth/AuthDialog';
import { SAVE_BANNER_DISMISS_KEY } from './saveToAccount';
import { useSaveSandboxPlan } from './useSaveSandboxPlan';

const wasDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(SAVE_BANNER_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Shown under the sandbox result once a guest has a plan (from the quick-start or a
 * loaded example). Converts on the value already delivered: "save this plan" bridges
 * it to the account key and opens sign-up; "continue without an account" keeps the
 * sandbox (which already persists locally).
 */
export const SavePlanBanner = () => {
  const { plan } = usePlanContext();
  const { t } = useTranslation();
  const { save, dialogOpen, closeDialog, goToAccount } = useSaveSandboxPlan(plan);
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (dismissed) return null;

  const onContinue = () => {
    try {
      sessionStorage.setItem(SAVE_BANNER_DISMISS_KEY, '1');
    } catch {
      // Non-fatal: the banner just reappears next load if storage is unavailable.
    }
    setDismissed(true);
  };

  return (
    <>
      <section className="save-banner" aria-live="polite">
        <div className="save-banner__text">
          <span className="save-banner__eyebrow">{t('onboarding.saveBanner.eyebrow')}</span>
          <h2 className="save-banner__title">{t('onboarding.saveBanner.title')}</h2>
          <p className="save-banner__body">{t('onboarding.saveBanner.body')}</p>
        </div>
        <div className="save-banner__actions">
          <button type="button" className="btn btn--primary" onClick={save}>
            {t('onboarding.saveBanner.save')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onContinue}>
            {t('onboarding.saveBanner.continue')}
          </button>
        </div>
      </section>

      {dialogOpen && (
        <AuthDialog initialMode="signup" onClose={closeDialog} onSignedIn={goToAccount} />
      )}
    </>
  );
};
