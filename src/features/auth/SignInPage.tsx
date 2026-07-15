import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import authBrand from '@/assets/auth-brand.png';
import { useSession } from '@/lib/authClient';
import { AuthForm, type AuthMode, VerificationSentPanel } from './AuthDialog';

export const SignInPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: sessionData, isPending } = useSession();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const heading =
    mode === 'signin'
      ? t('auth.welcomeBack')
      : mode === 'signup'
        ? t('auth.createTitle')
        : t('auth.resetTitle');
  const description =
    mode === 'signin'
      ? t('auth.signInDescription')
      : mode === 'signup'
        ? t('auth.createDescription')
        : t('auth.resetDescription');

  useEffect(() => {
    document.title = `${t('auth.signIn')} · Runaway`;
  }, [t]);

  if (isPending) return <main className="auth-screen auth-screen--loading" />;
  if (sessionData?.user) return <Navigate to="/" replace />;

  return (
    <main className="auth-screen">
      <section className="auth-screen__hero" aria-label="Runaway">
        <img className="auth-screen__brand-image" src={authBrand} alt="Runaway" />
      </section>

      <section className="auth-screen__panel" aria-label={t('auth.signIn')}>
        <div
          className={`auth-screen__card${verificationEmail ? ' auth-screen__card--verification' : ''}`}
        >
          {verificationEmail ? (
            <VerificationSentPanel
              email={verificationEmail}
              onComplete={() => navigate('/', { replace: true })}
            />
          ) : (
            <>
              <div className="auth-screen__card-heading">
                <p className="auth-screen__eyebrow">RUNAWAY</p>
                <h2>{heading}</h2>
                <p>{description}</p>
              </div>
              <AuthForm
                onSignedIn={() => navigate('/', { replace: true })}
                onModeChange={setMode}
                onVerificationSent={setVerificationEmail}
              />
            </>
          )}
        </div>
        <p className="auth-screen__copyright">© {new Date().getFullYear()} Runaway</p>
      </section>
    </main>
  );
};
