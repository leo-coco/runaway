import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { authClient, signIn, signUp } from '@/lib/authClient';
import authBrand from '@/assets/auth-brand.png';

export type AuthMode = 'signin' | 'signup' | 'forgot';

type AuthFormProps = {
  onSignedIn?: () => void;
  onModeChange?: (mode: AuthMode) => void;
  onVerificationSent?: (email: string) => void;
  showTitle?: boolean;
};

type VerificationSentPanelProps = {
  email: string;
  onComplete: () => void;
};

export const VerificationSentPanel = ({ email, onComplete }: VerificationSentPanelProps) => {
  const { t } = useTranslation();

  return (
    <section className="auth-verification-sent" aria-live="polite">
      <div className="auth-verification-sent__media">
        <img className="auth-verification-sent__image" src="/verification-email-hero.png" alt="" />
      </div>
      <div className="auth-verification-sent__content">
        <p className="auth-verification-sent__message">{t('auth.verificationSentMessage')}</p>
        <p className="auth-verification-sent__email">{email}</p>
        <p className="auth-verification-sent__hint">{t('auth.verificationSentHint')}</p>
        <button type="button" className="link-btn" onClick={onComplete}>
          {t('auth.verificationComplete')}
        </button>
      </div>
    </section>
  );
};

/** Shared by the compact account dialog and the full sign-in page. */
export const AuthForm = ({
  onSignedIn,
  onModeChange,
  onVerificationSent,
  showTitle = false,
}: AuthFormProps) => {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const title =
    mode === 'signin'
      ? t('auth.signIn')
      : mode === 'signup'
        ? t('auth.createTitle')
        : t('auth.resetTitle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await signIn.email({ email, password });
        if (error) throw new Error(error.message ?? t('auth.signInFailed'));
        onSignedIn?.();
      } else if (mode === 'signup') {
        const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
        // Better Auth stores a required display name, so derive it from the e-mail.
        const displayName = email.trim().split('@')[0] || 'Member';
        const { error } = await signUp.email({
          email,
          password,
          name: displayName,
          language,
          taxResidence: 'US',
        });
        if (error) throw new Error(error.message ?? t('auth.signUpFailed'));
        const normalizedEmail = email.trim();
        if (onVerificationSent) onVerificationSent(normalizedEmail);
        else setVerificationEmail(normalizedEmail);
      } else {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/${i18n.resolvedLanguage === 'fr' ? 'fr' : 'en'}/reset-password`,
        });
        if (error) throw new Error(error.message ?? t('auth.requestFailed'));
        setNotice(t('auth.resetLinkSent'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: AuthMode) => {
    setMode(m);
    onModeChange?.(m);
    setError(null);
    setNotice(null);
  };

  if (verificationEmail)
    return (
      <VerificationSentPanel email={verificationEmail} onComplete={() => switchTo('signin')} />
    );

  return (
    <form onSubmit={submit} className="auth-form">
      {showTitle && <h2 className="auth-form__title">{title}</h2>}
      <div className="auth-form__fields">
        <div className="field">
          <label className="field__label" htmlFor="auth-email">
            {t('auth.email')}
          </label>
          <input
            id="auth-email"
            className="search-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        {mode !== 'forgot' && (
          <div className="field">
            <label className="field__label" htmlFor="auth-password">
              {t('auth.password')}
            </label>
            <input
              id="auth-password"
              className="search-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </div>
        )}
      </div>

      {error && <p className="auth-msg auth-msg--error">{error}</p>}
      {notice && <p className="auth-msg auth-msg--ok">{notice}</p>}

      <div className="auth-form__actions">
        <Button type="submit" variant="primary" disabled={busy} className="auth-submit">
          {busy ? t('auth.pleaseWait') : title}
        </Button>

        <div className="auth-links">
          {mode === 'signin' ? (
            <>
              <button type="button" className="link-btn" onClick={() => switchTo('signup')}>
                {t('auth.signUp')}
              </button>
              <button type="button" className="link-btn" onClick={() => switchTo('forgot')}>
                {t('auth.forgotPassword')}
              </button>
            </>
          ) : (
            <button type="button" className="link-btn" onClick={() => switchTo('signin')}>
              {t('auth.backToSignIn')}
            </button>
          )}
        </div>
      </div>
    </form>
  );
};

export const AuthDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <Modal title={t('auth.account')} onClose={onClose} wide className="auth-dialog">
      <div className="auth-dialog__content">
        <div className="auth-dialog__visual" aria-hidden="true">
          <img src={authBrand} alt="" />
        </div>
        <AuthForm onSignedIn={onClose} showTitle />
      </div>
    </Modal>
  );
};
