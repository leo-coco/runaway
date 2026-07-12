import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, LANG_LABEL, type Lang } from '@/i18n';
import { useThemeStore } from '@/store/themeStore';
import { GearIcon, MoonIcon, SunIcon } from '@/components/icons';

/**
 * The gear button sitting at the bottom-right of the sidebar user row. Opens a
 * small popover (above the button, since it lives at the foot of the rail) that
 * hosts the site theme toggle and the language picker — the two controls that
 * used to live as standalone rows in the sidebar.
 */
export const SettingsMenu = () => {
  const { t, i18n } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sb-settings" ref={ref}>
      <button
        type="button"
        className="sb-settings__act"
        aria-label={t('settings.open')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <GearIcon size={17} />
      </button>
      {open && (
        <div className="sb-settings__pop" role="menu">
          <div className="sb-settings__title">{t('settings.title')}</div>

          <div className="sb-settings__row">
            <span className="sb-settings__row-label">{t('theme.label')}</span>
            <button
              type="button"
              className="sb-settings__toggle"
              onClick={toggleTheme}
              aria-label={t(theme === 'dark' ? 'theme.switchToLight' : 'theme.switchToDark')}
            >
              {theme === 'dark' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
              <span>{t(theme === 'dark' ? 'theme.dark' : 'theme.light')}</span>
            </button>
          </div>

          <div className="sb-settings__row sb-settings__row--col">
            <label htmlFor="sb-settings-lang" className="sb-settings__row-label">
              {t('language.label')}
            </label>
            <select
              id="sb-settings-lang"
              className="select"
              value={i18n.resolvedLanguage ?? 'en'}
              onChange={(e) => void i18n.changeLanguage(e.target.value as Lang)}
            >
              {SUPPORTED_LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
