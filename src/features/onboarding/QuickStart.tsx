import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store';
import { usePlanContext } from '@/features/portfolio/PlanLayout';
import { PortfolioTrendCard } from '@/features/portfolio/PortfolioTrendCard';
import { Card } from '@/components/ui/Card';
import { Stepper } from '@/components/ui/Stepper';
import { AuthDialog } from '@/features/auth/AuthDialog';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useLimit } from '@/hooks/useEntitlements';
import { atLimit } from '@/domain/entitlements';
import { cn } from '@/lib/cn';
import {
  COUNTRIES,
  COUNTRY_FLAG,
  COUNTRY_LABEL,
  CA_PROVINCES,
  PROVINCE_LABEL,
  RESIDENCE_CURRENCY,
  DEFAULT_PROVINCE,
  type Country,
  type Province,
} from '@/domain/country';
import { MASTER_CURRENCIES, type CurrencyCode } from '@/domain/money';
import { ACCOUNT_PRESETS, type AccountPreset } from '@/domain/account';
import type { ExpensePeriod } from '@/domain/retirementSettings';
import {
  accountsForDraft,
  annualSpendingFrom,
  broadMarketHolding,
  retirementYearFromAges,
} from './quickStartPlan';
import { SAVE_BANNER_DISMISS_KEY } from './saveToAccount';
import { useSaveSandboxPlan } from './useSaveSandboxPlan';

const CURRENCY_SYMBOL: Record<(typeof MASTER_CURRENCIES)[number], string> = {
  USD: '$',
  CAD: '$',
  EUR: '€',
  GBP: '£',
};

/**
 * Guest onboarding shown in the sandbox when the plan has no holdings. Two screens
 * capture the essentials, then a third screen shows a compact first (deterministic)
 * projection with the save / explore conversion CTAs. `onExit` hands control back to
 * the full dashboard once the guest chooses to explore without an account.
 */
