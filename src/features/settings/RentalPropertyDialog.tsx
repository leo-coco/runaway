import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Toggle } from '@/components/ui/Toggle';
import { BankIcon, HomeIcon, KeyIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import { isOpenEndedYear, mortgageAnnualPayment } from '@/domain/home';
import {
  rentalPropertyEquitySeries,
  rentalPropertyFlows,
  rentalFlowLabelKey,
  type RentalProperty,
} from '@/domain/rentalProperty';
import {
  createRentalPropertyFormSchema,
  type RentalPropertyForm,
} from '@/schemas/rentalPropertySchema';
import { cn } from '@/lib/cn';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  /** The property being edited, or undefined to add a new one. */
  initial?: RentalProperty;
  onSave: (data: Omit<RentalProperty, 'id'>) => void;
  onClose: () => void;
}

const blankForm = (startYear: number): RentalPropertyForm => ({
  name: '',
  currentValue: 300_000,
  appreciationPct: 3,
  monthlyRent: 1_500,
  rentInflationPct: 2,
  vacancyPct: 5,
  managementFeePct: 0,
  propertyTaxAnnual: 1_500,
  maintenancePct: 1,
  insuranceAnnual: 400,
  taxMode: 'net',
  hasMortgage: false,
  mortgageBalance: 200_000,
  mortgageRatePct: 4,
  mortgageTermYears: 25,
  hasPurchase: false,
  purchaseYear: startYear + 3,
  downPayment: 60_000,
  closingCostPct: 3,
  hasSale: false,
  saleYear: startYear + 20,
  saleFeePct: 5,
  saleCapitalGainsTaxable: true,
  costBasis: 300_000,
});

const propertyToForm = (p: RentalProperty, startYear: number): RentalPropertyForm => {
  const blank = blankForm(startYear);
  return {
    ...blank,
    name: p.name,
    currentValue: p.currentValue,
    appreciationPct: p.appreciationPct,
    monthlyRent: p.monthlyRent,
    rentInflationPct: p.rentInflationPct,
    vacancyPct: p.vacancyPct,
    managementFeePct: p.managementFeePct ?? 0,
    propertyTaxAnnual: p.propertyTaxAnnual ?? 0,
    maintenancePct: p.maintenancePct ?? 0,
    insuranceAnnual: p.insuranceAnnual ?? 0,
    taxMode: p.taxMode ?? 'net',
    hasMortgage: !!p.mortgage,
    mortgageBalance: p.mortgage?.balance ?? blank.mortgageBalance,
    mortgageRatePct: p.mortgage?.ratePct ?? blank.mortgageRatePct,
    mortgageTermYears: p.mortgage?.termYearsRemaining ?? blank.mortgageTermYears,
    hasPurchase: !!p.purchase,
    purchaseYear: p.purchase?.year ?? blank.purchaseYear,
    downPayment: p.purchase?.downPayment ?? blank.downPayment,
    closingCostPct: p.purchase?.closingCostPct ?? blank.closingCostPct,
    hasSale: !!p.sale,
    saleYear: p.sale?.year ?? blank.saleYear,
    saleFeePct: p.sale?.feePct ?? blank.saleFeePct,
    saleCapitalGainsTaxable: p.sale?.capitalGainsTaxable ?? true,
    costBasis: p.sale?.costBasis ?? p.currentValue,
  };
};

const formToProperty = (form: RentalPropertyForm): Omit<RentalProperty, 'id'> => ({
  name: form.name.trim(),
  currentValue: form.currentValue,
  appreciationPct: form.appreciationPct,
  monthlyRent: form.monthlyRent,
  rentInflationPct: form.rentInflationPct,
  vacancyPct: form.vacancyPct,
  managementFeePct: form.managementFeePct,
  propertyTaxAnnual: form.propertyTaxAnnual,
  maintenancePct: form.maintenancePct,
  insuranceAnnual: form.insuranceAnnual,
  taxMode: form.taxMode,
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
        costBasis: form.costBasis,
      }
    : undefined,
});

/**
 * Describe a single rental property — value, appreciation, rent, vacancy, rent
 * indexation, operating costs (management, tax, maintenance, insurance), an
 * optional mortgage, a future purchase and a planned sale — and how its rent is
 * taxed. A live preview shows the cashflows and equity that will be generated
 * before saving. The property never enters the drawdown pool.
 */
