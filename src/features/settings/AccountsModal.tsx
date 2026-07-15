import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { InfoIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '@/components/icons';
import { useAppStore } from '@/store';
import { useLimit } from '@/hooks/useEntitlements';
import { atLimit } from '@/domain/entitlements';
import { ACCOUNT_PRESETS, type AccountKind, type AccountPreset } from '@/domain/account';
import { explainEffectiveRate } from '@/domain/taxExplain';
import {
  CA_PROVINCES,
  COUNTRIES,
  COUNTRY_FLAG,
  COUNTRY_LABEL,
  DEFAULT_PROVINCE,
  PROVINCE_LABEL,
  type Country,
  type Province,
} from '@/domain/country';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { valueHoldings } from '@/services/portfolioService';
import type { RatesTable } from '@/services/currencyService';
import type { Plan } from '@/domain/plan';
import { cn } from '@/lib/cn';

interface Props {
  plan: Plan;
  rates: RatesTable | undefined;
  onClose: () => void;
}

const KINDS: readonly AccountKind[] = ['tax_deferred', 'tax_free', 'taxable'];

interface PresetSection {
  readonly label: string;
  readonly presets: readonly AccountPreset[];
}

const matchesQuery = (name: string, query: string): boolean =>
  name.toLowerCase().includes(query.trim().toLowerCase());

/** Presets with their own dedicated button next to the search bar, so they're
 * excluded from the searchable list itself (like "Custom account"). */
const DEDICATED_BUTTON_PRESETS = ['Crypto Wallet'];

const cryptoPreset = ACCOUNT_PRESETS.find((p) => p.name === 'Crypto Wallet');

/**
 * Searchable account-preset picker: type to filter by name, then click a row
 * or press Enter (on the highlighted row) to add that account immediately —
 * no separate "Add" button needed. "Custom account" and "Crypto Wallet" are
 * dedicated buttons next to the search bar, not rows in this list.
 */
const AccountPresetCombobox = ({ onAdd }: { onAdd: (preset: AccountPreset) => void }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const sections: PresetSection[] = useMemo(() => {
    const q = query.trim();
    const out: PresetSection[] = [];
    for (const c of COUNTRIES) {
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
  }, [query, t]);

  const flat = useMemo(() => sections.flatMap((s) => s.presets), [sections]);

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

  const commit = (preset: AccountPreset) => {
    onAdd(preset);
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
      if (preset) commit(preset);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="acct-preset-combo" ref={rootRef}>
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
                  const sub = preset.sourceCountry
                    ? t(`accountKind.${preset.kind}`)
                    : `${t(`accountKind.${preset.kind}`)} · ${t('accounts.taxedAtResidence')}`;
                  return (
                    <div
                      key={preset.name}
                      className={cn('search-row', idx === highlight && 'active')}
                      role="button"
                      tabIndex={-1}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => commit(preset)}
                    >
                      <div className="search-row__id">
                        <div className="search-row__main">
                          <span className="search-row__sym">{preset.name}</span>
                          <span className="search-row__name">{sub}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

/** Manage tax envelopes: residence, account kind + source country, derived tax. */
export const AccountsModal = ({ plan, rates, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const addAccount = useAppStore((s) => s.addAccount);
  const updateAccount = useAppStore((s) => s.updateAccount);
  const removeAccount = useAppStore((s) => s.removeAccount);
  const setResidenceCountry = useAppStore((s) => s.setResidenceCountry);
  const setResidenceProvince = useAppStore((s) => s.setResidenceProvince);
  const openPaywall = useAppStore((s) => s.openPaywall);
  const maxAccounts = useLimit('maxAccounts');

  // Free tier caps accounts; adding past the cap opens the paywall instantly instead
  // of letting the account get created and rejected later by the server round-trip.
  const onAddAccount = (preset?: AccountPreset) =>
    atLimit(plan.accounts.length, maxAccounts)
      ? openPaywall('accounts')
      : addAccount(plan.id, preset);

  // Live gain fraction per account (value−basis)/value from the actual holdings,
  // so the displayed rate reflects today's unrealised gains, not a static guess.
  const liveGainByAccount = useMemo(() => {
    const values = valueHoldings(plan.holdings, plan.currency, rates);
    const map = new Map<string, number | undefined>();
    for (const a of plan.accounts) {
      const held = values.filter((v) => v.accountId === a.id);
      const totalV = held.reduce((s, v) => s + v.value, 0);
      const totalB = held.reduce(
        (s, v) => s + (v.costBasis ?? v.value * ((a.costBasisPct ?? 0) / 100)),
        0,
      );
      map.set(a.id, totalV > 0 ? Math.min(1, Math.max(0, (totalV - totalB) / totalV)) : undefined);
    }
    return map;
  }, [plan.holdings, plan.accounts, plan.currency, rates]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);

  // Hover-tooltip text describing how each account kind (or manual mode) is taxed.
  const kindTitle = (k: AccountKind): string =>
    t(
      k === 'tax_deferred'
        ? 'accounts.kindDeferred'
        : k === 'tax_free'
          ? 'accounts.kindFree'
          : 'accounts.kindTaxable',
    );

  const residence = plan.residenceCountry ?? 'US';
  const province = plan.residenceProvince ?? DEFAULT_PROVINCE;
  const holdingsInAccount = (accountId: string): number =>
    plan.holdings.filter((h) => h.accountId === accountId).length;

  // Resolve country codes and account kinds in a step's vars to display labels.
  const fmtVars = (
    vars?: Record<string, string | number>,
  ): Record<string, string | number> | undefined => {
    if (!vars) return undefined;
    const out: Record<string, string | number> = { ...vars };
    if (typeof out.kind === 'string') out.kind = t(`accountKind.${out.kind}`);
    for (const k of ['source', 'residence'] as const) {
      const v = out[k];
      if (typeof v === 'string' && v in COUNTRY_LABEL) out[k] = COUNTRY_LABEL[v as Country];
    }
    return out;
  };

  // The collapsible "how is this rate calculated" panel for one account.
  const renderTaxInfo = (
    accountId: string,
    explanation: ReturnType<typeof explainEffectiveRate>,
  ) =>
    infoId === accountId ? (
      <div className="acct-explain">
        <div className="acct-explain__title">{t('taxExplain.title')}</div>
        <ol className="acct-explain__steps">
          {explanation.steps.map((s, i) => (
            <li key={i}>{t(`taxExplain.${s.key}`, fmtVars(s.vars))}</li>
          ))}
        </ol>
        {explanation.calc && (
          <div className="acct-brackets-wrap">
            <p className="acct-explain__line">
              {t('taxExplain.grossLine', {
                net: fmt.compact(explanation.calc.net),
                gross: fmt.compact(explanation.calc.gross),
              })}
            </p>
            {explanation.calc.brackets.length > 0 && (
              <table className="acct-brackets">
                <thead>
                  <tr>
                    <th>{t('taxExplain.colIncome')}</th>
                    <th>{t('taxExplain.colRate')}</th>
                    <th>{t('taxExplain.colTax')}</th>
                  </tr>
                </thead>
                <tbody>
                  {explanation.calc.brackets.map((b, i) => (
                    <tr key={i}>
                      <td>{fmt.compact(b.amount)}</td>
                      <td>{Math.round(b.rate * 100)}%</td>
                      <td>{fmt.compact(b.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {explanation.calc.ltcgBrackets.length > 0 && (
              <>
                <p className="acct-explain__line">
                  {t('taxExplain.ltcgLine', { gains: fmt.compact(explanation.calc.gainsIncome) })}
                </p>
                <table className="acct-brackets">
                  <thead>
                    <tr>
                      <th>{t('taxExplain.colGains')}</th>
                      <th>{t('taxExplain.colRate')}</th>
                      <th>{t('taxExplain.colTax')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explanation.calc.ltcgBrackets.map((b, i) => (
                      <tr key={i}>
                        <td>{fmt.compact(b.amount)}</td>
                        <td>{Math.round(b.rate * 100)}%</td>
                        <td>{fmt.compact(b.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {explanation.calc.niitTax > 0 && (
                  <p className="acct-explain__line">
                    {t('taxExplain.niitLine', { tax: fmt.compact(explanation.calc.niitTax) })}
                  </p>
                )}
              </>
            )}
            <p className="acct-explain__line">
              {t('taxExplain.effectiveLine', {
                tax: fmt.compact(explanation.calc.tax),
                gross: fmt.compact(explanation.calc.gross),
                result: explanation.effectivePct,
              })}
            </p>
          </div>
        )}
        <div className="acct-explain__note">{t('taxExplain.disclaimer')}</div>
        <div className="acct-explain__note">{t('taxExplain.assumptions')}</div>
      </div>
    ) : null;

  const infoButton = (accountId: string) => (
    <button
      type="button"
      className={cn('acct-info-btn', infoId === accountId && 'is-active')}
      aria-label={t('taxExplain.title')}
      aria-expanded={infoId === accountId}
      onClick={() => setInfoId(infoId === accountId ? null : accountId)}
    >
      <InfoIcon size={15} />
    </button>
  );

  return (
    <Modal
      title={t('accounts.title')}
      description={t('accounts.desc')}
      onClose={onClose}
      wide
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('common.done')}
        </Button>
      }
    >
      <div className="acct-residence" data-tour="tax-residence-select">
        <label className="field__label" style={{ margin: 0 }} htmlFor="tax-residence-select">
          {t('accounts.taxResidence')}
        </label>
        <select
          id="tax-residence-select"
          className="select"
          aria-label={t('accounts.taxResidence')}
          value={residence}
          onChange={(e) => setResidenceCountry(plan.id, e.target.value as Country)}
        >
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {COUNTRY_FLAG[c]} {COUNTRY_LABEL[c]}
            </option>
          ))}
        </select>
        {residence === 'CA' && (
          <>
            <label className="field__label" style={{ margin: 0 }} htmlFor="tax-province-select">
              {t('accounts.province')}
            </label>
            <select
              id="tax-province-select"
              className="select"
              aria-label={t('accounts.province')}
              value={province}
              onChange={(e) => setResidenceProvince(plan.id, e.target.value as Province)}
            >
              {CA_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {PROVINCE_LABEL[p]}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="acct-add" data-tour="account-preset-add">
        <AccountPresetCombobox onAdd={(preset) => onAddAccount(preset)} />
        <Button variant="ghost" onClick={() => onAddAccount(undefined)}>
          <PlusIcon size={16} /> {t('accounts.customAccount')}
        </Button>
        {cryptoPreset && (
          <Button variant="ghost" onClick={() => onAddAccount(cryptoPreset)}>
            <PlusIcon size={16} /> {cryptoPreset.name}
          </Button>
        )}
      </div>

      {plan.accounts.length === 0 ? (
        <div className="state-box">{t('accounts.noAccounts')}</div>
      ) : (
        <div className="acct-cards">
          {plan.accounts.map((a) => {
            // Presets just pre-fill type/country/rate at creation time; every
            // account can be edited afterwards.
            const editing = editingId === a.id;
            const isLastAccount = plan.accounts.length === 1;
            const auto = a.taxMode === 'auto';
            const kind = a.kind ?? 'taxable';
            const source = a.sourceCountry ?? residence;
            const count = holdingsInAccount(a.id);
            const badgeLabel = auto ? t(`accountKind.${kind}`) : t('accounts.manual');
            const badgeClass = auto ? `acct-badge--${kind}` : 'acct-badge--manual';
            const badgeTitle = auto ? kindTitle(kind) : t('accounts.kindManual');
            const explanation = explainEffectiveRate(
              a,
              residence,
              plan.settings.annualSpending,
              liveGainByAccount.get(a.id),
              plan.residenceProvince,
            );
            const eff = explanation.effectivePct;

            // --- Read-only one-line row (default) ---
            if (!editing) {
              return (
                <div className="acct-item" key={a.id}>
                  <div className="acct-line">
                    <span className="acct-line__name">
                      {a.name}{' '}
                      <span
                        className={cn('acct-line__count', count === 0 && 'acct-line__count--empty')}
                        title={t('accounts.assets', { count })}
                      >
                        ({t('accounts.assets', { count })})
                      </span>
                    </span>
                    <span className={cn('acct-badge tip-host', badgeClass)} tabIndex={0}>
                      {badgeLabel}
                      <span className="tip-bubble" role="tooltip">
                        {badgeTitle}
                      </span>
                    </span>
                    <span className="acct-line__src">{COUNTRY_FLAG[source]}</span>
                    <span className="acct-line__eff">{eff.toFixed(1)}%</span>
                    {infoButton(a.id)}
                    <Button
                      variant="danger"
                      size="sm"
                      aria-label={t('accounts.deleteAria', { name: a.name })}
                      title={isLastAccount ? t('accounts.lastAccount') : undefined}
                      disabled={isLastAccount}
                      onClick={() => removeAccount(plan.id, a.id)}
                    >
                      <TrashIcon size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('common.edit')}
                      onClick={() => setEditingId(a.id)}
                    >
                      <PencilIcon size={16} />
                    </Button>
                  </div>
                  {renderTaxInfo(a.id, explanation)}
                </div>
              );
            }

            // --- Edit mode ---
            return (
              <div className="acct-card" key={a.id}>
                <div className="acct-card__head">
                  <input
                    className="search-input acct-name-input"
                    value={a.name}
                    aria-label={t('accounts.accountName')}
                    onChange={(e) => updateAccount(plan.id, a.id, { name: e.target.value })}
                  />
                  <span className="acct-card__eff">
                    {eff.toFixed(1)}% <span className="ov__sub">{t('accounts.effective')}</span>
                  </span>
                  {infoButton(a.id)}
                  <button type="button" className="ov__link" onClick={() => setEditingId(null)}>
                    {t('common.done')}
                  </button>
                  <Button
                    variant="danger"
                    size="sm"
                    aria-label={t('accounts.deleteAria', { name: a.name })}
                    title={isLastAccount ? t('accounts.lastAccount') : undefined}
                    disabled={isLastAccount}
                    onClick={() => {
                      removeAccount(plan.id, a.id);
                      setEditingId(null);
                    }}
                  >
                    <TrashIcon size={16} />
                  </Button>
                </div>

                <div className="acct-card__row">
                  <label className="acct-field">
                    <span className="ov__sub">{t('accounts.type')}</span>
                    <div
                      className="scenario-pills"
                      role="group"
                      aria-label={t('accounts.typeAria', { name: a.name })}
                    >
                      {KINDS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={cn('scenario-pill tip-host', kind === k && 'is-active')}
                          onClick={() => updateAccount(plan.id, a.id, { kind: k, taxMode: 'auto' })}
                        >
                          {t(`accountKind.${k}`)}
                          <span className="tip-bubble" role="tooltip">
                            {kindTitle(k)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </label>

                  <label className="acct-field">
                    <span className="ov__sub">{t('accounts.sourceCountry')}</span>
                    <select
                      className="select"
                      value={source}
                      onChange={(e) =>
                        updateAccount(plan.id, a.id, {
                          sourceCountry: e.target.value as Country,
                          taxMode: 'auto',
                        })
                      }
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {COUNTRY_FLAG[c]} {COUNTRY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>

                  {auto && kind === 'taxable' && (
                    <label className="acct-field">
                      <span className="ov__sub">{t('accounts.costBasis')}</span>
                      <Stepper
                        ariaLabel={t('accounts.costBasisAria', { name: a.name })}
                        value={a.costBasisPct ?? 0}
                        min={0}
                        max={100}
                        step={5}
                        suffix="%"
                        onChange={(v) => updateAccount(plan.id, a.id, { costBasisPct: v })}
                      />
                    </label>
                  )}
                </div>

                {!auto && (
                  <div className="acct-card__row">
                    <label className="acct-field">
                      <span className="ov__sub">{t('accounts.taxRate')}</span>
                      <Stepper
                        ariaLabel={t('accounts.taxRateAria', { name: a.name })}
                        value={a.taxRatePct}
                        min={0}
                        max={100}
                        step={1}
                        suffix="%"
                        onChange={(v) => updateAccount(plan.id, a.id, { taxRatePct: v })}
                      />
                    </label>
                    <label className="acct-field">
                      <span className="ov__sub">{t('accounts.taxableBase')}</span>
                      <Stepper
                        ariaLabel={t('accounts.taxableBaseAria', { name: a.name })}
                        value={a.taxableBasePct}
                        min={0}
                        max={100}
                        step={5}
                        suffix="%"
                        onChange={(v) => updateAccount(plan.id, a.id, { taxableBasePct: v })}
                      />
                    </label>
                  </div>
                )}

                <button
                  type="button"
                  className="acct-mode-link"
                  onClick={() =>
                    updateAccount(plan.id, a.id, { taxMode: auto ? 'manual' : 'auto' })
                  }
                >
                  {auto ? t('accounts.setManual') : t('accounts.deriveAuto')}
                </button>

                {renderTaxInfo(a.id, explanation)}
              </div>
            );
          })}
        </div>
      )}

      <p className="field__hint" style={{ marginTop: 14 }}>
        {t('accounts.effectiveHint', { country: COUNTRY_LABEL[residence] })}
        <b>{t('accounts.effectiveHintBold')}</b>
        {t('accounts.effectiveHintEnd')}
      </p>
    </Modal>
  );
};
