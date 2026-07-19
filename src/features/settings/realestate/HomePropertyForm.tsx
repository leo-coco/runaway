import { forwardRef, useImperativeHandle, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Stepper } from '@/components/ui/Stepper';
import { Toggle } from '@/components/ui/Toggle';
import { BankIcon, HomeIcon, KeyIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import {
  homeEquitySeries,
  homeFlows,
  mortgageAnnualPayment,
  HOME_FLOW_LABEL_KEY,
  type Home,
} from '@/domain/home';
import { createHomeFormSchema, type HomeForm } from '@/schemas/homeSchema';
import { useAppStore } from '@/store';
import { newId } from '@/lib/id';
import { cn } from '@/lib/cn';
import type { Plan } from '@/domain/plan';
import { PropertyFlowPreview, type PreviewFlow } from './PropertyFlowPreview';
import type { PropertyFormHandle } from './PropertyDialog';

interface Props {
  plan: Plan;
  onSaved: () => void;
}

const blankForm = (startYear: number): HomeForm => ({
  name: '',
  currentValue: 500_000,
  appreciationPct: 3,
  ownershipCostPct: 2,
  hasMortgage: false,
  mortgageBalance: 300_000,
  mortgageRatePct: 5,
  mortgageTermYears: 25,
  hasPurchase: false,
  purchaseYear: startYear + 3,
  downPayment: 100_000,
  closingCostPct: 2,
  hasSale: false,
  saleYear: startYear + 20,
  saleFeePct: 5,
  saleCapitalGainsTaxable: false,
  saleProceedsReinvest: 'spread',
  costBasis: 500_000,
});

const homeToForm = (home: Home, startYear: number): HomeForm => {
  const blank = blankForm(startYear);
  return {
    ...blank,
    name: home.name,
    currentValue: home.currentValue,
    appreciationPct: home.appreciationPct,
    ownershipCostPct: home.ownershipCostPct ?? 0,
    hasMortgage: !!home.mortgage,
    mortgageBalance: home.mortgage?.balance ?? blank.mortgageBalance,
    mortgageRatePct: home.mortgage?.ratePct ?? blank.mortgageRatePct,
    mortgageTermYears: home.mortgage?.termYearsRemaining ?? blank.mortgageTermYears,
    hasPurchase: !!home.purchase,
    purchaseYear: home.purchase?.year ?? blank.purchaseYear,
    downPayment: home.purchase?.downPayment ?? blank.downPayment,
    closingCostPct: home.purchase?.closingCostPct ?? blank.closingCostPct,
    hasSale: !!home.sale,
    saleYear: home.sale?.year ?? blank.saleYear,
    saleFeePct: home.sale?.feePct ?? blank.saleFeePct,
    saleCapitalGainsTaxable: home.sale?.capitalGainsTaxable ?? false,
    saleProceedsReinvest: home.sale?.proceedsReinvest ?? 'spread',
    costBasis: home.sale?.costBasis ?? home.currentValue,
  };
};

const formToHome = (form: HomeForm, id: string): Home => ({
  id,
  name: form.name.trim(),
  currentValue: form.currentValue,
  appreciationPct: form.appreciationPct,
  ownershipCostPct: form.ownershipCostPct,
  mortgage: form.hasMortgage
    ? {
        balance: form.mortgageBalance,
        ratePct: form.mortgageRatePct,
        termYearsRemaining: form.mortgageTermYears,
      }
    : undefined,
  purchase: form.hasPurchase
    ? {
        year: form.purchaseYear,
        downPayment: form.downPayment,
        closingCostPct: form.closingCostPct,
      }
    : undefined,
  sale: form.hasSale
    ? {
        year: form.saleYear,
        feePct: form.saleFeePct,
        capitalGainsTaxable: form.saleCapitalGainsTaxable,
        proceedsReinvest: form.saleProceedsReinvest,
        costBasis: form.costBasis,
      }
    : undefined,
});

/**
 * The primary-residence body of the unified property dialog: value, appreciation,
 * ownership cost, an optional mortgage, a future purchase and a planned sale, with
 * a live equity + flows preview. Exposes {@link PropertyFormHandle.submit} so the
 * dialog's shared footer can trigger validation and save. Mirrors the rental body
 * ({@link RentalPropertyForm}); the domain treatment stays separate.
 */
export const HomePropertyForm = forwardRef<PropertyFormHandle, Props>(({ plan, onSaved }, ref) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const setHome = useAppStore((s) => s.setHome);

  const startYear = new Date().getFullYear();
  const maxYear = lifeExpectancyYear(
    plan.settings.currentAge,
    startYear,
    plan.settings.lifeExpectancyAge,
  );
  const horizonYears = Math.max(1, maxYear - startYear);

  const homeFormSchema = useMemo(() => createHomeFormSchema(t, startYear), [t, startYear]);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<HomeForm>({
    resolver: zodResolver(homeFormSchema),
    defaultValues: plan.home ? homeToForm(plan.home, startYear) : blankForm(startYear),
  });

  const onSubmit = (data: HomeForm) => {
    setHome(plan.id, formToHome(data, plan.home?.id ?? newId()));
    onSaved();
  };

  useImperativeHandle(ref, () => ({ submit: () => handleSubmit(onSubmit)() }));

  const form = useWatch({ control }) as HomeForm;
  const previewHome = formToHome({ ...form, name: form.name || t('home.defaultName') }, 'preview');
  const flows = homeFlows(previewHome, startYear) as readonly PreviewFlow[];
  const equity = homeEquitySeries(previewHome, startYear, horizonYears);
  const equityNow = equity[0];
  const equityAtRetire =
    equity.find((e) => e.year === plan.settings.retirementYear) ?? equity[equity.length - 1];
  const mortgagePayment = form.hasMortgage
    ? mortgageAnnualPayment(form.mortgageBalance, form.mortgageRatePct, form.mortgageTermYears)
    : 0;

  const flowLabel = (id: string): string =>
    HOME_FLOW_LABEL_KEY[id] ? t(HOME_FLOW_LABEL_KEY[id]!) : id;

  return (
    <div className="home-form">
      <div className="field home-name-field">
        <span className="ov__sub">{t('home.name')}</span>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <input
              className={cn('search-input', errors.name && 'is-invalid')}
              value={field.value}
              placeholder={t('home.namePlaceholder')}
              aria-label={t('home.name')}
              onChange={field.onChange}
            />
          )}
        />
        {errors.name && <p className="field-error">{errors.name.message}</p>}
      </div>

      <div className="home-basics-grid">
        <label className="phase-field">
          <span className="ov__sub">{t('home.currentValue')}</span>
          <Controller
            control={control}
            name="currentValue"
            render={({ field }) => (
              <Stepper
                ariaLabel={t('home.currentValue')}
                prefix={fmt.symbol}
                min={0}
                step={10_000}
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.currentValue)}
              />
            )}
          />
        </label>
        <label className="phase-field">
          <span className="ov__sub">{t('home.appreciation')}</span>
          <Controller
            control={control}
            name="appreciationPct"
            render={({ field }) => (
              <Stepper
                ariaLabel={t('home.appreciation')}
                suffix="%"
                min={-50}
                max={50}
                step={0.5}
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.appreciationPct)}
              />
            )}
          />
        </label>
        <label className="phase-field">
          <span className="ov__sub">{t('home.ownershipCost')}</span>
          <Controller
            control={control}
            name="ownershipCostPct"
            render={({ field }) => (
              <Stepper
                ariaLabel={t('home.ownershipCost')}
                suffix="%"
                min={0}
                max={20}
                step={0.5}
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.ownershipCostPct)}
              />
            )}
          />
        </label>
      </div>

      <div className="home-options">
        {/* Mortgage */}
        <section className={cn('home-option', form.hasMortgage && 'is-open')}>
          <div className="home-option__head">
            <span className="home-option__icon" aria-hidden="true">
              <BankIcon size={15} />
            </span>
            <span className="home-option__title">{t('home.hasMortgage')}</span>
            <Controller
              control={control}
              name="hasMortgage"
              render={({ field }) => (
                <Toggle
                  checked={field.value}
                  onChange={field.onChange}
                  label={t('home.hasMortgage')}
                />
              )}
            />
          </div>
          {form.hasMortgage && (
            <div className="home-option__content home-option__content--three">
              <label className="phase-field">
                <span className="ov__sub">{t('home.mortgageBalance')}</span>
                <Controller
                  control={control}
                  name="mortgageBalance"
                  render={({ field }) => (
                    <Stepper
                      ariaLabel={t('home.mortgageBalance')}
                      prefix={fmt.symbol}
                      min={0}
                      step={10_000}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </label>
              <label className="phase-field">
                <span className="ov__sub">{t('home.mortgageRate')}</span>
                <Controller
                  control={control}
                  name="mortgageRatePct"
                  render={({ field }) => (
                    <Stepper
                      ariaLabel={t('home.mortgageRate')}
                      suffix="%"
                      min={0}
                      max={30}
                      step={0.25}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </label>
              <label className="phase-field">
                <span className="ov__sub">{t('home.mortgageTerm')}</span>
                <Controller
                  control={control}
                  name="mortgageTermYears"
                  render={({ field }) => (
                    <Stepper
                      ariaLabel={t('home.mortgageTerm')}
                      suffix={t('spending.yearsSuffix')}
                      min={0}
                      max={60}
                      step={1}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </label>
            </div>
          )}
        </section>

        {/* Future purchase */}
        <section className={cn('home-option', form.hasPurchase && 'is-open')}>
          <div className="home-option__head">
            <span className="home-option__icon" aria-hidden="true">
              <HomeIcon size={15} />
            </span>
            <span className="home-option__title">{t('home.hasPurchase')}</span>
            <Controller
              control={control}
              name="hasPurchase"
              render={({ field }) => (
                <Toggle
                  checked={field.value}
                  onChange={field.onChange}
                  label={t('home.hasPurchase')}
                />
              )}
            />
          </div>
          {form.hasPurchase && (
            <div className="home-option__content home-option__content--three">
              <label className="phase-field">
                <span className="ov__sub">{t('home.purchaseYear')}</span>
                <Controller
                  control={control}
                  name="purchaseYear"
                  render={({ field }) => (
                    <Stepper
                      ariaLabel={t('home.purchaseYear')}
                      min={startYear}
                      max={maxYear}
                      step={1}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </label>
              <label className="phase-field">
                <span className="ov__sub">{t('home.downPayment')}</span>
                <Controller
                  control={control}
                  name="downPayment"
                  render={({ field }) => (
                    <Stepper
                      ariaLabel={t('home.downPayment')}
                      prefix={fmt.symbol}
                      min={0}
                      step={10_000}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </label>
              <label className="phase-field">
                <span className="ov__sub">{t('home.closingCost')}</span>
                <Controller
                  control={control}
                  name="closingCostPct"
                  render={({ field }) => (
                    <Stepper
                      ariaLabel={t('home.closingCost')}
                      suffix="%"
                      min={0}
                      max={20}
                      step={0.5}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </label>
            </div>
          )}
        </section>

        {/* Sale / downsizing */}
        <section className={cn('home-option', form.hasSale && 'is-open')}>
          <div className="home-option__head">
            <span className="home-option__icon" aria-hidden="true">
              <KeyIcon size={15} />
            </span>
            <span className="home-option__title">{t('home.hasSale')}</span>
            <Controller
              control={control}
              name="hasSale"
              render={({ field }) => (
                <Toggle checked={field.value} onChange={field.onChange} label={t('home.hasSale')} />
              )}
            />
          </div>
          {form.hasSale && (
            <div className="home-option__content home-option__sale-content">
              <div className="home-option__content-grid">
                <label className="phase-field">
                  <span className="ov__sub">{t('home.saleYear')}</span>
                  <Controller
                    control={control}
                    name="saleYear"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('home.saleYear')}
                        min={startYear}
                        max={maxYear}
                        step={1}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={Boolean(errors.saleYear)}
                      />
                    )}
                  />
                </label>
                <label className="phase-field">
                  <span className="ov__sub">{t('home.saleFee')}</span>
                  <Controller
                    control={control}
                    name="saleFeePct"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('home.saleFee')}
                        suffix="%"
                        min={0}
                        max={20}
                        step={0.5}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </label>
              </div>
              <label className="home-tax-toggle">
                <Controller
                  control={control}
                  name="saleCapitalGainsTaxable"
                  render={({ field }) => (
                    <Toggle
                      checked={field.value}
                      onChange={field.onChange}
                      label={t('home.saleTaxable')}
                    />
                  )}
                />
                <span>{t('home.saleTaxable')}</span>
              </label>
              {form.saleCapitalGainsTaxable && !form.hasPurchase && (
                <label className="phase-field">
                  <span className="ov__sub">{t('home.costBasis')}</span>
                  <Controller
                    control={control}
                    name="costBasis"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('home.costBasis')}
                        prefix={fmt.symbol}
                        min={0}
                        step={10_000}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <p className="field__hint">{t('home.costBasisHint')}</p>
                </label>
              )}
              <div className="phase-field">
                <span className="ov__sub">{t('home.saleReinvest')}</span>
                <Controller
                  control={control}
                  name="saleProceedsReinvest"
                  render={({ field }) => (
                    <div className="seg-tabs" role="radiogroup" aria-label={t('home.saleReinvest')}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={field.value === 'spread'}
                        className={cn('seg-tab', field.value === 'spread' && 'is-active')}
                        onClick={() => field.onChange('spread')}
                      >
                        {t('home.saleReinvestSpread')}
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={field.value === 'cash'}
                        className={cn('seg-tab', field.value === 'cash' && 'is-active')}
                        onClick={() => field.onChange('cash')}
                      >
                        {t('home.saleReinvestCash')}
                      </button>
                    </div>
                  )}
                />
                <p className="field__hint">
                  {form.saleProceedsReinvest === 'cash'
                    ? t('home.saleReinvestCashHint')
                    : t('home.saleReinvestSpreadHint')}
                </p>
              </div>
              {errors.saleYear && <p className="field-error">{errors.saleYear.message}</p>}
            </div>
          )}
        </section>
      </div>

      <PropertyFlowPreview
        plan={plan}
        startYear={startYear}
        flows={flows}
        flowLabel={flowLabel}
        mortgagePayment={mortgagePayment}
        equityNow={equityNow}
        equityAtRetire={equityAtRetire}
        tPrefix="home"
      />
    </div>
  );
});

HomePropertyForm.displayName = 'HomePropertyForm';
