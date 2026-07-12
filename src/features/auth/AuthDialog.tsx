import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { authClient, signIn, signUp } from '@/lib/authClient';

type Mode = 'signin' | 'signup' | 'forgot';

export const AuthDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
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
        onClose();
      } else if (mode === 'signup') {
        const { error } = await signUp.email({ email, password, name });
        if (error) throw new Error(error.message ?? t('auth.signUpFailed'));
        setNotice(t('auth.accountCreated'));
        setMode('signin');
      } else {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
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

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && (
          <div className="field">
            <label className="field__label" htmlFor="auth-name">
              {t('auth.name')}
            </label>
            <input
              id="auth-name"
              className="search-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
        )}
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

        {error && <p className="auth-msg auth-msg--error">{error}</p>}
        {notice && <p className="auth-msg auth-msg--ok">{notice}</p>}

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
      </form>
    </Modal>
  );
};
