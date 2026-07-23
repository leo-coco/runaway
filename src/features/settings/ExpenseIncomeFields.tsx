import { useTranslation } from 'react-i18next';
import { Stepper } from '@/components/ui/Stepper';
import { Toggle } from '@/components/ui/Toggle';
import { ChevronDownIcon, InfoIcon } from '@/components/icons';
import { ExpenseCategoryIcon } from '@/components/ExpenseCategoryIcon';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { ageInYear } from '@/domain/retirementSettings';
import { cn } from '@/lib/cn';
import type { CurrencyCode } from '@/domain/money';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type ExpenseCategory,
  type ExpenseIncome,
  type FlowFrequency,
} from '@/domain/expenseIncome';

export const EXPENSE_COLOR = 'var(--danger, #f43f5e)';
export const INCOME_COLOR = 'var(--success, #34d399)';

const OFFICIAL_PENSION_SOURCES = [
  {
    countryKey: 'unitedStates',
    href: 'https://www.ssa.gov/prepare/get-benefits-estimate',
  },
  {
    countryKey: 'canada',
    href: 'https://www.canada.ca/en/services/benefits/publicpensions/cpp/retirement-income-calculator.html',
  },
  {
    countryKey: 'france',
    href: 'https://www.info-retraite.fr/portail-info/sites/PortailInformationnel/home/mes-droits-a-la-retraite/age-et-montant-de-ma-retraite/en-synthese-1/quel-sera-le-montant-de-ma-ret-1.html',
  },
] as const;

export const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/** A year Stepper with a "in X years (age N)" read-out — shared by the
 *  one-time Year field and the recurring Start/End Year fields. */
export const YearField = ({
  label,
  ariaLabel,
  value,
  min,
  max,
  currentYear,
  currentAge,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  currentYear: number;
  currentAge: number;
  onChange: (year: number) => void;
}) => {
  const { t } = useTranslation();
  const age = ageInYear(currentAge, currentYear, value);
  return (
    <div className="flow-field">
      <div className="flow-year__head">
        <span className="ov__sub">{label}</span>
        <span className="flow-year__rel">
          {t('expensesIncomes.inYears', { count: Math.max(0, value - currentYear) })}
          {age !== null && ` · ${t('expensesIncomes.ageParen', { age })}`}
        </span>
      </div>
      <Stepper
        ariaLabel={ariaLabel}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={onChange}
      />
    </div>
  );
};

export interface ExpenseIncomeDraft {
  name: string;
  amount: number;
  year: number;
  kind: 'expense' | 'income';
  category: ExpenseCategory;
  inflate: boolean;
  frequency: FlowFrequency;
  endYear: number;
  taxable: boolean;
}

export const draftFromItem = (item: ExpenseIncome): ExpenseIncomeDraft => ({
  name: item.name,
  amount: item.amount,
  year: item.year,
  kind: item.kind,
  category: categoryForKind(item.kind, item.category),
  inflate: item.inflate ?? true,
  frequency: item.frequency ?? 'once',
  endYear: item.endYear ?? item.year,
  taxable: item.taxable ?? true,
});

const categoryForKind = (
  kind: ExpenseIncomeDraft['kind'],
  category: ExpenseCategory | undefined,
): ExpenseCategory => {
  const categories = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return category && categories.includes(category) ? category : 'general';
};

/**
 * The full set of controls for a single expense/income flow — type, frequency,
 * name, amount, year(s), taxable and inflation toggles. Purely controlled (no
 * store access) so it can be reused both by the add/edit dialog and, in the
 * future, any other place that needs the same form.
 */
