import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { fr } from './fr';

export const SUPPORTED_LANGS = ['en', 'fr'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const LANG_LABEL: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
};

export const languageFromPathname = (pathname: string): Lang | null => {
  const candidate = pathname.split('/')[1];
  return candidate === 'en' || candidate === 'fr' ? candidate : null;
};

const STORAGE_KEY = 'runaway/lang';

const initialLang = (): Lang => {
  try {
    const requested = new URLSearchParams(window.location.search).get('lang');
    if (requested === 'en' || requested === 'fr') return requested;
    const languageInUrl = languageFromPathname(window.location.pathname);
    if (languageInUrl) return languageInUrl;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
    if (navigator.language?.toLowerCase().startsWith('fr')) return 'fr';
  } catch {
    /* ignore (SSR / blocked storage) */
  }
  return 'en';
};

const resources = {
  en: { translation: en },
  fr: { translation: fr },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

const setDocumentTitle = (lng: string) => {
  document.title =
    resources[lng as Lang]?.translation.appTitle ?? resources.en.translation.appTitle;
};

setDocumentTitle(i18n.language);
document.documentElement.lang = i18n.language;

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  } catch {
    /* ignore */
  }
  setDocumentTitle(lng);
});

export default i18n;
