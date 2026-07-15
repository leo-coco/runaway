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

const STORAGE_KEY = 'runaway/lang';

const initialLang = (): Lang => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
    if (navigator.language?.toLowerCase().startsWith('fr')) return 'fr';
  } catch {
    /* ignore (SSR / blocked storage) */
  }
  return 'en';
};

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  } catch {
    /* ignore */
  }
});

export default i18n;