export const ExpenseIncomeFields = ({
  draft,
  onChange,
  currentYear,
  maxYear,
  currentAge,
  currency,
  inflationPct,
  nameError,
  amountError,
}: {
  draft: ExpenseIncomeDraft;
  onChange: (patch: Partial<ExpenseIncomeDraft>) => void;
  currentYear: number;
  maxYear: number;
  currentAge: number;
  currency: CurrencyCode;
  inflationPct: number;
  nameError?: string;
  amountError?: string;
}) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(currency);
  const isIncome = draft.kind === 'income';
  const isRecurring = draft.frequency === 'recurring';
  const endYr = draft.endYear;
  const availableCategories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const setStart = (y: number) => {
    const newStart = clamp(y, currentYear, maxYear);
    const newEnd = clamp(Math.max(endYr, newStart), newStart, maxYear);
    onChange({ year: newStart, endYear: newEnd });
  };
  const setEnd = (y: number) => onChange({ endYear: clamp(y, draft.year, maxYear) });

  const inflationUntilYear = isRecurring ? endYr : draft.year;
  const inflationFactorAt = (year: number): number =>
    draft.inflate ? Math.pow(1 + inflationPct / 100, year - currentYear) : 1;
  const nominal = draft.amount * inflationFactorAt(draft.year);
  const nominalEnd = draft.amount * inflationFactorAt(endYr);

  return (
    <>
      <div className="flow-card__top">
        <div className="seg-tabs flow-seg" role="tablist" aria-label={t('expensesIncomes.name')}>
          <button
            type="button"
            role="tab"
            aria-selected={!isIncome}
            className={cn('seg-tab seg-tab--expense', !isIncome && 'is-active')}
            onClick={() =>
              onChange({
                kind: 'expense',
                category: categoryForKind('expense', draft.category),
              })
            }
          >
            ↓ {t('expensesIncomes.typeExpense')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isIncome}
            className={cn('seg-tab seg-tab--income', isIncome && 'is-active')}
            onClick={() =>
              onChange({
                kind: 'income',
                category: categoryForKind('income', draft.category),
              })
            }
          >
            ↑ {t('expensesIncomes.typeIncome')}
          </button>
        </div>

        <div
          className="seg-tabs flow-seg flow-seg--freq"
          role="tablist"
          aria-label={t('expensesIncomes.frequencyOnce')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isRecurring}
            className={cn('seg-tab', !isRecurring && 'is-active')}
            onClick={() => onChange({ frequency: 'once' })}
          >
            {t('expensesIncomes.frequencyOnce')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRecurring}
            className={cn('seg-tab', isRecurring && 'is-active')}
            onClick={() =>
              onChange({
                frequency: 'recurring',
                endYear: clamp(draft.year + 5, draft.year, maxYear),
              })
            }
          >
            {t('expensesIncomes.frequencyRecurring')}
          </button>
        </div>
      </div>

      <label className="field flow-name-field">
        <span className="ov__sub">{t('expensesIncomes.name')}</span>
        <input
          className={cn('search-input flow-card__name', nameError && 'is-invalid')}
          value={draft.name}
          placeholder={t(
            isIncome
              ? 'expensesIncomes.namePlaceholderIncome'
              : 'expensesIncomes.namePlaceholderExpense',
          )}
          aria-label={t('expensesIncomes.name')}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {nameError && <p className="field__error">{nameError}</p>}
      </label>

      <label className="field flow-category">
        <span className="ov__sub">{t('expensesIncomes.category')}</span>
        <span className="flow-category__control">
          <span className={cn('flow-category__icon', isIncome ? 'is-income' : 'is-expense')}>
            <ExpenseCategoryIcon category={draft.category} size={17} />
          </span>
          <select
            className="search-input flow-category__select"
            value={draft.category}
            aria-label={t('expensesIncomes.category')}
            onChange={(e) => onChange({ category: e.target.value as ExpenseCategory })}
          >
            {availableCategories.map((c) => (
              <option key={c} value={c}>
                {t(`expensesIncomes.categories.${c}`)}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="flow-category__chevron" size={16} aria-hidden="true" />
        </span>
      </label>

      {isIncome && draft.category === 'pension' && (
        <aside
          className="flow-pension-info"
          aria-label={t('expensesIncomes.pensionInfo.ariaLabel')}
        >
          <InfoIcon className="flow-pension-info__icon" size={18} aria-hidden="true" />
          <div className="flow-pension-info__content">
            <p>{t('expensesIncomes.pensionInfo.body')}</p>
            <div className="flow-pension-info__links">
              {OFFICIAL_PENSION_SOURCES.map(({ countryKey, href }) => (
                <a key={countryKey} href={href} target="_blank" rel="noopener noreferrer">
                  {t(`expensesIncomes.pensionInfo.countries.${countryKey}`)}
                  <span aria-hidden="true"> ↗</span>
                </a>
              ))}
            </div>
          </div>
        </aside>
      )}

      <div className={cn('flow-card__grid', isRecurring && 'flow-card__grid--periodic')}>
        {isRecurring ? (
          <label className="flow-field flow-field--full">
            <span className="ov__sub">{t('expensesIncomes.amount')}</span>
            <Stepper
              ariaLabel={t('expensesIncomes.amountYearly')}
              prefix={fmt.symbol}
              suffix={t('common.perYear')}
              min={0}
              step={1000}
              value={draft.amount}
              invalid={!!amountError}
              onChange={(v) => onChange({ amount: v })}
            />
            {amountError && <p className="field__error">{amountError}</p>}
          </label>
        ) : (
          <label className="flow-field">
            <span className="ov__sub">{t('expensesIncomes.amount')}</span>
            <Stepper
              ariaLabel={t('expensesIncomes.amount')}
              prefix={fmt.symbol}
              min={0}
              step={1000}
              value={draft.amount}
              invalid={!!amountError}
              onChange={(v) => onChange({ amount: v })}
            />
            {amountError && <p className="field__error">{amountError}</p>}
          </label>
        )}

        {isRecurring ? (
          <>
            <YearField
              label={t('expensesIncomes.startYear')}
              ariaLabel={t('expensesIncomes.startYear')}
              value={draft.year}
              min={currentYear}
              max={maxYear}
              currentYear={currentYear}
              currentAge={currentAge}
              onChange={setStart}
            />
            <YearField
              label={t('expensesIncomes.endYear')}
              ariaLabel={t('expensesIncomes.endYear')}
              value={endYr}
              min={draft.year}
              max={maxYear}
              currentYear={currentYear}
              currentAge={currentAge}
              onChange={setEnd}
            />
          </>
        ) : (
          <YearField
            label={t('expensesIncomes.year')}
            ariaLabel={t('expensesIncomes.year')}
            value={draft.year}
            min={currentYear}
            max={Math.max(currentYear, maxYear)}
            currentYear={currentYear}
            currentAge={currentAge}
            onChange={(v) => onChange({ year: v })}
          />
        )}
      </div>

      {isIncome && (
        <div className="flow-inflation">
          <label className="flow-inflation__toggle">
            <Toggle
              checked={draft.taxable}
              onChange={(v) => onChange({ taxable: v })}
              label={t('expensesIncomes.taxableLabel')}
            />
            <span className="ov__sub">{t('expensesIncomes.taxableLabel')}</span>
          </label>
        </div>
      )}

      <div className="flow-inflation">
        <label className="flow-inflation__toggle">
          <Toggle
            checked={draft.inflate}
            onChange={(v) => onChange({ inflate: v })}
            label={t('expensesIncomes.inflationLabel', { year: inflationUntilYear })}
          />
          <span
            className="ov__sub flow-inflation__label-copy"
            title={t('expensesIncomes.inflationLabel', { year: inflationUntilYear })}
          >
            {t('expensesIncomes.inflationLabel', { year: inflationUntilYear })}
          </span>
        </label>
      </div>
      <div className="flow-impact">
        <span className="flow-impact__label">{t('expensesIncomes.estimatedImpact')}</span>
        <span className="flow-projection">
          {isRecurring
            ? t('expensesIncomes.projectionRecurring', {
                from: fmt.compact(draft.amount),
                toStart: fmt.compact(nominal),
                startYear: draft.year,
                toEnd: fmt.compact(nominalEnd),
                endYear: endYr,
              })
            : t('expensesIncomes.projection', {
                from: fmt.compact(draft.amount),
                to: fmt.compact(nominal),
                year: draft.year,
              })}
        </span>
      </div>
    </>
  );
};
