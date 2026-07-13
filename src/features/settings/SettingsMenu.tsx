import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, LANG_LABEL, type Lang } from '@/i18n';
import { useThemeStore, resolveTheme, type Theme } from '@/store/themeStore';
import { ChevronRightIcon, GearIcon, MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';

/**
 * The gear button sitting at the bottom-right of the sidebar user row. Opens a
 * small popover (above the button, since it lives at the foot of the rail) that
 * hosts the appearance control and the language picker. Appearance is a nested
 * flyout (Light / Dark / System) opening to the side, per the design system.
 */
type AppearanceOption = { value: Theme; labelKey: string; Icon: typeof SunIcon };

const SYSTEM_OPTION: AppearanceOption = {
  value: 'system',
  labelKey: 'theme.system',
  Icon: MonitorIcon,
};
const APPEARANCE_OPTIONS: AppearanceOption[] = [
  { value: 'light', labelKey: 'theme.light', Icon: SunIcon },
  { value: 'dark', labelKey: 'theme.dark', Icon: MoonIcon },
  SYSTEM_OPTION,
];

export const SettingsMenu = () => {
  const { t, i18n } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
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

  const activeOption = APPEARANCE_OPTIONS.find((o) => o.value === theme) ?? SYSTEM_OPTION;
  // The icon on the collapsed row reflects what's actually showing on screen.
  const ResolvedIcon = resolveTheme(theme) === 'dark' ? MoonIcon : SunIcon;

  return (
    <div className="sb-settings" ref={ref}>
      <button
        type="button"
        className="sb-settings__act"
        aria-label={t('settings.open')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          // Always start the reopened popover with the nested flyout collapsed.
          setAppearanceOpen(false);
          setOpen((o) => !o);
        }}
      >
        <GearIcon size={17} />
      </button>
      {open && (
        <div className="sb-settings__pop" role="menu">
          <div className="sb-settings__title">{t('settings.title')}</div>

          {/* Appearance — opens a nested Light/Dark/System flyout to the side. */}
          <div className="sb-settings__flyout">
            <button
              type="button"
              className="sb-settings__flyout-trigger"
              aria-haspopup="menu"
              aria-expanded={appearanceOpen}
              onClick={() => setAppearanceOpen((o) => !o)}
            >
              <span className="sb-settings__flyout-lead">
                <ResolvedIcon size={16} />
                <span>{t('theme.appearance')}</span>
              </span>
              <span className="sb-settings__flyout-trail">
                <span className="sb-settings__flyout-value">{t(activeOption.labelKey)}</span>
                <ChevronRightIcon size={15} />
              </span>
            </button>
            {appearanceOpen && (
              <div className="sb-settings__submenu" role="menu">
                {APPEARANCE_OPTIONS.map(({ value, labelKey, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === value}
                    className="sb-settings__option"
                    onClick={() => {
                      setTheme(value);
                      setAppearanceOpen(false);
                    }}
                  >
                    <Icon size={16} />
                    <span className="sb-settings__option-label">{t(labelKey)}</span>
                    <span
                      className="sb-settings__radio"
                      data-checked={theme === value ? 'true' : 'false'}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            )}
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