export const RentalPropertyDialog = ({ plan, initial, onSave, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);

  const startYear = new Date().getFullYear();
  const inflationPct = plan.settings.inflationPct;
  const maxYear = lifeExpectancyYear(
    plan.settings.currentAge,
    startYear,
    plan.settings.lifeExpectancyAge,
  );
  const horizonYears = Math.max(1, maxYear - startYear);

  const schema = useMemo(() => createRentalPropertyFormSchema(t, startYear), [t, startYear]);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RentalPropertyForm>({
    resolver: zodResolver(schema),
    defaultValues: initial ? propertyToForm(initial, startYear) : blankForm(startYear),
  });

  const form = useWatch({ control }) as RentalPropertyForm;
  const preview: RentalProperty = {
    ...formToProperty({ ...form, name: form.name || t('rental.defaultName') }),
    id: 'preview',
  };
  const flows = rentalPropertyFlows(preview, startYear, inflationPct);
  const equity = rentalPropertyEquitySeries(preview, startYear, horizonYears);
  const equityNow = equity[0];
  const equityAtRetire =
    equity.find((e) => e.year === plan.settings.retirementYear) ?? equity[equity.length - 1];
  const mortgagePayment = form.hasMortgage
    ? mortgageAnnualPayment(form.mortgageBalance, form.mortgageRatePct, form.mortgageTermYears)
    : 0;

  const onSubmit = (data: RentalPropertyForm) => {
    onSave(formToProperty(data));
    onClose();
  };

  const flowLabel = (id: string): string => {
    const key = rentalFlowLabelKey(id);
    return key ? t(key) : id;
  };

  return (
    <Modal
      title={initial ? t('rental.editTitle') : t('rental.addTitle')}
      description={t('rental.desc')}
      onClose={onClose}
      wide
      className="home-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="home-form">
        <div className="field home-name-field">
          <span className="ov__sub">{t('rental.name')}</span>
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <input
                className={cn('search-input', errors.name && 'is-invalid')}
                value={field.value}
                placeholder={t('rental.namePlaceholder')}
                aria-label={t('rental.name')}
                onChange={field.onChange}
              />
            )}
          />
          {errors.name && <p className="field-error">{errors.name.message}</p>}
        </div>

        <div className="home-basics-grid">
          <label className="phase-field">
            <span className="ov__sub">{t('rental.currentValue')}</span>
            <Controller
              control={control}
              name="currentValue"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.currentValue')}
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
            <span className="ov__sub">{t('rental.appreciation')}</span>
            <Controller
              control={control}
              name="appreciationPct"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.appreciation')}
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
        </div>

        {/* Rental income */}
        <div className="home-basics-grid">
          <label className="phase-field">
            <span className="ov__sub">{t('rental.monthlyRent')}</span>
            <Controller
              control={control}
              name="monthlyRent"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.monthlyRent')}
                  prefix={fmt.symbol}
                  min={0}
                  step={100}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.monthlyRent)}
                />
              )}
            />
          </label>
          <label className="phase-field">
            <span className="ov__sub">{t('rental.rentInflation')}</span>
            <Controller
              control={control}
              name="rentInflationPct"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.rentInflation')}
                  suffix="%"
                  min={-50}
                  max={50}
                  step={0.5}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.rentInflationPct)}
                />
              )}
            />
          </label>
          <label className="phase-field">
            <span className="ov__sub">{t('rental.vacancy')}</span>
            <Controller
              control={control}
              name="vacancyPct"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.vacancy')}
                  suffix="%"
                  min={0}
                  max={100}
                  step={1}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.vacancyPct)}
                />
              )}
            />
          </label>
        </div>

        {/* Operating costs */}
        <div className="home-basics-grid">
          <label className="phase-field">
            <span className="ov__sub">{t('rental.managementFee')}</span>
            <Controller
              control={control}
              name="managementFeePct"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.managementFee')}
                  suffix="%"
                  min={0}
                  max={50}
                  step={0.5}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </label>
          <label className="phase-field">
            <span className="ov__sub">{t('rental.propertyTax')}</span>
            <Controller
              control={control}
              name="propertyTaxAnnual"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.propertyTax')}
                  prefix={fmt.symbol}
                  min={0}
                  step={100}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </label>
          <label className="phase-field">
            <span className="ov__sub">{t('rental.maintenance')}</span>
            <Controller
              control={control}
              name="maintenancePct"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.maintenance')}
                  suffix="%"
                  min={0}
                  max={20}
                  step={0.25}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </label>
          <label className="phase-field">
            <span className="ov__sub">{t('rental.insurance')}</span>
            <Controller
              control={control}
              name="insuranceAnnual"
              render={({ field }) => (
                <Stepper
                  ariaLabel={t('rental.insurance')}
                  prefix={fmt.symbol}
                  min={0}
                  step={100}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </label>
        </div>

        {/* Tax treatment of the rent */}
        <label className="home-tax-toggle">
          <Controller
            control={control}
            name="taxMode"
            render={({ field }) => (
              <Toggle
                checked={field.value === 'net'}
                onChange={(checked) => field.onChange(checked ? 'net' : 'gross')}
                label={t('rental.taxModeNet')}
              />
            )}
          />
          <span>{t('rental.taxModeNet')}</span>
        </label>
        <p className="field__hint">
          {form.taxMode === 'net' ? t('rental.taxModeNetHint') : t('rental.taxModeGrossHint')}
        </p>

        <div className="home-options">
          {/* Mortgage */}
          <section className={cn('home-option', form.hasMortgage && 'is-open')}>
            <div className="home-option__head">
              <span className="home-option__icon" aria-hidden="true">
                <BankIcon size={15} />
              </span>
              <span className="home-option__title">{t('rental.hasMortgage')}</span>
              <Controller
                control={control}
                name="hasMortgage"
                render={({ field }) => (
                  <Toggle
                    checked={field.value}
                    onChange={field.onChange}
                    label={t('rental.hasMortgage')}
                  />
                )}
              />
            </div>
            {form.hasMortgage && (
              <div className="home-option__content home-option__content--three">
                <label className="phase-field">
                  <span className="ov__sub">{t('rental.mortgageBalance')}</span>
                  <Controller
                    control={control}
                    name="mortgageBalance"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('rental.mortgageBalance')}
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
                  <span className="ov__sub">{t('rental.mortgageRate')}</span>
                  <Controller
                    control={control}
                    name="mortgageRatePct"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('rental.mortgageRate')}
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
                  <span className="ov__sub">{t('rental.mortgageTerm')}</span>
                  <Controller
                    control={control}
                    name="mortgageTermYears"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('rental.mortgageTerm')}
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
              <span className="home-option__title">{t('rental.hasPurchase')}</span>
              <Controller
                control={control}
                name="hasPurchase"
                render={({ field }) => (
                  <Toggle
                    checked={field.value}
                    onChange={field.onChange}
                    label={t('rental.hasPurchase')}
                  />
                )}
              />
            </div>
            {form.hasPurchase && (
              <div className="home-option__content home-option__content--three">
                <label className="phase-field">
                  <span className="ov__sub">{t('rental.purchaseYear')}</span>
                  <Controller
                    control={control}
                    name="purchaseYear"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('rental.purchaseYear')}
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
                  <span className="ov__sub">{t('rental.downPayment')}</span>
                  <Controller
                    control={control}
                    name="downPayment"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('rental.downPayment')}
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
                  <span className="ov__sub">{t('rental.closingCost')}</span>
                  <Controller
                    control={control}
                    name="closingCostPct"
                    render={({ field }) => (
                      <Stepper
                        ariaLabel={t('rental.closingCost')}
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

          {/* Sale */}
          <section className={cn('home-option', form.hasSale && 'is-open')}>
            <div className="home-option__head">
              <span className="home-option__icon" aria-hidden="true">
                <KeyIcon size={15} />
              </span>
              <span className="home-option__title">{t('rental.hasSale')}</span>
              <Controller
                control={control}
                name="hasSale"
                render={({ field }) => (
                  <Toggle
                    checked={field.value}
                    onChange={field.onChange}
                    label={t('rental.hasSale')}
                  />
                )}
              />
            </div>
            {form.hasSale && (
              <div className="home-option__content home-option__sale-content">
                <div className="home-option__content-grid">
                  <label className="phase-field">
                    <span className="ov__sub">{t('rental.saleYear')}</span>
                    <Controller
                      control={control}
                      name="saleYear"
                      render={({ field }) => (
                        <Stepper
                          ariaLabel={t('rental.saleYear')}
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
                    <span className="ov__sub">{t('rental.saleFee')}</span>
                    <Controller
                      control={control}
                      name="saleFeePct"
                      render={({ field }) => (
                        <Stepper
                          ariaLabel={t('rental.saleFee')}
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
                        label={t('rental.saleTaxable')}
                      />
                    )}
                  />
                  <span>{t('rental.saleTaxable')}</span>
                </label>
                {form.saleCapitalGainsTaxable && !form.hasPurchase && (
                  <label className="phase-field">
                    <span className="ov__sub">{t('rental.costBasis')}</span>
                    <Controller
                      control={control}
                      name="costBasis"
                      render={({ field }) => (
                        <Stepper
                          ariaLabel={t('rental.costBasis')}
                          prefix={fmt.symbol}
                          min={0}
                          step={10_000}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                    <p className="field__hint">{t('rental.costBasisHint')}</p>
                  </label>
                )}
                {errors.saleYear && <p className="field-error">{errors.saleYear.message}</p>}
              </div>
            )}
          </section>
        </div>

        {/* Live preview: equity + generated flows */}
        <section className="home-preview">
          <div className="home-equity-grid">
            <div className="home-equity-card">
              <HomeIcon size={16} aria-hidden="true" />
              <div className="home-equity-card__copy">
                <span>{t('rental.equityNow')}</span>
                <strong>{fmt.compact(equityNow?.equity ?? 0)}</strong>
                <small>
                  {t('rental.equityBreakdown', {
                    value: fmt.compact(equityNow?.value ?? 0),
                    mortgage: fmt.compact(equityNow?.mortgageBalance ?? 0),
                  })}
                </small>
              </div>
            </div>
            <div className="home-equity-card">
              <HomeIcon size={16} aria-hidden="true" />
              <div className="home-equity-card__copy">
                <span>{t('rental.equityAt')}</span>
                <strong>{fmt.compact(equityAtRetire?.equity ?? 0)}</strong>
                <small>
                  {t('rental.equityBreakdown', {
                    value: fmt.compact(equityAtRetire?.value ?? 0),
                    mortgage: fmt.compact(equityAtRetire?.mortgageBalance ?? 0),
                  })}
                </small>
              </div>
            </div>
          </div>

          <h4 className="home-preview__title">{t('rental.previewTitle')}</h4>
          {flows.length === 0 ? (
            <p className="field__hint home-preview__empty">{t('rental.noFlows')}</p>
          ) : (
            <div className="home-flow-table" role="table">
              {flows.map((f) => {
                const isIncome = f.kind === 'income';
                const recurring = f.frequency === 'recurring';
                const openEnded = recurring && isOpenEndedYear(f.endYear ?? f.year, startYear);
                const yearLabel = recurring && !openEnded ? `${f.year}–${f.endYear}` : `${f.year}`;
                const isMortgage = f.id.endsWith(':mortgage');
                const amountLabel = isMortgage
                  ? `${fmt.compact(mortgagePayment)}${t('common.perYear')}`
                  : `${isIncome ? '+' : '-'}${fmt.compact(f.amount)}${recurring ? t('common.perYear') : ''}`;
                const FlowIcon = isMortgage
                  ? BankIcon
                  : f.id.endsWith(':sale')
                    ? KeyIcon
                    : HomeIcon;
                return (
                  <div className="home-flow-row" role="row" key={f.id}>
                    <span className="home-flow-row__icon" aria-hidden="true">
                      <FlowIcon size={14} />
                    </span>
                    <span className="home-flow-row__name">{flowLabel(f.id)}</span>
                    <strong className={cn(isIncome ? 'is-income' : 'is-expense')}>
                      {amountLabel}
                    </strong>
                    <span className="home-flow-row__period">{yearLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};