export const QuickStart = ({ onExit }: { onExit: () => void }) => {
  const { plan, projection } = usePlanContext();
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const setPlanCurrency = useAppStore((s) => s.setPlanCurrency);
  const saveAccountsTaxConfig = useAppStore((s) => s.saveAccountsTaxConfig);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const addHolding = useAppStore((s) => s.addHolding);
  const renamePlan = useAppStore((s) => s.renamePlan);
  const maxAccounts = useLimit('maxAccounts');
  const { save, dialogOpen, closeDialog, goToAccount } = useSaveSandboxPlan(plan);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [residence, setResidence] = useState<Country>(plan.residenceCountry ?? 'US');
  const [province, setProvince] = useState<Province>(plan.residenceProvince ?? DEFAULT_PROVINCE);
  const [currency, setCurrency] = useState<CurrencyCode>(plan.currency);
  const [currentAge, setCurrentAge] = useState(40);
  const [retirementAge, setRetirementAge] = useState(60);
  const [spending, setSpending] = useState(2500);
  const [spendingPeriod, setSpendingPeriod] = useState<ExpensePeriod>('monthly');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [totalWealth, setTotalWealth] = useState(50000);
  const [monthlySavings, setMonthlySavings] = useState(500);

  const countryPresets = useMemo(
    () => ACCOUNT_PRESETS.filter((p) => p.sourceCountry === residence),
    [residence],
  );

  const pickResidence = (c: Country) => {
    setResidence(c);
    setCurrency(RESIDENCE_CURRENCY[c]);
    setSelected([]);
  };

  const togglePreset = (name: string) => {
    if (selected.includes(name)) {
      setSelected((cur) => cur.filter((n) => n !== name));
      return;
    }
    if (atLimit(selected.length, maxAccounts)) {
      return;
    }
    setSelected((cur) => [...cur, name]);
  };

  const finish = () => {
    const presets: AccountPreset[] = selected
      .map((name) => countryPresets.find((p) => p.name === name))
      .filter((p): p is AccountPreset => Boolean(p));
    const accounts = accountsForDraft(presets, residence);
    const primaryId = accounts[0]!.id;

    // Factor 1: the guest is declaring the currency their answers are already in,
    // not converting a plan they had built in another one.
    setPlanCurrency(plan.id, currency, 1);
    saveAccountsTaxConfig(plan.id, {
      accounts,
      residenceCountry: residence,
      residenceProvince: province,
    });
    updateSettings(plan.id, {
      ...plan.settings,
      currentAge,
      retirementYear: retirementYearFromAges(currentAge, retirementAge),
      annualSpending: annualSpendingFrom(spending, spendingPeriod),
      expensePeriod: spendingPeriod,
    });
    addHolding(
      plan.id,
      broadMarketHolding(
        residence,
        currency,
        totalWealth,
        monthlySavings,
        primaryId,
        t('onboarding.broadMarketName'),
      ),
    );
    renamePlan(plan.id, t('onboarding.defaultPlanName'), '');
    setStep(3);
  };

  const exploreWithoutAccount = () => {
    try {
      sessionStorage.setItem(SAVE_BANNER_DISMISS_KEY, '1');
    } catch {
      // Non-fatal: the dashboard banner would just reappear this session.
    }
    onExit();
  };

  const symbol = CURRENCY_SYMBOL[currency as (typeof MASTER_CURRENCIES)[number]] ?? '';
  const isResult = step === 3;
  const wealthAtRetirement =
    projection.active.years.find((y) => y.year === plan.settings.retirementYear)?.openingBalance ??
    0;
  const depletionYear = projection.active.depletionYear;
  const depletionAge =
    depletionYear !== null && plan.settings.currentAge > 0
      ? plan.settings.currentAge + (depletionYear - projection.active.years[0]!.year)
      : null;

  return (
    <section
      className={cn('quickstart', isResult && 'quickstart--wide')}
      aria-label={isResult ? t('onboarding.result.title') : t('onboarding.title')}
    >
      <header className="quickstart__head">
        <span className="quickstart__eyebrow">
          {isResult ? t('onboarding.saveBanner.eyebrow') : t('onboarding.eyebrow')}
        </span>
        <h1 className="quickstart__title">
          {isResult ? t('onboarding.result.title') : t('onboarding.title')}
        </h1>
        <p className="quickstart__sub">
          {isResult ? t('onboarding.result.subtitle') : t('onboarding.subtitle')}
        </p>
        {!isResult && (
          <div className="quickstart__progress" aria-hidden="true">
            <span className={cn('quickstart__dot', step === 1 && 'is-active')} />
            <span className={cn('quickstart__dot', step === 2 && 'is-active')} />
          </div>
        )}
      </header>

      {step === 1 && (
        <div className="quickstart__body">
          <div className="field">
            <span className="field__label">{t('onboarding.residence')}</span>
            <div className="quickstart__pills">
              {COUNTRIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn('quickstart__pill', residence === c && 'is-selected')}
                  onClick={() => pickResidence(c)}
                >
                  <span aria-hidden="true">{COUNTRY_FLAG[c]}</span> {COUNTRY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          {residence === 'CA' && (
            <div className="field">
              <label className="field__label" htmlFor="qs-province">
                {t('onboarding.province')}
              </label>
              <select
                id="qs-province"
                className="search-input"
                value={province}
                onChange={(e) => setProvince(e.target.value as Province)}
              >
                {CA_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {PROVINCE_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="qs-currency">
              {t('onboarding.currency')}
            </label>
            <select
              id="qs-currency"
              className="search-input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            >
              {MASTER_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="quickstart__row">
            <div className="field">
              <span className="field__label">{t('onboarding.currentAge')}</span>
              <Stepper value={currentAge} onChange={setCurrentAge} min={16} max={99} splitButtons />
            </div>
            <div className="field">
              <span className="field__label">{t('onboarding.retirementAge')}</span>
              <Stepper
                value={retirementAge}
                onChange={setRetirementAge}
                min={currentAge}
                max={100}
                splitButtons
              />
            </div>
          </div>

          <div className="field">
            <span className="field__label">{t('onboarding.spending')}</span>
            <div className="quickstart__row quickstart__row--amount">
              <Stepper
                value={spending}
                onChange={setSpending}
                min={0}
                step={100}
                prefix={symbol}
                hideButtons
                ariaLabel={t('onboarding.spending')}
              />
              <div className="quickstart__pills">
                {(['monthly', 'yearly'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={cn('quickstart__pill', spendingPeriod === p && 'is-selected')}
                    onClick={() => setSpendingPeriod(p)}
                  >
                    {t(`onboarding.period.${p}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="quickstart__actions">
            <button type="button" className="btn btn--primary" onClick={() => setStep(2)}>
              {t('onboarding.next')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="quickstart__body">
          <div className="field">
            <span className="field__label">{t('onboarding.accounts')}</span>
            <p className="quickstart__hint">{t('onboarding.accountsHint')}</p>
            <div className="quickstart__pills quickstart__pills--wrap">
              {countryPresets.map((p) => {
                const isSelected = selected.includes(p.name);
                const isLocked = !isSelected && atLimit(selected.length, maxAccounts);
                return (
                  <button
                    key={p.name}
                    type="button"
                    className={cn(
                      'quickstart__pill',
                      isSelected && 'is-selected',
                      isLocked && 'is-locked',
                    )}
                    disabled={isLocked}
                    aria-disabled={isLocked}
                    onClick={() => togglePreset(p.name)}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="quickstart__row">
            <div className="field">
              <span className="field__label">{t('onboarding.totalWealth')}</span>
              <Stepper
                value={totalWealth}
                onChange={setTotalWealth}
                min={0}
                step={1000}
                prefix={symbol}
                hideButtons
                ariaLabel={t('onboarding.totalWealth')}
              />
            </div>
            <div className="field">
              <span className="field__label">{t('onboarding.monthlySavings')}</span>
              <Stepper
                value={monthlySavings}
                onChange={setMonthlySavings}
                min={0}
                step={50}
                prefix={symbol}
                hideButtons
                ariaLabel={t('onboarding.monthlySavings')}
              />
            </div>
          </div>

          <div className="quickstart__actions quickstart__actions--split">
            <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>
              {t('onboarding.back')}
            </button>
            <button type="button" className="btn btn--primary" onClick={finish}>
              {t('onboarding.seeResult')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="quickstart__body">
          <div className="quickstart__result-cards">
            <Card className="ov">
              <div className="ov__head">
                <span className="ov__title">{t('overview.retirementTimeline')}</span>
              </div>
              <div className="ov__body">
                <div className="ov__content">
                  <span className="ov__big ov__big--lg">{plan.settings.retirementYear}</span>
                  <span className="ov__sub">
                    {t('onboarding.result.retirementSub', { retireAge: retirementAge })}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="ov">
              <div className="ov__head">
                <span className="ov__title">{t('onboarding.result.wealthTitle')}</span>
              </div>
              <div className="ov__body">
                <div className="ov__content">
                  <span className="ov__big ov__big--lg">{fmt.compact(wealthAtRetirement)}</span>
                  <span className="ov__sub">
                    {t('onboarding.result.wealthSub', { year: plan.settings.retirementYear })}
                  </span>
                </div>
              </div>
            </Card>

            <Card className={cn('ov', depletionYear !== null && 'hero__card--depletion')}>
              <div className="ov__head">
                <span className="ov__title">{t('dashboard.depletionTitle')}</span>
              </div>
              <div className="ov__body">
                <div className="ov__content">
                  <span className="ov__big ov__big--lg">
                    {depletionYear !== null ? depletionYear : t('dashboard.neverDepletes')}
                  </span>
                  {depletionAge !== null && (
                    <span className="ov__sub">
                      {t('dashboard.depletionAgeNote', { age: depletionAge })}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <PortfolioTrendCard projection={projection} currency={plan.currency} />

          <div className="quickstart__actions quickstart__actions--split quickstart__actions--result">
            <button type="button" className="btn btn--ghost" onClick={exploreWithoutAccount}>
              {t('onboarding.result.explore')}
            </button>
            <button type="button" className="btn btn--primary" onClick={save}>
              {t('onboarding.saveBanner.save')}
            </button>
          </div>
        </div>
      )}

      {dialogOpen && (
        <AuthDialog initialMode="signup" onClose={closeDialog} onSignedIn={goToAccount} />
      )}
    </section>
  );
};
