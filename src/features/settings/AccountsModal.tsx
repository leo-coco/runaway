import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import {
  BankIcon,
  BriefcaseIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import { useAppStore } from '@/store';
import { useLimit } from '@/hooks/useEntitlements';
import { atLimit } from '@/domain/entitlements';
import {
  accountFromPreset,
  isIlliquidAccount,
  type Account,
  type AccountKind,
  type AccountPreset,
} from '@/domain/account';
import { AccountPresetCombobox, cryptoPreset } from './AccountPresetCombobox';
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
import { bracketFxFactor, type RatesTable } from '@/services/currencyService';
import type { Plan } from '@/domain/plan';
import { cn } from '@/lib/cn';

interface Props {
  plan: Plan;
  rates: RatesTable | undefined;
  onClose: () => void;
}

const KINDS: readonly AccountKind[] = ['tax_deferred', 'tax_free', 'taxable'];

/** Manage tax envelopes: residence, account kind + source country, derived tax. */
export const AccountsModal = ({ plan, rates, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const saveAccountsTaxConfig = useAppStore((s) => s.saveAccountsTaxConfig);
  const openPaywall = useAppStore((s) => s.openPaywall);
  const maxAccounts = useLimit('maxAccounts');
  // The auto-managed illiquid bucket is not a user-editable envelope: it never
  // appears in this editor, is not counted toward the account quota, and is
  // preserved on save by the store (see saveAccountsTaxConfig).
  const [draftAccounts, setDraftAccounts] = useState<Account[]>(() =>
    plan.accounts
      .filter((account) => !isIlliquidAccount(account))
      .map((account) => ({ ...account })),
  );
  const [draftResidence, setDraftResidence] = useState<Country>(plan.residenceCountry ?? 'US');
  const [draftProvince, setDraftProvince] = useState<Province>(
    plan.residenceProvince ?? DEFAULT_PROVINCE,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [activeKindTooltip, setActiveKindTooltip] = useState<AccountKind | null>(null);

  // Free tier caps accounts; adding past the cap opens the paywall instantly instead
  // of adding it to the local draft.
  const onAddAccount = (preset?: AccountPreset) => {
    if (atLimit(draftAccounts.length, maxAccounts)) {
      openPaywall('accounts');
      return;
    }
    setDraftAccounts((accounts) => [...accounts, accountFromPreset(preset, draftResidence)]);
  };

  // Multiselect commit from the preset combobox: adds as many of the checked
  // presets as the tier allows (in order), then opens the paywall once for the
  // rest instead of adding them past the cap.
  const onAddAccounts = (presets: AccountPreset[]) => {
    const room =
      maxAccounts === null ? presets.length : Math.max(0, maxAccounts - draftAccounts.length);
    if (room < presets.length) openPaywall('accounts');
    if (room === 0) return;
    const additions = presets
      .slice(0, room)
      .map((preset) => accountFromPreset(preset, draftResidence));
    setDraftAccounts((accounts) => [...accounts, ...additions]);
  };

  const updateDraftAccount = (
    accountId: string,
    patch: Partial<
      Pick<
        Account,
        | 'name'
        | 'taxRatePct'
        | 'taxableBasePct'
        | 'kind'
        | 'sourceCountry'
        | 'taxMode'
        | 'costBasisPct'
      >
    >,
  ) =>
    setDraftAccounts((accounts) =>
      accounts.map((account) => (account.id === accountId ? { ...account, ...patch } : account)),
    );

  const removeDraftAccount = (accountId: string) => {
    if (draftAccounts.length === 1) return;
    setDraftAccounts((accounts) => accounts.filter((account) => account.id !== accountId));
    if (editingId === accountId) setEditingId(null);
    if (infoId === accountId) setInfoId(null);
  };

  const handleSave = () => {
    saveAccountsTaxConfig(plan.id, {
      accounts: draftAccounts,
      residenceCountry: draftResidence,
      residenceProvince: draftProvince,
    });
    onClose();
  };

  // Live gain fraction per account (value−basis)/value from the actual holdings,
  // so the displayed rate reflects today's unrealised gains, not a static guess.
  const liveGainByAccount = useMemo(() => {
    const values = valueHoldings(plan.holdings, plan.currency, rates);
    const map = new Map<string, number | undefined>();
    for (const a of draftAccounts) {
      const held = values.filter((v) => v.accountId === a.id);
      const totalV = held.reduce((s, v) => s + v.value, 0);
      const totalB = held.reduce(
        (s, v) => s + (v.costBasis ?? v.value * ((a.costBasisPct ?? 0) / 100)),
        0,
      );
      map.set(a.id, totalV > 0 ? Math.min(1, Math.max(0, (totalV - totalB) / totalV)) : undefined);
    }
    return map;
  }, [plan.holdings, draftAccounts, plan.currency, rates]);

  // Hover-tooltip text describing how each account kind (or manual mode) is taxed.
  const kindTitle = (k: AccountKind): string =>
    t(
      k === 'tax_deferred'
        ? 'accounts.kindDeferred'
        : k === 'tax_free'
          ? 'accounts.kindFree'
          : 'accounts.kindTaxable',
    );

  const residence = draftResidence;
  const province = draftProvince;
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

  // Detailed calculation content shown in the dedicated information modal.
  const renderTaxInfo = (explanation: ReturnType<typeof explainEffectiveRate>) => (
    <div className="acct-explain">
      <div className="acct-explain__note">
        {t('accounts.effectiveHint', { country: COUNTRY_LABEL[residence] })}
        <b>{t('accounts.effectiveHintBold')}</b>
        {t('accounts.effectiveHintEnd')}
      </div>
      <div className="acct-explain__copy">
        {explanation.steps.map((s, i) => (
          <p key={i}>{t(`taxExplain.${s.key}`, fmtVars(s.vars))}</p>
        ))}
      </div>
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
  );

  const infoButton = (accountId: string) => (
    <button
      type="button"
      className={cn('acct-info-btn', 'icon-action', infoId === accountId && 'is-active')}
      aria-label={t('taxExplain.title')}
      aria-expanded={infoId === accountId}
      onClick={() => setInfoId(infoId === accountId ? null : accountId)}
    >
      <InfoIcon size={15} />
    </button>
  );

  const accountAddControls = (
    <div className="acct-add" data-tour="account-preset-add">
      <AccountPresetCombobox
        residence={draftResidence}
        currentAccountCount={draftAccounts.length}
        maxAccounts={maxAccounts}
        onAdd={onAddAccounts}
        onLimitReached={() => openPaywall('accounts')}
      />
      <Button variant="accent" className="acct-add__button" onClick={() => onAddAccount(undefined)}>
        <PlusIcon size={16} /> {t('accounts.customAccount')}
      </Button>
      {cryptoPreset && (
        <Button
          variant="accent"
          className="acct-add__button"
          onClick={() => onAddAccount(cryptoPreset)}
        >
          <PlusIcon size={16} /> {cryptoPreset.name}
        </Button>
      )}
    </div>
  );

  const taxFx = bracketFxFactor(residence, plan.currency, rates);
  const infoAccount = infoId ? draftAccounts.find((account) => account.id === infoId) : undefined;
  const infoExplanation = infoAccount
    ? explainEffectiveRate(
        infoAccount,
        residence,
        plan.settings.annualSpending,
        liveGainByAccount.get(infoAccount.id),
        plan.residenceProvince,
        taxFx,
      )
    : undefined;

  return (
    <Modal
      title={t('accounts.title')}
      onClose={infoId ? () => setInfoId(null) : onClose}
      xl
      className="accounts-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSave}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <section className="accounts-residence-panel" data-tour="tax-residence-select">
        <span className="accounts-residence-panel__icon" aria-hidden="true">
          <BankIcon size={19} />
        </span>
        <div className="accounts-residence-panel__copy">
          <label htmlFor="tax-residence-select">{t('accounts.taxResidence')}</label>
          <span>{t('accounts.taxResidenceHint')}</span>
        </div>
        <div className="accounts-residence-panel__controls">
          <select
            id="tax-residence-select"
            className="select"
            aria-label={t('accounts.taxResidence')}
            value={residence}
            onChange={(e) => setDraftResidence(e.target.value as Country)}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {COUNTRY_FLAG[c]} {COUNTRY_LABEL[c]}
              </option>
            ))}
          </select>
          {residence === 'CA' && (
            <select
              id="tax-province-select"
              className="select"
              aria-label={t('accounts.province')}
              value={province}
              onChange={(e) => setDraftProvince(e.target.value as Province)}
            >
              {CA_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {PROVINCE_LABEL[p]}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {draftAccounts.length === 0 ? (
        <>
          {accountAddControls}
          <div className="state-box">{t('accounts.noAccounts')}</div>
        </>
      ) : (
        <section className="accounts-list">
          {accountAddControls}
          <div className="accounts-table" role="table" aria-label={t('accounts.listTitle')}>
            <div className="accounts-table__head" role="row">
              <span role="columnheader">
                {t('accounts.accountColumnWithCount', { count: draftAccounts.length })}
              </span>
              <span role="columnheader">{t('accounts.type')}</span>
              <span role="columnheader">{t('accounts.countryColumn')}</span>
              <span role="columnheader">{t('accounts.effectiveColumn')}</span>
              <span role="columnheader">{t('accounts.actionsColumn')}</span>
            </div>
            <div role="rowgroup">
              {draftAccounts.map((a) => {
                // Presets just pre-fill type/country/rate at creation time; every
                // account can be edited afterwards.
                const editing = editingId === a.id;
                const isLastAccount = draftAccounts.length === 1;
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
                  taxFx,
                );
                const eff = explanation.effectivePct;

                return (
                  <div className={cn('accounts-table__item', editing && 'is-editing')} key={a.id}>
                    <div className="accounts-table__row" role="row">
                      <div className="accounts-table__identity" role="cell">
                        <span className="accounts-table__account-icon" aria-hidden="true">
                          <BriefcaseIcon size={15} />
                        </span>
                        <span className="accounts-table__account-copy">
                          <strong title={a.name}>{a.name}</strong>
                          <small>{t('accounts.assets', { count })}</small>
                        </span>
                      </div>
                      <div role="cell">
                        <span className={cn('acct-badge tip-host', badgeClass)} tabIndex={0}>
                          {badgeLabel}
                          <span className="tip-bubble" role="tooltip">
                            {badgeTitle}
                          </span>
                        </span>
                      </div>
                      <div className="accounts-table__country" role="cell">
                        <span aria-hidden="true">{COUNTRY_FLAG[source]}</span>
                        <span>{COUNTRY_LABEL[source]}</span>
                      </div>
                      <div className="accounts-table__rate" role="cell">
                        <strong>{eff.toFixed(1)}%</strong>
                        {infoButton(a.id)}
                      </div>
                      <div className="accounts-table__actions" role="cell">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="icon-action"
                          aria-label={t('common.edit')}
                          aria-expanded={editing}
                          onClick={() => {
                            setEditingId(editing ? null : a.id);
                            setActiveKindTooltip(null);
                          }}
                        >
                          <PencilIcon size={14} />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          className="icon-action"
                          aria-label={t('accounts.deleteAria', { name: a.name })}
                          title={isLastAccount ? t('accounts.lastAccount') : undefined}
                          disabled={isLastAccount}
                          onClick={() => {
                            removeDraftAccount(a.id);
                          }}
                        >
                          <TrashIcon size={14} />
                        </Button>
                      </div>
                    </div>

                    {editing && (
                      <div className="accounts-table__editor">
                        <div className="accounts-editor__grid">
                          <label className="acct-field">
                            <span className="ov__sub">{t('accounts.accountName')}</span>
                            <input
                              className="search-input"
                              value={a.name}
                              aria-label={t('accounts.accountName')}
                              onChange={(e) => updateDraftAccount(a.id, { name: e.target.value })}
                            />
                          </label>
                          <label className="acct-field">
                            <span className="ov__sub">{t('accounts.type')}</span>
                            <div
                              className="scenario-pills accounts-type-pills"
                              role="group"
                              aria-label={t('accounts.typeAria', { name: a.name })}
                            >
                              {KINDS.map((k) => (
                                <button
                                  key={k}
                                  type="button"
                                  className={cn(
                                    'scenario-pill tip-host',
                                    `accounts-type-pill--${k}`,
                                    auto && kind === k && 'is-active',
                                    activeKindTooltip === k && 'is-tooltip-open',
                                  )}
                                  onPointerEnter={() => setActiveKindTooltip(k)}
                                  onPointerLeave={() => setActiveKindTooltip(null)}
                                  onFocus={() => setActiveKindTooltip(k)}
                                  onBlur={() => setActiveKindTooltip(null)}
                                  onClick={() =>
                                    updateDraftAccount(a.id, { kind: k, taxMode: 'auto' })
                                  }
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
                                updateDraftAccount(a.id, {
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
                                onChange={(v) => updateDraftAccount(a.id, { costBasisPct: v })}
                              />
                            </label>
                          )}
                        </div>
                        {!auto && (
                          <div className="accounts-editor__manual-grid">
                            <label className="acct-field">
                              <span className="ov__sub">{t('accounts.taxRate')}</span>
                              <Stepper
                                ariaLabel={t('accounts.taxRateAria', { name: a.name })}
                                value={a.taxRatePct}
                                min={0}
                                max={100}
                                step={1}
                                suffix="%"
                                onChange={(v) => updateDraftAccount(a.id, { taxRatePct: v })}
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
                                onChange={(v) => updateDraftAccount(a.id, { taxableBasePct: v })}
                              />
                            </label>
                          </div>
                        )}
                        <div className="accounts-editor__footer">
                          <button
                            type="button"
                            className="acct-mode-link"
                            onClick={() =>
                              updateDraftAccount(a.id, { taxMode: auto ? 'manual' : 'auto' })
                            }
                          >
                            {auto ? t('accounts.setManual') : t('accounts.deriveAuto')}
                          </button>
                          <span className="accounts-editor__effective">
                            <span>{t('accounts.effectiveColumn')}</span>
                            <strong>{eff.toFixed(1)}%</strong>
                          </span>
                          <Button size="sm" onClick={() => setEditingId(null)}>
                            {t('common.done')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {infoAccount && infoExplanation && (
        <Modal
          title={t('taxExplain.title')}
          description={t('accounts.taxInfoDescription', {
            name: infoAccount.name,
            rate: infoExplanation.effectivePct.toFixed(1),
          })}
          onClose={() => setInfoId(null)}
          wide
          className="accounts-tax-info-modal"
          footer={
            <Button variant="primary" onClick={() => setInfoId(null)}>
              {t('common.close')}
            </Button>
          }
        >
          {renderTaxInfo(infoExplanation)}
        </Modal>
      )}
    </Modal>
  );
};
