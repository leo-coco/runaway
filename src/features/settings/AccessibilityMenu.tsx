import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityIcon, ChevronRightIcon, ContrastIcon } from '@/components/icons';
import { useThemeStore, type FontScale } from '@/store/themeStore';

const FONT_SCALE_OPTIONS: { value: FontScale; labelKey: string; sample: string }[] = [
  { value: 'normal', labelKey: 'accessibility.fontNormal', sample: 'A' },
  { value: 'large', labelKey: 'accessibility.fontLarge', sample: 'A' },
  { value: 'larger', labelKey: 'accessibility.fontLarger', sample: 'A' },
];

export const AccessibilityMenu = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const highContrast = useThemeStore((s) => s.highContrast);
  const fontScale = useThemeStore((s) => s.fontScale);
  const setHighContrast = useThemeStore((s) => s.setHighContrast);
  const setFontScale = useThemeStore((s) => s.setFontScale);

  return (
    <div className="sb-settings__flyout" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="sb-profile-pop__item"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="sb-profile-pop__lead">
          <AccessibilityIcon size={16} />
          <span>{t('accessibility.label')}</span>
        </span>
        <span className="sb-profile-pop__trail">
          <ChevronRightIcon size={16} />
        </span>
      </button>

      {open && (
        <div className="sb-settings__submenu sb-accessibility-menu" role="menu">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={highContrast}
            className="sb-settings__option"
            onClick={() => setHighContrast(!highContrast)}
          >
            <ContrastIcon size={15} />
            <span className="sb-settings__option-label">{t('accessibility.highContrast')}</span>
            <span
              className="sb-accessibility-menu__toggle"
              data-checked={highContrast}
              aria-hidden="true"
            />
          </button>

          <div className="sb-accessibility-menu__section">{t('accessibility.fontSize')}</div>
          <div
            className="sb-accessibility-menu__font-options"
            role="group"
            aria-label={t('accessibility.fontSize')}
          >
            {FONT_SCALE_OPTIONS.map(({ value, labelKey, sample }) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={fontScale === value}
                className="sb-accessibility-menu__font-option"
                onClick={() => setFontScale(value)}
              >
                <span
                  className={`sb-accessibility-menu__font-sample sb-accessibility-menu__font-sample--${value}`}
                  aria-hidden="true"
                >
                  {sample}
                </span>
                <span>{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
