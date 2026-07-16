import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import authBrand from '@/assets/auth-brand.png';
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

  useEffect(() => {
    document.title = `${t('auth.resetCta')} · Runaway`;
  }, [t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token: token ?? undefined,
      });
      if (error) throw new Error(error.message ?? t('auth.resetFailed'));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-screen__hero" aria-label="Runaway">
        <img
          className="auth-screen__brand-image"
          src={authBrand.src}
          width={authBrand.width}
          height={authBrand.height}
          alt="Runaway"
        />
      </section>

      <section className="auth-screen__panel" aria-label={t('auth.resetCta')}>
        <div className="auth-screen__card auth-screen__card--reset">
          <div className="auth-screen__reset-banner">
            <img src="/password-reset-email-hero.png" alt="" />
          </div>
          <div className="auth-screen__reset-content">
            {done ? (
              <div className="auth-screen__card-heading">
                <p className="auth-screen__eyebrow">RUNAWAY</p>
                <h2>{t('auth.resetDone')}</h2>
                <div className="auth-form__actions">
                  <Button
                    variant="primary"
                    className="auth-submit"
                    onClick={() => void navigate('/')}
                  >
                    {t('auth.resetContinue')}
                  </Button>
                </div>
              </div>
            ) : !token ? (
              <div className="auth-screen__card-heading">
                <p className="auth-screen__eyebrow">RUNAWAY</p>
                <h2>{t('auth.invalidToken')}</h2>
                <div className="auth-form__actions">
                  <Button
                    variant="primary"
                    className="auth-submit"
                    onClick={() => void navigate('/signin')}
                  >
                    {t('auth.backToSignIn')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="auth-screen__card-heading">
                  <p className="auth-screen__eyebrow">RUNAWAY</p>
                  <h2>{t('auth.resetTitle')}</h2>
                  <p>{t('auth.resetPasswordDescription')}</p>
                </div>

                <form onSubmit={submit} className="auth-form">
                  <div className="auth-form__fields">
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
                  </div>
                  {error && <p className="auth-msg auth-msg--error">{error}</p>}
                  <div className="auth-form__actions">
                    <Button type="submit" variant="primary" disabled={busy} className="auth-submit">
                      {busy ? t('auth.resetSaving') : t('auth.resetCta')}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
        <p className="auth-screen__copyright">© {new Date().getFullYear()} Runaway</p>
      </section>
    </main>
  );
};
