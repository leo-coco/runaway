import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession, signOut } from '@/lib/authClient';
import { GearIcon, InfoIcon, LogOutIcon, UserIcon } from '@/components/icons';
import { SettingsMenu } from '@/features/settings/SettingsMenu';
import { AuthDialog } from './AuthDialog';

const initialsFor = (name?: string | null, email?: string | null) => {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '-';
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return source[0]!.toUpperCase();
};

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

export const AuthMenu = () => {
  const { t } = useTranslation();
  const { data: sessionData, isPending } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = sessionData?.user;
  const initials = initialsFor(user?.name, user?.email);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openSignIn = () => {
    setOpen(false);
    setDialogOpen(true);
  };

  return (
    <div className={`sb-user${open ? ' is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="sb-user__trigger"
        aria-label={user ? t('auth.account') : t('auth.signIn')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={`sb-user__avatar${user ? ' sb-user__avatar--initials' : ''}`}
          aria-hidden="true"
        >
          {user ? initials : <RobotAvatar />}
        </span>
        <span className="sb-user__text">
          <b>{user?.name || t('sidebar.notSignedIn')}</b>
          <span>{user?.email || t('auth.signIn')}</span>
        </span>
      </button>

      {open && (
        <div className="sb-profile-pop" role="menu">
          <div className="sb-profile-pop__head">
            <span className="sb-user__avatar sb-user__avatar--initials" aria-hidden="true">
              {user ? initials : '-'}
            </span>
            <div className="sb-profile-pop__identity">
              <b>{user?.name || t('sidebar.notSignedIn')}</b>
              {user?.email ? <span>{user.email}</span> : null}
            </div>
            <span className="sb-profile-pop__badge" aria-hidden="true">
              W
            </span>
          </div>

          <div className="sb-profile-pop__group">
            {(user as { role?: string } | undefined)?.role === 'admin' && (
              <Link
                to="/admin"
                role="menuitem"
                className="sb-profile-pop__item"
                onClick={() => setOpen(false)}
              >
                <span className="sb-profile-pop__lead">
                  <UserIcon size={16} />
                  <span>{t('admin.title')}</span>
                </span>
              </Link>
            )}
            <SettingsMenu />
            <button type="button" role="menuitem" className="sb-profile-pop__item">
              <span className="sb-profile-pop__lead">
                <GearIcon size={16} />
                <span>{t('settings.title')}</span>
              </span>
            </button>
          </div>

          <div className="sb-profile-pop__group">
            {user ? (
              <button
                type="button"
                role="menuitem"
                className="sb-profile-pop__item"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
              >
                <span className="sb-profile-pop__lead">
                  <LogOutIcon size={16} />
                  <span>{t('auth.signOut')}</span>
                </span>
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="sb-profile-pop__item"
                disabled={isPending}
                onClick={openSignIn}
              >
                <span className="sb-profile-pop__lead">
                  <InfoIcon size={16} />
                  <span>{t('auth.signIn')}</span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {dialogOpen && <AuthDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
};
