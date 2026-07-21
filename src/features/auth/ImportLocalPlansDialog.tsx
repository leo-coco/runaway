import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { Plan } from '@/domain/plan';

/**
 * Shown once, right after a first sign-in on an account that has no server plans
 * yet, when local (guest) plans exist. Non-destructive: the user chooses.
 */
export const ImportLocalPlansDialog = ({
  plans,
  onDecide,
}: {
  plans: Plan[];
  onDecide: (doImport: boolean) => void | Promise<void>;
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const decide = (doImport: boolean) => {
    setBusy(true);
    void Promise.resolve(onDecide(doImport)).finally(() => setBusy(false));
  };

  return (
    <Modal
      title={t('auth.importTitle')}
      onClose={() => decide(false)}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => decide(false)}>
            {t('auth.importStartFresh')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => decide(true)}>
            {busy ? t('auth.importing') : t('auth.importCta')}
          </Button>
        </>
      }
    >
      {plans.map((plan) => {
        const retireAge =
          plan.settings.currentAge > 0
            ? plan.settings.currentAge + (plan.settings.retirementYear - new Date().getFullYear())
            : null;
        return (
          <div key={plan.id} className="import-plan-card">
            <p className="import-plan-card__name">{plan.name}</p>
            {retireAge !== null && (
              <p className="import-plan-card__sub">
                {t('auth.importPlanRetirement', {
                  age: retireAge,
                  year: plan.settings.retirementYear,
                })}
              </p>
            )}
          </div>
        );
      })}
    </Modal>
  );
};
