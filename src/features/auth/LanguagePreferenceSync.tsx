import { useEffect } from 'react';
import i18n, { type Lang } from '@/i18n';
import { useSession } from '@/lib/authClient';

const isLanguage = (value: unknown): value is Lang => value === 'en' || value === 'fr';

/** Applies the account preference when a session becomes available. */
export const LanguagePreferenceSync = () => {
  const { data: sessionData, isPending } = useSession();
  const language = sessionData?.user.language;

  useEffect(() => {
    if (!isPending && isLanguage(language) && i18n.resolvedLanguage !== language) {
      void i18n.changeLanguage(language);
    }
  }, [isPending, language]);

  return null;
};
