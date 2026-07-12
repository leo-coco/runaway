import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { authClient } from '@/lib/authClient';

/** Landing page for the reset link Resend delivered (URL carries ?token=…). */
export const ResetPasswordPage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return <p className="auth-page">{t('auth.invalidToken')}</p>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) throw new Error(error.message ?? t('auth.resetFailed'));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="auth-page">
        <p>{t('auth.resetDone')}</p>
        <Button variant="primary" onClick={() => void navigate('/')}>
          {t('auth.resetContinue')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="auth-page auth-form">
      <h2 style={{ margin: 0 }}>{t('auth.resetTitle')}</h2>
      <div className="field">
        <label className="field__label" htmlFor="reset-password">
          {t('auth.newPassword')}
        </label>
        <input
          id="reset-password"
          className="search-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {error && <p className="auth-msg auth-msg--error">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? t('auth.resetSaving') : t('auth.resetCta')}
      </Button>
    </form>
  );
};
