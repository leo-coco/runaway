import { Link, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Global app footer: copyright, the standard hypothetical-projections disclaimer,
 * and a link to the methodology page. The methodology link is plan-scoped, so it
 * only appears while a plan is open (matches the same `/plan/:id/*` pattern the
 * sidebar nav uses to know the active plan).
 */
export const Footer = () => {
  const { t } = useTranslation();
  const match = useMatch('/plan/:id/*');
  const activeId = match?.params.id;
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer__row">
        <span className="app-footer__copyright">{t('footer.copyright', { year })}</span>
        {activeId && (
          <Link to={`/plan/${activeId}/methodology`} className="app-footer__link">
            {t('footer.methodologyLink')}
          </Link>
        )}
      </div>
      <p className="app-footer__disclaimer">
        <b>{t('plan.disclaimerLabel')}</b> {t('plan.disclaimer')}
      </p>
    </footer>
  );
};
