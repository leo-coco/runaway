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
  const [sessionCheckTimedOut, setSessionCheckTimedOut] = useState(false);
  const initialMode: AuthMode =
    window.location.pathname.endsWith('/signup') ||
    new URLSearchParams(window.location.search).get('mode') === 'signup'
      ? 'signup'
      : 'signin';
  const [mode, setMode] = useState<AuthMode>(initialMode);
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

  useEffect(() => {
    if (!isPending) return;
    // A slow or cold-starting session check shouldn't block the form
    // indefinitely; fall back to showing it and let sign-in itself fail
    // loudly if something is actually wrong.
    const timer = window.setTimeout(() => setSessionCheckTimedOut(true), 5000);
    return () => window.clearTimeout(timer);
  }, [isPending]);

  if (isPending && !sessionCheckTimedOut)
    return <main className="auth-screen auth-screen--loading" />;
  if (sessionData?.user) return <Navigate to="/" replace />;

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

      <section className="auth-screen__panel" aria-label={t('auth.signIn')}>
        <div
          className={`auth-screen__card${verificationEmail ? ' auth-screen__card--verification' : ''}`}
        >
          {verificationEmail ? (
            <VerificationSentPanel
              email={verificationEmail}
              onComplete={() => {
                setVerificationEmail(null);
                setMode('signin');
                navigate('/signin', { replace: true });
              }}
            />
          ) : (
            <>
              <div className="auth-screen__card-heading">
                <p className="auth-screen__eyebrow">RUNAWAY</p>
                <h2>{heading}</h2>
                <p>{description}</p>
              </div>
              <AuthForm
                initialMode={initialMode}
                onSignedIn={() => navigate('/', { replace: true })}
                onModeChange={(nextMode) => {
                  setMode(nextMode);
                  if (nextMode === 'signup' || nextMode === 'signin') {
                    navigate(`/${nextMode}`, { replace: true });
                  }
                }}
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
