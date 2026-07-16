import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { InfoIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import {
  createRetirementSettingsFormSchema,
  type RetirementSettingsForm,
} from '@/schemas/retirementSettingsSchema';
import { safeWithdrawalRate, type SwrZone } from '@/domain/withdrawalRate';
import { useAppStore } from '@/store';
import { useFeature } from '@/hooks/useEntitlements';
import { ProBadge } from '@/features/billing/ProBadge';
import {
  DEFAULT_PHASED_SPENDING,
  realSpendingMultiplier,
  type PhasedSpendingConfig,
} from '@/domain/spendingModel';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  /** Projected portfolio value at the retirement year (plan currency). */
  retirementValue: number;
  onSave: (form: RetirementSettingsForm) => void;
  onClose: () => void;
}

const ZONE_COLOR: Record<SwrZone, string> = {
  safe: 'var(--success)',
  caution: 'var(--amber)',
  high_risk: 'var(--danger, #f43f5e)',
};

const PHASE_COLOR = {
  goGo: 'var(--phase-go-go)',
  slowGo: 'var(--phase-slow-go)',
  noGo: 'var(--phase-no-go)',
} as const;

/** Small SVG of the real-spending path across the retirement, with phase bands. */
const PhaseCurve = ({
  retireAge,
  lifeExpectancyAge,
  cfg,
}: {
  retireAge: number;
  lifeExpectancyAge: number;
  cfg: PhasedSpendingConfig;
}) => {
  const W = 520;
  const H = 150;
  const padX = 8;
  const padY = 12;
  const a0 = Math.min(retireAge, cfg.goGoEndAge);
  const a1 = Math.max(lifeExpectancyAge, cfg.slowGoEndAge + 1);
  const span = Math.max(1, a1 - a0);
  const x = (age: number) => padX + ((age - a0) / span) * (W - 2 * padX);

  const ages: number[] = [];
  for (let a = a0; a <= a1; a += 1) ages.push(a);
  // Scale the Y axis to the highest multiplier so positive (rising) adjustments
  // stay in view; the baseline is 0 and the top is the peak real multiplier.
  const yMax = Math.max(1, ...ages.map((a) => realSpendingMultiplier(a, cfg)));
  const y = (m: number) => padY + (1 - m / yMax) * (H - 2 * padY);

  const pts = ages.map((a) => `${x(a).toFixed(1)},${y(realSpendingMultiplier(a, cfg)).toFixed(1)}`);
  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `M ${x(a0).toFixed(1)},${y(0).toFixed(1)} L ${pts.join(' L ')} L ${x(a1).toFixed(1)},${y(0).toFixed(1)} Z`;
  const floorY = y(cfg.floorPct / 100);

  const bands: Array<{ from: number; to: number; key: keyof typeof PHASE_COLOR }> = [
    { from: a0, to: cfg.goGoEndAge, key: 'goGo' },
    { from: cfg.goGoEndAge, to: cfg.slowGoEndAge, key: 'slowGo' },
    { from: cfg.slowGoEndAge, to: a1, key: 'noGo' },
  ];

  return (
    <svg className="spend-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
      {bands.map((b) => (
        <rect
          key={b.key}
          x={x(b.from)}
          y={padY}
          width={Math.max(0, x(b.to) - x(b.from))}
          height={H - 2 * padY}
          fill={PHASE_COLOR[b.key]}
          opacity="var(--phase-band-opacity)"
        />
      ))}
      <line
        x1={padX}
        x2={W - padX}
        y1={floorY}
        y2={floorY}
        stroke="var(--danger, #f43f5e)"
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.5}
      />
      <path d={areaPath} fill="var(--phase-curve)" opacity={0.06} />
      <path d={linePath} fill="none" stroke="var(--phase-curve)" strokeWidth={2.5} />
    </svg>
  );
};

