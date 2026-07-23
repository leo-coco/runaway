import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { SearchIcon } from '@/components/icons';
import { ACCOUNT_PRESETS, type AccountPreset } from '@/domain/account';
import { COUNTRIES, COUNTRY_FLAG, COUNTRY_LABEL, type Country } from '@/domain/country';
import { cn } from '@/lib/cn';
import { ProBadge } from '@/features/billing/ProBadge';

interface PresetSection {
  readonly label: string;
  readonly presets: readonly AccountPreset[];
}

const matchesQuery = (name: string, query: string): boolean =>
  name.toLowerCase().includes(query.trim().toLowerCase());

/** Presets with their own dedicated button next to the search bar, so they're
 * excluded from the searchable list itself (like "Custom account"). */
const DEDICATED_BUTTON_PRESETS = ['Crypto Wallet'];

/** The self-custodied crypto wallet preset, surfaced as a dedicated button. */
export const cryptoPreset = ACCOUNT_PRESETS.find((p) => p.name === 'Crypto Wallet');

/**
 * Searchable account-preset picker: type to filter by name, click (or press Enter
 * on the highlighted) row to check/uncheck it, then confirm with "Add" to create
 * every checked account at once. "Custom account" and "Crypto Wallet" are
 * dedicated buttons next to the search bar, not rows in this list.
 */
export const AccountPresetCombobox = ({
  residence,
  currentAccountCount,
  maxAccounts,
  onAdd,
  onLimitReached,
}: {
  residence: Country;
  currentAccountCount: number;
  maxAccounts: number | null;
  onAdd: (presets: AccountPreset[]) => void;
  onLimitReached: () => void;
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [checked, setChecked] = useState<readonly string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const sections: PresetSection[] = useMemo(() => {
    const q = query.trim();
    const out: PresetSection[] = [];
    const orderedCountries = [residence, ...COUNTRIES.filter((country) => country !== residence)];
    for (const c of orderedCountries) {
      const presets = ACCOUNT_PRESETS.filter(
        (p) => p.sourceCountry === c && (q === '' || matchesQuery(p.name, q)),
      );
      if (presets.length > 0)
        out.push({ label: `${COUNTRY_FLAG[c]} ${COUNTRY_LABEL[c]}`, presets });
    }
    const otherPresets = ACCOUNT_PRESETS.filter(
      (p) =>
        !p.sourceCountry &&
        !DEDICATED_BUTTON_PRESETS.includes(p.name) &&
        (q === '' || matchesQuery(p.name, q)),
    );
    if (otherPresets.length > 0)
      out.push({ label: t('accounts.cryptoOther'), presets: otherPresets });
    return out;
  }, [query, residence, t]);

  const flat = useMemo(() => sections.flatMap((s) => s.presets), [sections]);
  const availableSlots =
    maxAccounts === null ? null : Math.max(0, maxAccounts - currentAccountCount);
  const selectionLimitReached = availableSlots !== null && checked.length >= availableSlots;

  // Reset the highlighted option whenever the query changes, adjusted during
  // render (React's supported pattern for resetting state on a prop change)
  // rather than in an effect, since setState-in-effect causes an extra,
  // avoidable render pass (see the identical pattern in Sidebar.tsx).
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setHighlight(0);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase: the modal stops mousedown propagation on its bubble-phase
    // handler for any click inside it (to avoid closing the whole modal), which
    // would otherwise stop this listener from ever seeing clicks inside the
    // modal but outside the combobox.
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  const toggle = (preset: AccountPreset) => {
    if (!checked.includes(preset.name) && selectionLimitReached) {
      onLimitReached();
      return;
    }
    setChecked((cur) =>
      cur.includes(preset.name) ? cur.filter((n) => n !== preset.name) : [...cur, preset.name],
    );
  };

  const confirm = () => {
    const presets = ACCOUNT_PRESETS.filter((p) => checked.includes(p.name));
    if (presets.length === 0) return;
    onAdd(presets);
    setChecked([]);
    setQuery('');
    setHighlight(0);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const preset = flat[highlight];
      if (preset) toggle(preset);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="acct-preset-combo" ref={rootRef}>
      <div className="acct-preset-combo__search">
        <div className="acct-preset-combo__input-wrap">
          <span className="acct-preset-combo__icon">
            <SearchIcon size={16} />
          </span>
          <input
            className="search-input"
            style={{ paddingLeft: 36 }}
            placeholder={t('accounts.accountPresetSearchPlaceholder')}
            aria-label={t('accounts.accountPreset')}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        {open && (
          <div className="search-results acct-preset-combo__results">
            {flat.length === 0 ? (
              <div className="state-box">{t('accounts.accountPresetNoMatches', { query })}</div>
            ) : (
              sections.map((section) => (
                <div key={section.label}>
                  <div className="search-group">{section.label}</div>
                  {section.presets.map((preset) => {
                    const idx = flat.indexOf(preset);
                    const isChecked = checked.includes(preset.name);
                    const isLocked = !isChecked && selectionLimitReached;
                    const sub = preset.sourceCountry
                      ? t(`accountKind.${preset.kind}`)
                      : `${t(`accountKind.${preset.kind}`)} · ${t('accounts.taxedAtResidence')}`;
                    return (
                      <div
                        key={preset.name}
                        className={cn(
                          'search-row',
                          idx === highlight && 'active',
                          isChecked && 'is-selected',
                          isLocked && 'is-locked',
                        )}
                        role="checkbox"
                        aria-label={`${preset.name} ${sub}${isLocked ? ` ${t('billing.pro')}` : ''}`}
                        aria-checked={isChecked}
                        aria-disabled={isLocked}
                        tabIndex={-1}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => toggle(preset)}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isLocked}
                          readOnly
                          tabIndex={-1}
                          className="acct-preset-combo__checkbox"
                        />
                        <div className="search-row__id">
                          <div className="search-row__main">
                            <span className="search-row__sym">{preset.name}</span>
                            <span className="search-row__name">{sub}</span>
                          </div>
                        </div>
                        {isLocked && <ProBadge />}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <Button
        variant="primary"
        className="acct-preset-combo__add-button"
        disabled={checked.length === 0}
        onClick={confirm}
      >
        {t('accounts.addSelectedAccounts', { count: checked.length })}
      </Button>
    </div>
  );
};
