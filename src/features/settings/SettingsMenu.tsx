import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient, useSession } from '@/lib/authClient';
import { SUPPORTED_LANGS, LANG_LABEL, type Lang } from '@/i18n';
import { useThemeStore, resolveTheme, type Theme } from '@/store/themeStore';
import {
  ChevronRightIcon,
  GlobeIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SunIcon,
} from '@/components/icons';
import { useAppMode } from '@/providers/AppModeContext';

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
  const { data: sessionData } = useSession();
  const { sandbox } = useAppMode();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [submenu, setSubmenu] = useState<'appearance' | 'language' | null>(null);

  const resolvedLanguage = (i18n.resolvedLanguage ?? 'en') as Lang;
  const ResolvedIcon = resolveTheme(theme) === 'dark' ? MoonIcon : SunIcon;

  const selectLanguage = async (language: Lang) => {
    if (!sandbox && sessionData?.user) {
      const { error } = await authClient.updateUser({ language });
      if (error) console.error('[language] failed to save user preference', error);
    }
    await i18n.changeLanguage(language);
    const localizedPath = window.location.pathname.replace(
      /^\/(?:en|fr)(?=\/app(?:\/|$))/,
      `/${language}`,
    );
    window.location.assign(`${localizedPath}${window.location.search}${window.location.hash}`);
  };

  return (
    <div className="sb-settings" onMouseLeave={() => setSubmenu(null)}>
      <div className="sb-settings__flyout">
        <button
          type="button"
          className="sb-profile-pop__item"
          aria-haspopup="menu"
          aria-expanded={submenu === 'appearance'}
          onMouseEnter={() => setSubmenu('appearance')}
          onFocus={() => setSubmenu('appearance')}
          onClick={() => setSubmenu((current) => (current === 'appearance' ? null : 'appearance'))}
        >
          <span className="sb-profile-pop__lead">
            <PaletteIcon size={16} />
            <span>{t('theme.appearance')}</span>
          </span>
          <span className="sb-profile-pop__trail">
            <ResolvedIcon size={14} />
            <ChevronRightIcon size={16} />
          </span>
        </button>

        {submenu === 'appearance' && (
          <div className="sb-settings__submenu" role="menu">
            {APPEARANCE_OPTIONS.map(({ value, labelKey, Icon }) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={theme === value}
                className="sb-settings__option"
                onClick={() => setTheme(value)}
              >
                <Icon size={15} />
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

      <div className="sb-settings__flyout">
        <button
          type="button"
          className="sb-profile-pop__item"
          aria-haspopup="menu"
          aria-expanded={submenu === 'language'}
          onMouseEnter={() => setSubmenu('language')}
          onFocus={() => setSubmenu('language')}
          onClick={() => setSubmenu((current) => (current === 'language' ? null : 'language'))}
        >
          <span className="sb-profile-pop__lead">
            <GlobeIcon size={16} />
            <span>{t('language.label')}</span>
          </span>
          <span className="sb-profile-pop__trail">
            <span className="sb-profile-pop__value">
              {LANG_LABEL[resolvedLanguage] ?? LANG_LABEL.en}
            </span>
            <ChevronRightIcon size={16} />
          </span>
        </button>

        {submenu === 'language' && (
          <div className="sb-settings__submenu" role="menu">
            {SUPPORTED_LANGS.map((lang) => (
              <button
                key={lang}
                type="button"
                role="menuitemradio"
                aria-checked={resolvedLanguage === lang}
                className="sb-settings__option"
                onClick={() => void selectLanguage(lang)}
              >
                <GlobeIcon size={15} />
                <span className="sb-settings__option-label">{LANG_LABEL[lang]}</span>
                <span
                  className="sb-settings__radio"
                  data-checked={resolvedLanguage === lang ? 'true' : 'false'}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
