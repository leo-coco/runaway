import { useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store';
import { useAppMode } from '@/providers/AppModeContext';

/**
 * "Last saved" pill for the active plan. Rendered once in the sidebar (desktop) and
 * once in the mobile header, so it stays visible while browsing any plan page rather
 * than only in the plan topbar.
 */
export const LastSavedBadge = () => {
  const { sandbox } = useAppMode();
  const plans = useAppStore((s) => s.plans);
  const match = useMatch('/plan/:id/*');
  const plan = plans.find((p) => p.id === match?.params.id);
  const { t, i18n } = useTranslation();

  if (sandbox || !plan) return null;

  const lastSaved = new Date(plan.updatedAt);
  if (Number.isNaN(lastSaved.getTime())) return null;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // Compact display: just the time for a save made today, otherwise a short date
  // with no year/time — the pill has to fit a narrow sidebar and a mobile header.
  // The full date + time is still available via the accessible label and title.
  const sameDay = lastSaved.toDateString() === new Date().toDateString();
  const lastSavedLabel = sameDay
    ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(lastSaved)
    : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(lastSaved);
  const lastSavedFull = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(lastSaved);

  return (
    <div
      key={plan.updatedAt}
      className="plan-save-badge"
      role="status"
      aria-label={`${t('plan.lastSaved')} ${lastSavedFull}`}
      title={lastSavedFull}
    >
      <span className="plan-save-badge__dot" aria-hidden="true" />
      <span className="plan-save-badge__label">{t('plan.lastSaved')}</span>
      <time dateTime={plan.updatedAt}>{lastSavedLabel}</time>
    </div>
  );
};
