import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContactModal } from '@/features/contact/ContactModal';
import { useAppMode } from '@/providers/AppModeContext';

/**
 * Global app footer: copyright, the standard hypothetical-projections disclaimer,
 * and a contact link.
 */
export const Footer = () => {
  const { t, i18n } = useTranslation();
  const { sandbox } = useAppMode();
  const year = new Date().getFullYear();
  const [contactOpen, setContactOpen] = useState(false);
  // The legal pages are static Astro routes outside the SPA, so these are plain
  // full-page links rather than router navigations.
  const isFr = i18n.resolvedLanguage === 'fr';
  const legalPath = (frenchPath: string, englishPath: string) =>
    isFr ? frenchPath : `/en${englishPath}`;

  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <p className="app-footer__disclaimer">
          <b>{t('plan.disclaimerLabel')}</b> {t('plan.disclaimer')}
        </p>
        <div className="app-footer__row">
          <span className="app-footer__copyright">
            {t('footer.copyright', { year, title: t('appTitle') })}
          </span>
          <div className="app-footer__links">
            <a className="app-footer__link" href={legalPath('/confidentialite', '/privacy')}>
              {t('footer.privacyLink')}
            </a>
            <a className="app-footer__link" href={legalPath('/mentions-legales', '/legal-notice')}>
              {t('footer.legalNoticeLink')}
            </a>
            <a className="app-footer__link" href={legalPath('/conditions-utilisation', '/terms')}>
              {t('footer.termsLink')}
            </a>
            <a className="app-footer__link" href={legalPath('/conditions-vente', '/sales-terms')}>
              {t('footer.salesTermsLink')}
            </a>
            {!sandbox && (
              <button
                type="button"
                className="app-footer__link app-footer__link--button"
                onClick={() => setContactOpen(true)}
              >
                {t('footer.contactLink')}
              </button>
            )}
          </div>
        </div>
      </div>
      {!sandbox && contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </footer>
  );
};
