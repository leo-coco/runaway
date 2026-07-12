import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Toggle } from '@/components/ui/Toggle';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import {
  homeEquitySeries,
  homeFlows,
  mortgageAnnualPayment,
  HOME_FLOW_LABEL_KEY,
  type Home,
} from '@/domain/home';
import { homeFormSchema, type HomeForm } from '@/schemas/homeSchema';
import { useAppStore } from '@/store';
import { newId } from '@/lib/id';
import { cn } from '@/lib/cn';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  onClose: () => void;
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
      }
    : undefined,
});

/**
 * Describe a primary residence — value, appreciation, ownership costs, an
 * optional mortgage, a future purchase and a planned sale — and let the plan turn
 * it into the cashflows that drive the projection and Monte Carlo. The home never
 * enters the drawdown pool; only its purchase/mortgage/ownership/sale flows do,
 * plus a separately tracked equity line. A live preview shows exactly what will
 * be generated before saving.
 */
export const HomeModal = ({ plan, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const setHome = useAppStore((s) => s.setHome);
  const removeHome = useAppStore((s) => s.removeHome);

  const startYear = new Date().getFullYear();
  const maxYear = lifeExpectancyYear(
    plan.settings.currentAge,
    startYear,
    plan.settings.lifeExpectancyAge,
  );
  const horizonYears = Math.max(1, maxYear - startYear);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<HomeForm>({
    resolver: zodResolver(homeFormSchema),
    defaultValues: plan.home ? homeToForm(plan.home, startYear) : blankForm(startYear),
  });

  const form = useWatch({ control }) as HomeForm;
  // A live Home from the current form, used only to preview flows and equity.
  const previewHome = formToHome({ ...form, name: form.name || t('home.defaultName') }, 'preview');
  const flows = homeFlows(previewHome, startYear);
  const equity = homeEquitySeries(previewHome, startYear, horizonYears);
  const equityNow = equity[0];
  const equityAtRetire =
    equity.find((e) => e.year === plan.settings.retirementYear) ?? equity[equity.length - 1];
  const mortgagePayment = form.hasMortgage
    ? mortgageAnnualPayment(form.mortgageBalance, form.mortgageRatePct, form.mortgageTermYears)
    : 0;

  const onSubmit = (data: HomeForm) => {
    setHome(plan.id, formToHome(data, plan.home?.id ?? newId()));
    onClose();
  };

  const handleRemove = () => {
    removeHome(plan.id);
    onClose();
  };

  const flowLabel = (id: string): string =>
    HOME_FLOW_LABEL_KEY[id] ? t(HOME_FLOW_LABEL_KEY[id]!) : id;

  return (
    <Modal
      title={t('home.title')}
      description={t('home.desc')}
      onClose={onClose}
      wide
      footer={
        <>
          {plan.home && (
            <Button variant="danger" onClick={handleRemove} style={{ marginRight: 'auto' }}>
              {t('home.remove')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      {/* Basics */}
      <div className="field">
        <span className="field__label">{t('home.name')}</span>
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

      <div className="phase-grid">
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
      <p className="field__hint">{t('home.ownershipHint')}</p>

      <div className="divider" />

      {/* Mortgage */}
      <div className="flow-inflation">
        <label className="flow-inflation__toggle">
          <Controller
            control={control}
            name="hasMortgage"
            render={({ field }) => (
              <Toggle checked={field.value} onChange={field.onChange} label={t('home.hasMortgage')} />
            )}
          />
          <span className="field__label">{t('home.hasMortgage')}</span>
        </label>
      </div>
      {form.hasMortgage && (
        <div className="phase-grid">
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

      <div className="divider" />

      {/* Future purchase */}
      <div className="flow-inflation">
        <label className="flow-inflation__toggle">
          <Controller
            control={control}
            name="hasPurchase"
            render={({ field }) => (
              <Toggle checked={field.value} onChange={field.onChange} label={t('home.hasPurchase')} />
            )}
          />
          <span className="field__label">{t('home.hasPurchase')}</span>
        </label>
      </div>
      {form.hasPurchase && (
        <div className="phase-grid">
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

      <div className="divider" />

      {/* Sale / downsizing */}
      <div className="flow-inflation">
        <label className="flow-inflation__toggle">
          <Controller
            control={control}
            name="hasSale"
            render={({ field }) => (
              <Toggle checked={field.value} onChange={field.onChange} label={t('home.hasSale')} />
            )}
          />
          <span className="field__label">{t('home.hasSale')}</span>
        </label>
      </div>
      {form.hasSale && (
        <>
          <div className="phase-grid">
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
          <div className="flow-inflation">
            <label className="flow-inflation__toggle">
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
              <span className="ov__sub">{t('home.saleTaxable')}</span>
            </label>
          </div>
          {errors.saleYear && <p className="field-error">{errors.saleYear.message}</p>}
        </>
      )}

      <div className="divider" />

      {/* Live preview: equity + generated flows */}
      <div className="field">
        <span className="field__label">{t('home.previewTitle')}</span>
        <div className="phase-cards">
          <div className="phase-card">
            <div className="phase-card__note">{t('home.equityNow')}</div>
            <div className="phase-card__value">{fmt.compact(equityNow?.equity ?? 0)}</div>
            <div className="phase-card__note">
              {t('home.equityBreakdown', {
                value: fmt.compact(equityNow?.value ?? 0),
                mortgage: fmt.compact(equityNow?.mortgageBalance ?? 0),
              })}
            </div>
          </div>
          <div className="phase-card">
            <div className="phase-card__note">
              {t('home.equityAt', { year: equityAtRetire?.year ?? plan.settings.retirementYear })}
            </div>
            <div className="phase-card__value">{fmt.compact(equityAtRetire?.equity ?? 0)}</div>
            <div className="phase-card__note">
              {t('home.equityBreakdown', {
                value: fmt.compact(equityAtRetire?.value ?? 0),
                mortgage: fmt.compact(equityAtRetire?.mortgageBalance ?? 0),
              })}
            </div>
          </div>
        </div>

        {flows.length === 0 ? (
          <p className="field__hint">{t('home.noFlows')}</p>
        ) : (
          <div className="flow-cards">
            {flows.map((f) => {
              const isIncome = f.kind === 'income';
              const recurring = f.frequency === 'recurring';
              const yearLabel = recurring ? `${f.year}–${f.endYear}` : `${f.year}`;
              const amountLabel =
                f.id === 'home:mortgage'
                  ? `${fmt.compact(mortgagePayment)}${t('common.perYear')}`
                  : `${isIncome ? '+' : '-'}${fmt.compact(f.amount)}${recurring ? t('common.perYear') : ''}`;
              return (
                <div
                  key={f.id}
                  className={cn('flow-card', 'flow-card--readonly', isIncome ? 'flow-card--income' : 'flow-card--expense')}
                >
                  <div className="flow-card__name flow-card__name--readonly">{flowLabel(f.id)}</div>
                  <div className="flow-card__detail">
                    <span className="flow-card__amount">{amountLabel}</span>
                    <span className="ov__sub">{yearLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="field__hint">{t('home.flowsNote')}</p>
      </div>
    </Modal>
  );
};
