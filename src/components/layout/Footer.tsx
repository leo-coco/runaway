import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContactModal } from '@/features/contact/ContactModal';
import { useAppMode } from '@/providers/AppModeContext';

/**
 * Global app footer: copyright, the standard hypothetical-projections disclaimer,
 * and a contact link.
 */
export const Footer = () => {
  const { t } = useTranslation();
  const { sandbox } = useAppMode();
  const year = new Date().getFullYear();
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <p className="app-footer__disclaimer">
          <b>{t('plan.disclaimerLabel')}</b> {t('plan.disclaimer')}
        </p>
        <div className="app-footer__row">
          <span className="app-footer__copyright">
            {t('footer.copyright', { year, title: t('appTitle') })}
            {' · '}
            {t('footer.privacyNote')}
          </span>
          {!sandbox && (
            <div className="app-footer__links">
              <button
                type="button"
                className="app-footer__link app-footer__link--button"
                onClick={() => setContactOpen(true)}
              >
                {t('footer.contactLink')}
              </button>
            </div>
          )}
        </div>
      </div>
      {!sandbox && contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </footer>
  );
};