export const RetirementSettingsModal = ({ plan, retirementValue, onSave, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const openPaywall = useAppStore((s) => s.openPaywall);
  const phased = plan.settings.phasedSpending ?? DEFAULT_PHASED_SPENDING;
  // Phased spending is premium. A plan already in phased mode (e.g. built under a
  // now-lapsed grant) stays editable so its numbers are never lost; free users
  // just cannot switch a linear plan over to phased.
  const canPhased = useFeature('phasedSpending');
  const retirementSettingsFormSchema = useMemo(() => createRetirementSettingsFormSchema(t), [t]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RetirementSettingsForm>({
    resolver: zodResolver(retirementSettingsFormSchema),
    defaultValues: {
      expensePeriod: plan.settings.expensePeriod,
      annualSpending: plan.settings.annualSpending,
      inflationPct: plan.settings.inflationPct,
      spendingMode: plan.settings.spendingMode ?? 'linear',
      goGoEndAge: phased.goGoEndAge,
      slowGoEndAge: phased.slowGoEndAge,
      slowGoAdjustmentPct: phased.slowGoAdjustmentPct,
      noGoAdjustmentPct: phased.noGoAdjustmentPct,
      floorPct: phased.floorPct,
    },
  });

  const mode = useWatch({ control, name: 'spendingMode' });
  const annual = useWatch({ control, name: 'annualSpending' });
  const goGoEndAge = useWatch({ control, name: 'goGoEndAge' });
  const slowGoEndAge = useWatch({ control, name: 'slowGoEndAge' });
  const slowGoAdjustmentPct = useWatch({ control, name: 'slowGoAdjustmentPct' });
  const noGoAdjustmentPct = useWatch({ control, name: 'noGoAdjustmentPct' });
  const floorPct = useWatch({ control, name: 'floorPct' });

  // Live Safe Withdrawal Rate: first-year spending vs the projected nest egg.
  const swr = safeWithdrawalRate(annual, retirementValue);

  // Map calendar settings to ages for the phase model.
  const baseYear = new Date().getFullYear();
  const currentAge = plan.settings.currentAge;
  const ageKnown = currentAge > 0;
  const retireAge = ageKnown
    ? Math.max(0, currentAge + (plan.settings.retirementYear - baseYear))
    : 0;
  const lifeExpectancyAge = plan.settings.lifeExpectancyAge;

  const cfg: PhasedSpendingConfig = {
    goGoEndAge,
    slowGoEndAge,
    slowGoAdjustmentPct,
    noGoAdjustmentPct,
    floorPct,
  };
  const slowGoYearly = annual * realSpendingMultiplier(slowGoEndAge, cfg);
  const noGoYearly = annual * realSpendingMultiplier(lifeExpectancyAge, cfg);
  const goGoBeforeRetire = ageKnown && goGoEndAge < retireAge;

  // Signed percent for the phase notes, e.g. "+1.5" / "−1.5".
  const signed = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;

  const resetPhases = () => {
    setValue('goGoEndAge', DEFAULT_PHASED_SPENDING.goGoEndAge, { shouldDirty: true });
    setValue('slowGoEndAge', DEFAULT_PHASED_SPENDING.slowGoEndAge, { shouldDirty: true });
    setValue('slowGoAdjustmentPct', DEFAULT_PHASED_SPENDING.slowGoAdjustmentPct, {
      shouldDirty: true,
    });
    setValue('noGoAdjustmentPct', DEFAULT_PHASED_SPENDING.noGoAdjustmentPct, { shouldDirty: true });
    setValue('floorPct', DEFAULT_PHASED_SPENDING.floorPct, { shouldDirty: true });
  };

  const budgetEntry = (
    <Controller
      control={control}
      name="annualSpending"
      render={({ field }) => (
        <div className="timeline-row__inputs">
          <label className="timeline-field">
            <span className="ov__sub">{t('spending.monthly')}</span>
            <Stepper
              ariaLabel={t('spending.ariaMonthly')}
              suffix={plan.currency}
              min={0}
              step={100}
              value={Math.round(field.value / 12)}
              onChange={(v) => field.onChange(v * 12)}
              invalid={Boolean(errors.annualSpending)}
            />
          </label>
          <label className="timeline-field">
            <span className="ov__sub">{t('spending.yearly')}</span>
            <Stepper
              ariaLabel={t('spending.ariaYearly')}
              suffix={plan.currency}
              min={0}
              step={1000}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              invalid={Boolean(errors.annualSpending)}
            />
          </label>
        </div>
      )}
    />
  );

  return (
    <Modal
      title={t('spending.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit(onSave)} disabled={goGoBeforeRetire}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="seg-tabs" role="tablist" aria-label={t('spending.modeLabel')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'linear'}
          className={`seg-tab ${mode === 'linear' ? 'is-active' : ''}`}
          onClick={() => setValue('spendingMode', 'linear', { shouldDirty: true })}
        >
          {t('spending.modeLinear')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'phased'}
          className={`seg-tab ${mode === 'phased' ? 'is-active' : ''}`}
          onClick={() =>
            canPhased || mode === 'phased'
              ? setValue('spendingMode', 'phased', { shouldDirty: true })
              : openPaywall('phasedSpending')
          }
        >
          {t('spending.modePhased')}
          {!canPhased && mode !== 'phased' && <ProBadge />}
        </button>
      </div>

      {/* Current withdrawal rate — colour-coded bubble (green / amber / red). */}
      {swr ? (
        <div
          className="swr-bubble"
          style={{
            borderColor: `color-mix(in srgb, ${ZONE_COLOR[swr.zone]} 50%, transparent)`,
            background: `color-mix(in srgb, ${ZONE_COLOR[swr.zone]} 12%, transparent)`,
          }}
        >
          <span className="swr-line__dot" style={{ background: ZONE_COLOR[swr.zone] }} />
          {t('spending.currentSwr')}{' '}
          <b style={{ color: ZONE_COLOR[swr.zone] }}>{swr.rate.toFixed(1)}%</b>
          <span
            className="tip-host swr-tip-host"
            tabIndex={0}
            aria-label={t('spending.swrTipAria')}
          >
            <InfoIcon size={14} />
            <span className="tip-bubble tip-bubble--wide" role="tooltip">
              <b>{t('spending.swrTipTitle')}</b>
              <br />
              {t('spending.swrTipWhat')}
              <br />
              <br />
              {t('spending.swrTipFormula', {
                spending: fmt.compact(annual),
                value: fmt.compact(retirementValue),
                rate: swr.rate.toFixed(1),
              })}
              <br />
              <br />
              {t('spending.swrTipZones')}
              <br />
              {t('spending.swrTipDisclaimer')}
            </span>
          </span>
        </div>
      ) : (
        <p className="field__hint">{t('spending.addAssetsSwr')}</p>
      )}

      <div className="field">
        <span className="field__label">
          {mode === 'phased' ? t('spending.initialBudget') : t('spending.lifestyleSpending')}
        </span>
        {budgetEntry}
        <p className="field__hint">{t('spending.netMonthlyHint')}</p>
        {errors.annualSpending && <p className="field-error">{errors.annualSpending.message}</p>}
      </div>

      {mode === 'linear' ? null : (
        <div className="spend-phased">
          {!ageKnown && <p className="field__hint">{t('spending.ageNeeded')}</p>}

          <PhaseCurve retireAge={retireAge} lifeExpectancyAge={lifeExpectancyAge} cfg={cfg} />

          <div className="phase-cards">
            <div className="phase-card" style={{ borderColor: PHASE_COLOR.goGo }}>
              <div className="phase-card__head">
                <span className="phase-card__dot" style={{ background: PHASE_COLOR.goGo }} />
                <span className="phase-card__name">{t('spending.goGo')}</span>
                <span className="phase-card__ages">
                  {ageKnown ? `${retireAge}–${goGoEndAge}` : `–${goGoEndAge}`}
                </span>
              </div>
              <div className="phase-card__value">{fmt.compact(annual)}/yr</div>
              <div className="phase-card__note">{t('spending.goGoNote')}</div>
            </div>

            <div className="phase-card" style={{ borderColor: PHASE_COLOR.slowGo }}>
              <div className="phase-card__head">
                <span className="phase-card__dot" style={{ background: PHASE_COLOR.slowGo }} />
                <span className="phase-card__name">{t('spending.slowGo')}</span>
                <span className="phase-card__ages">
                  {goGoEndAge}–{slowGoEndAge}
                </span>
              </div>
              <div className="phase-card__value">{fmt.compact(slowGoYearly)}/yr</div>
              <div className="phase-card__note">
                {t('spending.adjustmentNote', { pct: signed(slowGoAdjustmentPct) })}
              </div>
            </div>

            <div className="phase-card" style={{ borderColor: PHASE_COLOR.noGo }}>
              <div className="phase-card__head">
                <span className="phase-card__dot" style={{ background: PHASE_COLOR.noGo }} />
                <span className="phase-card__name">{t('spending.noGo')}</span>
                <span className="phase-card__ages">
                  {slowGoEndAge}–{lifeExpectancyAge}
                </span>
              </div>
              <div className="phase-card__value">{fmt.compact(noGoYearly)}/yr</div>
              <div className="phase-card__note">
                {t('spending.adjustmentNote', { pct: signed(noGoAdjustmentPct) })}
              </div>
            </div>
          </div>

          <p className="field__hint">{t('spending.phasedRealDollarsNote')}</p>

          <div className="phase-grid">
            <label className="phase-field">
              <span className="ov__sub">{t('spending.goGoEnd')}</span>
              <Controller
                control={control}
                name="goGoEndAge"
                render={({ field }) => (
                  <Stepper
                    ariaLabel={t('spending.goGoEnd')}
                    suffix={t('spending.yearsSuffix')}
                    min={ageKnown ? Math.max(1, retireAge) : 1}
                    step={1}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(errors.goGoEndAge) || goGoBeforeRetire}
                  />
                )}
              />
            </label>
            <label className="phase-field">
              <span className="ov__sub">{t('spending.slowGoEnd')}</span>
              <Controller
                control={control}
                name="slowGoEndAge"
                render={({ field }) => (
                  <Stepper
                    ariaLabel={t('spending.slowGoEnd')}
                    suffix={t('spending.yearsSuffix')}
                    min={1}
                    step={1}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(errors.slowGoEndAge)}
                  />
                )}
              />
            </label>
            <label className="phase-field">
              <span className="ov__sub">{t('spending.slowGoAdjustment')}</span>
              <Controller
                control={control}
                name="slowGoAdjustmentPct"
                render={({ field }) => (
                  <div className="phase-slider">
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      step={0.5}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      aria-label={t('spending.slowGoAdjustment')}
                    />
                    <b className="phase-slider__val">{signed(field.value)}%</b>
                  </div>
                )}
              />
            </label>
            <label className="phase-field">
              <span className="ov__sub">{t('spending.noGoAdjustment')}</span>
              <Controller
                control={control}
                name="noGoAdjustmentPct"
                render={({ field }) => (
                  <div className="phase-slider">
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      step={0.5}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      aria-label={t('spending.noGoAdjustment')}
                    />
                    <b className="phase-slider__val">{signed(field.value)}%</b>
                  </div>
                )}
              />
            </label>
            <label className="phase-field">
              <span className="ov__sub">{t('spending.floor')}</span>
              <Controller
                control={control}
                name="floorPct"
                render={({ field }) => (
                  <Stepper
                    ariaLabel={t('spending.floor')}
                    suffix="%"
                    min={0}
                    step={5}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(errors.floorPct)}
                  />
                )}
              />
            </label>
          </div>
          {goGoBeforeRetire && (
            <p className="field-error">{t('spending.goGoBeforeRetire', { age: retireAge })}</p>
          )}
          {errors.slowGoEndAge && <p className="field-error">{errors.slowGoEndAge.message}</p>}

          <button type="button" className="link-btn" onClick={resetPhases}>
            {t('spending.resetPhases')}
          </button>
        </div>
      )}

      <div className="divider" />

      <div className="field">
        <span className="field__label">{t('spending.inflationRate')}</span>
        <Controller
          control={control}
          name="inflationPct"
          render={({ field }) => (
            <>
              <Stepper
                ariaLabel={t('spending.ariaInflation')}
                suffix="%"
                min={0}
                step={1}
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.inflationPct)}
              />
              <p className="field__hint">
                {t('spending.inflationNote', {
                  pct: field.value,
                })}
              </p>
            </>
          )}
        />
        {errors.inflationPct && <p className="field-error">{errors.inflationPct.message}</p>}
      </div>
    </Modal>
  );
};
