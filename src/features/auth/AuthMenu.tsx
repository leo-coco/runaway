import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession, signOut } from '@/lib/authClient';
import { AuthDialog } from './AuthDialog';

/**
 * The single account indicator at the bottom of the sidebar. Signed out it reads
 * "Local plan / Not signed in" with a Sign in action; signed in it shows the
 * account and a Sign out action. Reuses the `.sb-user` styling.
 */
export const AuthMenu = () => {
  const { t } = useTranslation();
  const { data: sessionData, isPending } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const user = sessionData?.user;

  return (
    <div className="sb-user">
      <span className="sb-user__avatar" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M5 21a7 7 0 0 1 14 0" />
        </svg>
      </span>
      <span className="sb-user__text">
        {user ? (
          <>
            <b>{user.name || t('auth.account')}</b>
            <span title={user.email}>{user.email}</span>
            <button type="button" className="link-btn sb-user__action" onClick={() => void signOut()}>
              {t('auth.signOut')}
            </button>
          </>
        ) : (
          <>
            <b>{t('sidebar.localPlan')}</b>
            <span>{t('sidebar.notSignedIn')}</span>
            {!isPending && (
              <button
                type="button"
                className="link-btn sb-user__action"
                onClick={() => setDialogOpen(true)}
              >
                {t('auth.signIn')}
              </button>
            )}
          </>
        )}
      </span>
      {dialogOpen && <AuthDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
};
