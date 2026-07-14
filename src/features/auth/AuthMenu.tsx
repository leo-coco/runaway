import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession, signOut } from '@/lib/authClient';
import { SettingsMenu } from '@/features/settings/SettingsMenu';
import { AuthDialog } from './AuthDialog';

/** Two-letter initials from a name ("John Doe" -> "JD"), else the first email
 *  character, else a neutral dash. */
const initialsFor = (name?: string | null, email?: string | null) => {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '—';
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return source[0]!.toUpperCase();
};

/** Friendly robot persona shown while signed out, in place of a real avatar. */
const RobotAvatar = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 8V4" />
    <circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="13" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="13" r="1.1" fill="currentColor" stroke="none" />
    <path d="M9.5 16.3h5" />
    <path d="M4 12H2.5M20 12h1.5" />
  </svg>
);

/**
 * The account row at the bottom of the sidebar. Signed out it shows a robot
 * persona avatar and an accent Sign in button; signed in it shows the account
 * initials, name/email and a Sign out action. A settings gear on the right opens
 * the theme/language menu. Reuses `.sb-user`.
 */
export const AuthMenu = () => {
  const { t } = useTranslation();
  const { data: sessionData, isPending } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const user = sessionData?.user;

  return (
    <div className="sb-user">
      <span
        className={`sb-user__avatar${user ? ' sb-user__avatar--initials' : ''}`}
        aria-hidden="true"
      >
        {user ? initialsFor(user.name, user.email) : <RobotAvatar />}
      </span>
      {user ? (
        <span className="sb-user__text">
          <b>{user.name || t('auth.account')}</b>
          <span title={user.email}>{user.email}</span>
          {(user as { role?: string }).role === 'admin' && (
            <Link to="/admin" className="link-btn sb-user__action">
              {t('admin.title')}
            </Link>
          )}
          <button type="button" className="link-btn sb-user__action" onClick={() => void signOut()}>
            {t('auth.signOut')}
          </button>
        </span>
      ) : (
        !isPending && (
          <button
            type="button"
            className="btn btn--accent btn--sm sb-user__signin"
            onClick={() => setDialogOpen(true)}
          >
            {t('auth.signIn')}
          </button>
        )
      )}
      <SettingsMenu />
      {dialogOpen && <AuthDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
};
