import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Plan } from '@/domain/plan';
import { languageFromPathname } from '@/i18n';
import { bridgeSandboxPlanToAccount } from './saveToAccount';

/**
 * "Save my plan for free" behaviour shared by the quick-start result step and the
 * dashboard save banner: bridge the sandbox plan into the account storage key, then
 * open sign-up. The bridge runs at click time (before email verification completes)
 * because the sandbox surface may unmount before a session exists. The caller renders
 * the `AuthDialog` itself using `dialogOpen` / `closeDialog` / `goToAccount`.
 */
export const useSaveSandboxPlan = (plan: Plan) => {
  const { i18n } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const goToAccount = () => {
    const lang =
      languageFromPathname(window.location.pathname) ??
      (i18n.resolvedLanguage === 'fr' ? 'fr' : 'en');
    window.location.assign(`/${lang}/app`);
  };

  const save = () => {
    bridgeSandboxPlanToAccount(plan);
    setDialogOpen(true);
  };

  return { save, dialogOpen, closeDialog: () => setDialogOpen(false), goToAccount };
};
