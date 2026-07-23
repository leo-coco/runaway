import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Stepper } from '@/components/ui/Stepper';
import { SUCCESS_BAND_COLOR, SuccessRateDonut } from '@/components/ui/SuccessRateDonut';
import { InfoIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useAppStore } from '@/store';
import {
  lifeExpectancyYear,
  MC_ITERATIONS_MAX,
  MC_ITERATIONS_MIN,
  MC_ITERATIONS_STEP,
  usesCorrelationMatrix,
  type MonteCarloModel,
} from '@/domain/retirementSettings';
import { ASSET_CLASSES, type AssetClass } from '@/domain/assetClass';
import { classCorrelation, volatilityFor } from '@/domain/volatility';
import type { UseMonteCarloResult } from '@/hooks/useMonteCarlo';
import { successStatus } from '@/domain/successRate';
import {
  DEFAULT_MC_OPTIONS,
  MODEL_PARAMS,
  buildMonteCarloInput,
  correlationKey,
  historicalDriftPct,
  isBitcoinSymbol,
  type MonteCarloOptions,
  type TrialOutcomeCategory,
} from '@/services/monteCarlo';
import { HIST_REAL_END_YEAR, HIST_REAL_START_YEAR } from '@/domain/historicalReturns';
import type { RatesTable } from '@/services/currencyService';
import type { Plan } from '@/domain/plan';
import { DEFAULT_GROWTH_FADE } from '@/domain/growthFade';
import { cn } from '@/lib/cn';
import { SimulationMethodology } from './SimulationDataSourcesModal';
import { GoalSeekModal } from './GoalSeekModal';
import { TrialExplorerModal } from './TrialExplorerModal';
import { AxisModeSwitch } from './AxisModeSwitch';
import { OUTCOME_CATEGORY_COLOR } from './outcomeColors';
import {
  buildLandmarkTicks,
  ImportantYearTick,
  LANDMARK_COLOR,
  LandmarkLabel,
} from './ChartLandmarks';

interface Props {
  plan: Plan;
  monteCarlo: UseMonteCarloResult;
  rates: RatesTable | undefined;
}

/**
 * Per-model explanation shown in the info bubble, in the standardised format:
 * 🧬 In plain terms (what it is) · 🎯 Objective (why it's useful) · ⚠️ Watch out
 * (its limits). Wording verified against the actual engine in services/monteCarlo.
 */
/**
 * Chart row for the fan. Two bands only: a central band (p25–p75) and a downside
 * band (p10–p25, the worse-than-typical tail), plus the median line.
 */
interface FanRow {
  year: number;
  band2575: [number, number]; // central: p25 … p75
  bandDown: [number, number]; // downside: p10 … p25
  m50: number; // median
  v10: number;
  v25: number;
  v50: number;
  v75: number;
}

type FanPercentileKey = Exclude<keyof FanRow, 'year' | 'band2575' | 'bandDown'>;

const FAN_ORANGE = '#f5a623';
const FAN_RED = '#f43f5e';
const BAND_MID = '#6aa3e0'; // central 25–75 band

// Percentile legend rows, top-to-bottom (used by the tooltip and the side list).
const PCTLS: { dot: string; labelKey: string; key: FanPercentileKey }[] = [
  { dot: '#4ade80', labelKey: 'mc.fanTitleTop25', key: 'v75' },
  { dot: FAN_ORANGE, labelKey: 'mc.fanTitleMedian', key: 'v50' },
  { dot: '#fb7185', labelKey: 'mc.fanTitleBottom25', key: 'v25' },
  { dot: '#ef4444', labelKey: 'mc.fanTitleBottom10', key: 'v10' },
];

interface FanTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { payload?: FanRow }[];
  format: (n: number) => string;
  labelFormatter?: (label: string | number) => string | number;
}

/** Tooltip listing the four tracked percentiles top-to-bottom (top 25% → bottom 10%). */
const FanTooltip = ({ active, payload, label, format, labelFormatter }: FanTooltipProps) => {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="mc-fan-tip">
      <div className="mc-fan-tip__year">
        {labelFormatter && label !== undefined ? labelFormatter(label) : label}
      </div>
      {PCTLS.map((r) => (
        <div key={r.labelKey} className="mc-fan-tip__row">
          <i style={{ background: r.dot }} />
          <span>{t(r.labelKey)}</span>
          <b>{format(row[r.key])}</b>
        </div>
      ))}
    </div>
  );
};

/**
 * Small inline "?" bubble: an info glyph that reveals a plain-language tooltip on
 * hover, reusing the shared .mc-info / .mc-tip styling. `right` anchors the bubble
 * to the icon's right edge so it stays inside the narrow left column.
 */
const InfoTip = ({ title, body, right }: { title: string; body: string; right?: boolean }) => (
  <span className="mc-info" role="img" aria-label={title}>
    <InfoIcon size={13} />
    <span className={cn('mc-tip', right && 'mc-tip--right')} role="tooltip">
      <b>{title}</b>
      {body}
    </span>
  </span>
);

export const ProbabilityView = ({ plan, monteCarlo, rates }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const openModal = useAppStore((s) => s.openModal);
  const updateHolding = useAppStore((s) => s.updateHolding);
  const setCorrelation = useAppStore((s) => s.setCorrelation);
  const resetCorrelations = useAppStore((s) => s.resetCorrelations);
  const updateSettings = useAppStore((s) => s.updateSettings);
  // The model/iterations/BTC-cycle/fade toggles below drive a simulation that's
  // expensive to recompute, so they're staged as local drafts: changing them only
  // updates the panel, not the plan, until "Rerun simulation" commits them all at
  // once (same click that reseeds the run). Everything derived from the ACTUAL
  // last run (the assumptions modal, the trial explorer, correlation liveness)
  // keeps reading the live `plan.settings` values below so it stays in sync with
  // `result`.
  const model = plan.settings.monteCarloModel ?? 'bootstrap';
  // The matrix is still shown under a replay model (it documents the class
  // defaults) but is read-only: editing it there would change nothing.
  const correlationLive = usesCorrelationMatrix(model);
  const btcCycleOn = plan.settings.btcHalvingCycle ?? false;
  const hasBtc = plan.holdings.some((h) => isBitcoinSymbol(h.instrument.symbol));
  const liveFadeCfg = plan.settings.growthFade ?? DEFAULT_GROWTH_FADE;
  const liveIterations = plan.settings.monteCarloIterations ?? DEFAULT_MC_OPTIONS.iterations;

  const [draftModel, setDraftModel] = useState<MonteCarloModel>(model);
  const [draftHistStartYear, setDraftHistStartYear] = useState(plan.settings.histStartYear);
  const [draftIterations, setDraftIterations] = useState(liveIterations);
  const [draftBtcCycle, setDraftBtcCycle] = useState(btcCycleOn);
  const [draftFadeEnabled, setDraftFadeEnabled] = useState(liveFadeCfg.enabled);
  // Per-holding expected-return/volatility overrides edited in the "Edit
  // assumptions" table, staged the same way. `undefined` for a field means
  // "no override" (falls back to the class/ticker default), same as the
  // committed shape — so an explicit reset stages cleanly as `{ field: undefined }`.
  interface HoldingOverrideDraft {
    volatilityPct?: number;
    mcExpectedReturnPct?: number;
  }
  const [draftHoldingOverrides, setDraftHoldingOverrides] = useState<
    Record<string, HoldingOverrideDraft>
  >({});
  const holdingDraft = (holdingId: string): HoldingOverrideDraft => {
    if (holdingId in draftHoldingOverrides) return draftHoldingOverrides[holdingId]!;
    const h = plan.holdings.find((x) => x.id === holdingId);
    return { volatilityPct: h?.volatilityPct, mcExpectedReturnPct: h?.mcExpectedReturnPct };
  };
  const setHoldingDraft = (holdingId: string, patch: HoldingOverrideDraft) =>
    setDraftHoldingOverrides((prev) => ({
      ...prev,
      [holdingId]: { ...holdingDraft(holdingId), ...patch },
    }));
  const [draftCorrelationOverrides, setDraftCorrelationOverrides] = useState<
    Record<string, number>
  >(plan.correlationOverrides ?? {});
  const setDraftCorrelation = (holdingIdA: string, holdingIdB: string, value: number) =>
    setDraftCorrelationOverrides((prev) => ({
      ...prev,
      [correlationKey(holdingIdA, holdingIdB)]: Math.min(1, Math.max(-1, value)),
    }));
  // Switching plans should start the panel from that plan's own settings, not
  // whatever was left over from the previous one. Adjusted during render (React's
  // documented pattern for resetting state on a prop change) rather than in an
  // effect, so the reset lands in the same commit as the plan switch.
  const [draftsForPlanId, setDraftsForPlanId] = useState(plan.id);
  if (plan.id !== draftsForPlanId) {
    setDraftsForPlanId(plan.id);
    setDraftModel(plan.settings.monteCarloModel ?? 'bootstrap');
    setDraftHistStartYear(plan.settings.histStartYear);
    setDraftIterations(plan.settings.monteCarloIterations ?? DEFAULT_MC_OPTIONS.iterations);
    setDraftBtcCycle(plan.settings.btcHalvingCycle ?? false);
    setDraftFadeEnabled((plan.settings.growthFade ?? DEFAULT_GROWTH_FADE).enabled);
    setDraftHoldingOverrides({});
    setDraftCorrelationOverrides(plan.correlationOverrides ?? {});
  }
  const rerunWithDraftSettings = () => {
    for (const [holdingId, patch] of Object.entries(draftHoldingOverrides)) {
      updateHolding(plan.id, holdingId, patch);
    }
    const liveCorrelation = plan.correlationOverrides ?? {};
    const correlationChanged =
      Object.keys(draftCorrelationOverrides).length !== Object.keys(liveCorrelation).length ||
      Object.entries(draftCorrelationOverrides).some(([k, v]) => liveCorrelation[k] !== v);
    if (correlationChanged) {
      resetCorrelations(plan.id);
      for (const [key, value] of Object.entries(draftCorrelationOverrides)) {
        const [a, b] = key.split('|');
        if (a && b) setCorrelation(plan.id, a, b, value);
      }
    }
    updateSettings(plan.id, {
      ...plan.settings,
      monteCarloModel: draftModel,
      histStartYear: draftHistStartYear,
      monteCarloIterations: draftIterations,
      btcHalvingCycle: draftBtcCycle,
      growthFade: { ...liveFadeCfg, enabled: draftFadeEnabled },
    });
    monteCarlo.rerun();
  };
  const { status, result, error } = monteCarlo;
  const [showData, setShowData] = useState(false);
  const [editingAssumptions, setEditingAssumptions] = useState(false);
  const [editingCorrelations, setEditingCorrelations] = useState(false);
  const [showGoalSeek, setShowGoalSeek] = useState(false);
  const [showModelInfo, setShowModelInfo] = useState(false);
  const [showTrialExplorer, setShowTrialExplorer] = useState(false);
  const [trialFilterCategory, setTrialFilterCategory] = useState<TrialOutcomeCategory | null>(null);
  // Fan chart: projected net worth (portfolio balance) or projected withdrawal rate,
  // both percentiled across every simulated run (like the projection page's selector).
  const [fanView, setFanView] = useState<'netWorth' | 'withdrawalRate'>('netWorth');
  const [xAxisMode, setXAxisMode] = useState<'year' | 'age'>('year');

  const startYear = new Date().getFullYear();
  const { retirementYear, currentAge, lifeExpectancyAge } = plan.settings;
  const hasAssets = plan.holdings.length > 0;
  const canShowAge = currentAge > 0;
  const showAge = canShowAge && xAxisMode === 'age';
  const ageAt = (year: number): number => currentAge + (year - startYear);
  const xAxisTickFormatter = (v: number) => (showAge ? `${ageAt(v)}` : `${v}`);
  const xAxisLabelFormatter = (label: string | number) => (showAge ? ageAt(Number(label)) : label);

  // The plan funds through the year the user reaches `lifeExpectancyAge`. The
  // timeline inputs themselves live in the "Retirement Timeline" modal now.
  const endYear = lifeExpectancyYear(currentAge, startYear, lifeExpectancyAge);

  const pctls =
    (fanView === 'withdrawalRate' ? result?.withdrawalRatePercentiles : result?.percentiles) ?? [];

  const fanData: FanRow[] = pctls.map((p) => ({
    year: p.year,
    band2575: [p.p25, p.p75],
    bandDown: [p.p10, p.p25],
    m50: p.p50,
    v10: p.p10,
    v25: p.p25,
    v50: p.p50,
    v75: p.p75,
  }));
  const medianDryYear =
    result?.percentiles.find((p) => p.year >= result.retirementYear && p.p50 <= 0.5)?.year ?? null;
  const fanXAxisTicks = buildLandmarkTicks(
    fanData.map(({ year }) => year),
    [retirementYear, endYear, ...(medianDryYear === null ? [] : [medianDryYear])],
  );

  const sx = result ? successStatus(result.successRate) : null;

  // "Where you land" at the end of the funding horizon, and the year the median
  // path runs dry (if it does), for the headline badges.
  const horizonEndYear = result ? result.retirementYear + result.retirementHorizon - 1 : 0;
  const endPctl =
    result?.percentiles.find((p) => p.year === horizonEndYear) ??
    result?.percentiles.at(-1) ??
    null;
  const medianPortfolioDepleted = endPctl !== null && endPctl.p50 <= 0;
  // Inspector data: the assumptions used for both the "view data" table and the
  // trial explorer modal.
  /* eslint-disable react-hooks/preserve-manual-memoization -- buildMonteCarloInput is intentionally
     cached here; the compiler cannot prove that the plan/rates inputs remain immutable. */
  const inspector = useMemo(() => {
    if (!hasAssets) return null;
    const horizonYears = Math.max(1, endYear - startYear);
    const retirementHorizon = Math.max(1, endYear - retirementYear + 1);
    const input = buildMonteCarloInput(plan, rates, startYear, horizonYears);
    const options: MonteCarloOptions = {
      ...DEFAULT_MC_OPTIONS,
      iterations: liveIterations,
      retirementHorizon,
      seed: monteCarlo.seed,
      model,
      btcCycle: btcCycleOn,
      histStartYear: plan.settings.histStartYear,
    };
    return { input, options };
  }, [
    hasAssets,
    plan,
    rates,
    startYear,
    endYear,
    retirementYear,
    monteCarlo.seed,
    liveIterations,
    model,
    btcCycleOn,
  ]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const assetClassLabel = (assetClass: string | undefined): string => {
    if (!assetClass) return '—';
    return (ASSET_CLASSES as readonly string[]).includes(assetClass)
      ? t(`assetClass.${assetClass as AssetClass}`)
      : assetClass.replaceAll('_', ' ');
  };

  return (
    <div className="prob-view">
      {!hasAssets ? (
        <div className="state-box" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span>{t('mc.addAssetPrompt')}</span>
          <div>
            <Button variant="accent" onClick={() => openModal('addAsset')}>
              {t('mc.addAsset')}
            </Button>
          </div>
        </div>
      ) : status === 'error' ? (
        <div className="state-box">{t('mc.failed', { error })}</div>
      ) : !result || !sx ? (
        <div className="state-box">
          {t('mc.running', { count: liveIterations.toLocaleString() })}
        </div>
      ) : (
        <>
          <div className="hero hero--triple" data-tour="mc-summary-cards">
            <div
              className={cn(
                'hero__card',
                'prob-success-card',
                status === 'running' && 'prob-success-card--calculating',
              )}
              style={{
                borderColor: SUCCESS_BAND_COLOR[sx.band],
                ['--mc-color' as string]: SUCCESS_BAND_COLOR[sx.band],
              }}
              aria-busy={status === 'running'}
            >
              <div className="hero__row">
                <span className="hero__label">{t('mc.probabilityOfSuccess')}</span>
              </div>
              <div className="prob-success-card__body">
                <SuccessRateDonut
                  percent={sx.pct}
                  band={sx.band}
                  size="compact"
                  isCalculating={status === 'running'}
                  calculatingLabel={t('mc.recalculating')}
                />
                <div className="prob-success-card__copy">
                  <span className="hero__big-note prob-success-card__note">
                    {t('dashboard.oddsNote', { age: lifeExpectancyAge })}
                  </span>
                  {sx.pct < 80 && (
                    <button
                      type="button"
                      className="hero__action-link"
                      onClick={() => setShowGoalSeek(true)}
                    >
                      {t('mc.whatWouldItTake')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={cn('hero__card', medianPortfolioDepleted && 'hero__card--depletion')}>
              <div className="hero__row">
                <span className="hero__label">{t('mc.medianValueTitle')}</span>
              </div>
              <span className="hero__big hero__big--sm">{fmt.compact(endPctl?.p50 ?? 0)}</span>
              <span className="hero__big-note">
                {t('mc.medianValueNote', { age: lifeExpectancyAge })}
              </span>
            </div>

            <div className={cn('hero__card', medianDryYear !== null && 'hero__card--depletion')}>
              <div className="hero__row">
                <span className="hero__label">{t('mc.medianDepletionTitle')}</span>
              </div>
              <span className="hero__big hero__big--sm">
                {medianDryYear ?? t('dashboard.neverDepletes')}
              </span>
              {medianDryYear !== null && canShowAge && (
                <span className="hero__big-note">
                  {t('dashboard.depletionAgeNote', { age: ageAt(medianDryYear) })}
                </span>
              )}
            </div>
          </div>

          <div
            className={cn(
              'mc-central',
              'mc-central--stacked',
              status === 'running' && 'is-updating',
            )}
          >
            <div className="mc-cards-row">
              <div className="mc-body-card">
                <div className="prob-chart-head">
                  <div className="mc-chart-title">
                    {fanView === 'withdrawalRate'
                      ? t('mc.projectedWithdrawalRate')
                      : t('mc.projectedBalance')}
                  </div>
                  <div className="chart-view" data-tour="mc-fan-view">
                    <select
                      id="mc-fan-view"
                      className="select"
                      aria-label={t('mc.fanChartView')}
                      value={fanView}
                      onChange={(e) => setFanView(e.target.value as 'netWorth' | 'withdrawalRate')}
                    >
                      <option value="netWorth">{t('mc.fanViewNetWorth')}</option>
                      <option value="withdrawalRate">{t('mc.fanViewWithdrawalRate')}</option>
                    </select>
                  </div>
                </div>
                <div className="mc-chart-frame" data-tour="mc-fan-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={fanData}
                      margin={{ top: 10, right: 8, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="year"
                        tick={
                          <ImportantYearTick
                            importantYears={[retirementYear, endYear]}
                            dangerYears={medianDryYear === null ? [] : [medianDryYear]}
                            firstYear={fanData[0]?.year ?? retirementYear}
                            lastYear={fanData.at(-1)?.year ?? endYear}
                            formatter={xAxisTickFormatter}
                          />
                        }
                        ticks={fanXAxisTicks}
                        interval={0}
                        stroke="var(--border)"
                        minTickGap={40}
                        tickFormatter={xAxisTickFormatter}
                      />
                      <YAxis
                        tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                        stroke="var(--border)"
                        tickFormatter={(v) =>
                          fanView === 'withdrawalRate'
                            ? `${Number(v).toFixed(0)}%`
                            : fmt.compact(Number(v))
                        }
                        width={56}
                      />
                      <ReferenceLine
                        x={retirementYear}
                        stroke={LANDMARK_COLOR}
                        strokeDasharray="4 4"
                        label={
                          <LandmarkLabel
                            value={
                              showAge
                                ? t('projChart.retirementAgeOnly', {
                                    age: ageAt(retirementYear),
                                  })
                                : t('projChart.retirement', { year: retirementYear })
                            }
                            align="left"
                            verticalAlign="top"
                          />
                        }
                      />
                      <ReferenceLine
                        x={endYear}
                        stroke={LANDMARK_COLOR}
                        strokeDasharray="4 4"
                        label={
                          <LandmarkLabel
                            value={
                              showAge
                                ? t('projChart.planEndsAgeOnly', { age: ageAt(endYear) })
                                : t('projChart.planEnds', { year: endYear })
                            }
                            align="right"
                            verticalAlign="top"
                          />
                        }
                      />
                      {medianDryYear !== null && (
                        <ReferenceLine
                          x={medianDryYear}
                          stroke="var(--danger)"
                          strokeDasharray="6 4"
                          label={
                            <LandmarkLabel
                              value={
                                showAge
                                  ? t('projChart.depletionAgeOnly', {
                                      age: ageAt(medianDryYear),
                                    })
                                  : t('projChart.depletion', { year: medianDryYear })
                              }
                              align="left"
                              verticalAlign="middle"
                              tone="danger"
                            />
                          }
                        />
                      )}
                      {/* Central likely range (p25–p75), then the red downside tail
                      (p10–p25) drawn on top, then the median line. */}
                      <Area
                        type="monotone"
                        dataKey="band2575"
                        stroke="none"
                        fill={BAND_MID}
                        fillOpacity={0.22}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="bandDown"
                        stroke="none"
                        fill={FAN_RED}
                        fillOpacity={0.28}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="m50"
                        stroke={FAN_ORANGE}
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Tooltip
                        content={
                          <FanTooltip
                            format={
                              fanView === 'withdrawalRate'
                                ? (n: number) => `${n.toFixed(1)}%`
                                : fmt.format
                            }
                            labelFormatter={xAxisLabelFormatter}
                          />
                        }
                      />
                    </ComposedChart>
                  </ResponsiveContainer>

                  {canShowAge && <AxisModeSwitch mode={xAxisMode} onChange={setXAxisMode} />}

                  <div className="legend legend--bottom">
                    <span>
                      <i style={{ background: BAND_MID }} />
                      {t('mc.legendLikely')}
                    </span>
                    <span>
                      <i style={{ background: FAN_ORANGE }} />
                      {t('mc.median')}
                    </span>
                    <span>
                      <i style={{ background: FAN_RED }} />
                      {t('mc.legendDownside')}
                    </span>
                  </div>
                </div>
                {hasAssets && (
                  <div className="mc-chart-action">
                    <Button
                      size="sm"
                      data-tour="mc-visualize"
                      onClick={() => {
                        setTrialFilterCategory(null);
                        setShowTrialExplorer(true);
                      }}
                    >
                      {t('mc.visualizeSimulation')}
                    </Button>
                  </div>
                )}
              </div>

              <div className="mc-body-card" data-tour="mc-outcome-breakdown">
                <div className="wo-section-label">
                  {t('mc.outcomeBreakdown')}
                  {status === 'running' && (
                    <span className="mc-updating">{t('mc.recalculating')}</span>
                  )}
                </div>
                <div className="outcome-breakdown">
                  {(
                    [
                      [
                        'largeSurplus',
                        OUTCOME_CATEGORY_COLOR.largeSurplus,
                        t('mc.outcomeLargeSurplus'),
                        result.outcomeBreakdown.largeSurplus,
                        t('mc.tipLargeSurplus'),
                      ],
                      [
                        'comfortable',
                        OUTCOME_CATEGORY_COLOR.comfortable,
                        t('mc.outcomeComfortable'),
                        result.outcomeBreakdown.comfortable,
                        t('mc.tipComfortable'),
                      ],
                      [
                        'tightSuccess',
                        OUTCOME_CATEGORY_COLOR.tightSuccess,
                        t('mc.outcomeTightSuccess'),
                        result.outcomeBreakdown.tightSuccess,
                        t('mc.tipTightSuccess'),
                      ],
                      [
                        'almostMadeIt',
                        OUTCOME_CATEGORY_COLOR.almostMadeIt,
                        t('mc.outcomeAlmostMadeIt'),
                        result.outcomeBreakdown.almostMadeIt,
                        t('mc.tipAlmostMadeIt'),
                      ],
                      [
                        'failedInMiddle',
                        OUTCOME_CATEGORY_COLOR.failedInMiddle,
                        t('mc.outcomeFailedMiddle'),
                        result.outcomeBreakdown.failedInMiddle,
                        t('mc.tipFailedMiddle'),
                      ],
                    ] as const
                  ).map(([category, color, label, count, tip]) => (
                    <button
                      type="button"
                      className="outcome-row"
                      key={category}
                      disabled={count === 0}
                      title={count === 0 ? undefined : t('mc.outcomeFilterHint')}
                      onClick={() => {
                        setTrialFilterCategory(category);
                        setShowTrialExplorer(true);
                      }}
                    >
                      <span className="outcome-row__label">
                        <i className="outcome-row__dot" style={{ background: color }} />
                        {label}
                        <InfoTip title={label} body={tip} />
                      </span>
                      <span className="outcome-row__stats">
                        <b className="outcome-row__pct">
                          {((count / result.iterations) * 100).toFixed(1)}%
                        </b>
                        <span className="outcome-row__count">
                          {t('mc.outcomeTrials', { count })}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mc-cards-row">
              <div className="mc-body-card" data-tour="mc-net-worth">
                <div className="wo-section-label">
                  {t('mc.netWorthTitle', { year: horizonEndYear })}
                </div>
                <div className="hero-networth-list">
                  {(
                    [
                      ['#4ade80', t('mc.top25'), endPctl?.p75],
                      [FAN_ORANGE, t('mc.median'), endPctl?.p50],
                      ['#fb7185', t('mc.bottom25'), endPctl?.p25],
                      ['#f43f5e', t('mc.bottom10'), endPctl?.p10],
                    ] as const
                  ).map(([color, label, value]) => (
                    <div className="hero-networth-list__row" key={label}>
                      <span>
                        <i style={{ background: color }} /> {label}
                      </span>
                      <b style={{ color }}>{fmt.compact(value ?? 0)}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mc-body-card">
                <div className="wo-section-label">{t('mc.parametersTitle')}</div>
                <div className="mc-iterations-setting">
                  <div className="mc-iterations-setting__label">
                    <span>{t('mc.iterationsLabel')}</span>
                  </div>
                  <Stepper
                    ariaLabel={t('mc.iterationsLabel')}
                    value={draftIterations}
                    min={MC_ITERATIONS_MIN}
                    max={MC_ITERATIONS_MAX}
                    step={MC_ITERATIONS_STEP}
                    onChange={setDraftIterations}
                  />
                </div>
                <div className="model-picker" data-tour="mc-model">
                  <label htmlFor="mc-model-select" className="model-picker__label">
                    {t('mc.selectModel')}
                  </label>
                  <select
                    id="mc-model-select"
                    className="select"
                    value={draftModel}
                    onChange={(e) => setDraftModel(e.target.value as MonteCarloModel)}
                  >
                    <optgroup label={t('mc.groupStandard')}>
                      {(['normal', 'crash-aware', 'bootstrap'] as const).map((m) => (
                        <option key={m} value={m}>
                          {t(`modelName.${m}`)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t('mc.groupAdvanced')}>
                      {(['fat-tails', 'historical-real-centered'] as const).map((m) => (
                        <option key={m} value={m}>
                          {t(`modelName.${m}`)}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    type="button"
                    className="mc-model-info-btn"
                    data-tour="mc-model-info"
                    onClick={() => setShowModelInfo(true)}
                    aria-label={t('mc.aboutModel', { model: t(`modelName.${draftModel}`) })}
                  >
                    <InfoIcon size={16} />
                  </button>
                </div>

                {draftModel === 'historical-real-centered' && (
                  <div className="hist-year-picker" data-tour="mc-hist-start-year">
                    <div className="hist-year-picker__row">
                      <span className="model-picker__label">{t('mc.histStartYear')}</span>
                      <label className="mc-switch">
                        <input
                          type="checkbox"
                          checked={draftHistStartYear === undefined}
                          onChange={(e) =>
                            setDraftHistStartYear(e.target.checked ? undefined : HIST_REAL_END_YEAR)
                          }
                        />
                        <span>{t('mc.histStartYearRandomToggle')}</span>
                      </label>
                    </div>
                    {draftHistStartYear !== undefined && (
                      <select
                        id="mc-hist-start-year-select"
                        className="select"
                        aria-label={t('mc.histStartYear')}
                        value={draftHistStartYear}
                        onChange={(e) => setDraftHistStartYear(Number(e.target.value))}
                      >
                        {Array.from(
                          { length: HIST_REAL_END_YEAR - HIST_REAL_START_YEAR + 1 },
                          (_, i) => HIST_REAL_END_YEAR - i,
                        ).map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {draftModel === 'historical-real-centered' && (
                  <p className="field__hint" style={{ marginTop: 0 }}>
                    {draftHistStartYear === undefined
                      ? t('mc.histStartYearHintRandom')
                      : t('mc.histStartYearHintFixed', { year: draftHistStartYear })}
                  </p>
                )}

                <div className="mc-option-row">
                  <div className="mc-option">
                    <label className={cn('mc-switch', !hasBtc && 'is-disabled')}>
                      <span className="mc-switch__control">
                        <input
                          type="checkbox"
                          checked={draftBtcCycle && hasBtc}
                          disabled={!hasBtc}
                          onChange={(e) => setDraftBtcCycle(e.target.checked)}
                        />
                        <span>{t('mc.overlayBtc')}</span>
                      </span>
                      <span className="mc-tip mc-tip--below" role="tooltip">
                        {t(hasBtc ? 'mc.btcHintOn' : 'mc.btcHintOff')}
                      </span>
                    </label>
                  </div>

                  <div className="mc-option">
                    <label className="mc-switch">
                      <span className="mc-switch__control">
                        <input
                          type="checkbox"
                          checked={draftFadeEnabled}
                          onChange={(e) => setDraftFadeEnabled(e.target.checked)}
                        />
                        <span>{t('mc.fadeToggle')}</span>
                      </span>
                      <span className="mc-tip mc-tip--right" role="tooltip">
                        {t('mc.fadeHint', {
                          target: liveFadeCfg.targetPct,
                          years: liveFadeCfg.years,
                        })}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="mc-params-actions">
                  <Button data-tour="mc-viewdata" onClick={() => setShowData(true)}>
                    {t('mc.viewData')}
                  </Button>
                  <Button onClick={rerunWithDraftSettings} disabled={status === 'running'}>
                    {status === 'running' ? t('mc.running2') : t('mc.runNew')}
                  </Button>
                </div>
              </div>

              <div className="mc-body-card mc-whatif-card">
                <div className="wo-section-label">{t('mc.whatIfCardTitle')}</div>
                <p className="mc-whatif-card__desc">{t('mc.whatIfCardDesc')}</p>
                <Button data-tour="mc-whatif" onClick={() => setShowGoalSeek(true)}>
                  {t('mc.whatIfCardCta')}
                </Button>
              </div>
            </div>

            {showGoalSeek && (
              <GoalSeekModal plan={plan} rates={rates} onClose={() => setShowGoalSeek(false)} />
            )}
          </div>
        </>
      )}
      {showTrialExplorer && inspector && result && (
        <TrialExplorerModal
          plan={plan}
          input={inspector.input}
          options={inspector.options}
          trialSeeds={result.trialSeeds}
          startYear={startYear}
          retirementYear={retirementYear}
          endYear={endYear}
          initialCategoryFilter={trialFilterCategory}
          onClose={() => setShowTrialExplorer(false)}
        />
      )}
      {showData && inspector && (
        <Modal
          title={t('mc.aboutSimulation')}
          onClose={() => {
            setShowData(false);
            setEditingAssumptions(false);
            setEditingCorrelations(false);
          }}
          xl
        >
          <div className="mc-data__body">
            <div className="wo-section-label" style={{ marginTop: 0 }}>
              {t('mc.dataPerAsset')}
            </div>
            <p className="field__hint" style={{ marginTop: 0 }}>
              {t('mc.dataVolHint')}
            </p>
            <div className="mc-editable-table">
              <div className="mc-editable-table__toolbar">
                <Button
                  size="sm"
                  aria-label={`${editingAssumptions ? t('common.done') : t('common.edit')} — ${t('mc.dataPerAsset')}`}
                  onClick={() => setEditingAssumptions((editing) => !editing)}
                >
                  {editingAssumptions ? t('common.done') : t('common.edit')}
                </Button>
              </div>
              <div className="mc-table-wrap">
                <table className="mc-table">
                  <thead>
                    <tr>
                      <th>{t('mc.colAsset')}</th>
                      <th>{t('mc.colClass')}</th>
                      <th>{t('mc.colExpectedReturn')}</th>
                      <th>{t('mc.colVolatility')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspector.input.assets.map((a, i) => {
                      const hid = a.holdingId;
                      const holding =
                        hid !== undefined ? plan.holdings.find((h) => h.id === hid) : undefined;
                      const draft = hid !== undefined ? holdingDraft(hid) : undefined;
                      const overridden = draft?.volatilityPct !== undefined;
                      const returnOverridden = draft?.mcExpectedReturnPct !== undefined;
                      const volDefault =
                        hid !== undefined
                          ? volatilityFor(a.assetClass, a.symbol ?? '')
                          : a.sigmaPct;
                      const returnValue =
                        draft?.mcExpectedReturnPct ?? holding?.expectedCagrPct ?? a.driftPct;
                      const volValue = draft?.volatilityPct ?? volDefault;
                      return (
                        <tr key={i}>
                          <td>{a.symbol ?? `Asset ${i + 1}`}</td>
                          <td>{assetClassLabel(a.assetClass)}</td>
                          <td>
                            {editingAssumptions && hid !== undefined ? (
                              <span className="mc-vol-cell">
                                <Stepper
                                  compact
                                  ariaLabel={`${a.symbol ?? 'asset'} expected return`}
                                  value={Math.round(returnValue)}
                                  min={0}
                                  max={100}
                                  step={1}
                                  suffix="%"
                                  onChange={(v) => setHoldingDraft(hid, { mcExpectedReturnPct: v })}
                                />
                                <button
                                  type="button"
                                  className="mc-vol-reset"
                                  title={t('mc.fillHistoryTitle')}
                                  onClick={() =>
                                    setHoldingDraft(hid, {
                                      mcExpectedReturnPct: Math.round(
                                        historicalDriftPct(a.assetClass),
                                      ),
                                    })
                                  }
                                >
                                  {t('mc.fillHistory')}
                                </button>
                                <button
                                  type="button"
                                  className="mc-vol-reset"
                                  title={t('mc.resetReturnTitle')}
                                  disabled={!returnOverridden}
                                  onClick={() =>
                                    setHoldingDraft(hid, { mcExpectedReturnPct: undefined })
                                  }
                                >
                                  {t('mc.reset')}
                                </button>
                              </span>
                            ) : (
                              `${returnValue.toFixed(1)}%`
                            )}
                          </td>
                          <td>
                            {editingAssumptions && hid !== undefined ? (
                              <span className="mc-vol-cell">
                                <Stepper
                                  compact
                                  ariaLabel={`${a.symbol ?? 'asset'} volatility`}
                                  value={Math.round(volValue)}
                                  min={0}
                                  max={200}
                                  step={5}
                                  suffix="%"
                                  onChange={(v) => setHoldingDraft(hid, { volatilityPct: v })}
                                />
                                <button
                                  type="button"
                                  className="mc-vol-reset"
                                  title={t('mc.resetVolTitle')}
                                  disabled={!overridden}
                                  onClick={() => setHoldingDraft(hid, { volatilityPct: undefined })}
                                >
                                  {t('mc.reset')}
                                </button>
                              </span>
                            ) : (
                              `±${volValue.toFixed(0)}%`
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {inspector.input.assets.length > 1 && (
              <>
                <div className="wo-section-label mc-data-section-heading">
                  <span>{t('mc.correlationMatrix')}</span>
                  <span className="mc-data-section-actions">
                    {editingCorrelations &&
                      correlationLive &&
                      Object.keys(draftCorrelationOverrides).length > 0 && (
                        <Button size="sm" onClick={() => setDraftCorrelationOverrides({})}>
                          {t('mc.resetCorrelations')}
                        </Button>
                      )}
                    <Button
                      size="sm"
                      disabled={!correlationLive}
                      aria-label={`${editingCorrelations ? t('common.done') : t('common.edit')} — ${t('mc.correlationMatrix')}`}
                      onClick={() => setEditingCorrelations((editing) => !editing)}
                    >
                      {editingCorrelations ? t('common.done') : t('common.edit')}
                    </Button>
                  </span>
                </div>
                <div className="mc-table-wrap">
                  <table className="mc-table mc-table--matrix">
                    <thead>
                      <tr>
                        <th />
                        {inspector.input.assets.map((a, i) => (
                          <th key={i}>{a.symbol ?? `A${i + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inspector.input.assets.map((a, i) => (
                        <tr key={i}>
                          <th>{a.symbol ?? `A${i + 1}`}</th>
                          {inspector.input.correlation[i]!.map((liveC, j) => {
                            const assetA = inspector.input.assets[i];
                            const assetB = inspector.input.assets[j];
                            const idA = assetA?.holdingId;
                            const idB = assetB?.holdingId;
                            const draftC =
                              i === j
                                ? 1
                                : (draftCorrelationOverrides[correlationKey(idA, idB)] ??
                                  (assetA && assetB
                                    ? classCorrelation(assetA.assetClass, assetB.assetClass)
                                    : liveC));
                            const editable =
                              editingCorrelations &&
                              correlationLive &&
                              i !== j &&
                              idA !== undefined &&
                              idB !== undefined;
                            return (
                              <td key={j}>
                                {editable ? (
                                  <input
                                    type="number"
                                    className="mc-corr-input"
                                    min={-1}
                                    max={1}
                                    step={0.05}
                                    value={Number(draftC.toFixed(2))}
                                    aria-label={`Correlation ${a.symbol} / ${inspector.input.assets[j]?.symbol}`}
                                    onChange={(e) =>
                                      setDraftCorrelation(idA, idB, Number(e.target.value))
                                    }
                                  />
                                ) : (
                                  draftC.toFixed(2)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(editingCorrelations || !correlationLive) && (
                  <p className="field__hint" style={{ marginTop: 0 }}>
                    {correlationLive
                      ? t('mc.correlationHint')
                      : t('mc.correlationIgnored', { model: t(`modelName.${model}`) })}
                  </p>
                )}
              </>
            )}

            <div className="mc-cap-note">
              {t('mc.capText', {
                max: MODEL_PARAMS.returnCapMaxPct,
                min: MODEL_PARAMS.returnCapMinPct,
              })}
            </div>
            <div className="mc-method-note">
              <SimulationMethodology
                assets={inspector.input.assets}
                model={model}
                btcCycle={btcCycleOn && hasBtc}
              />
            </div>
          </div>
        </Modal>
      )}
      {showModelInfo && (
        <Modal
          title={t('mc.aboutModel', { model: t(`modelName.${draftModel}`) })}
          onClose={() => setShowModelInfo(false)}
          wide
        >
          <div className="mc-model-info">
            <b>{t(`modelName.${draftModel}`)}</b>
            <p>
              <strong>{t('mc.inPlainTerms')}</strong> {t(`modelInfo.${draftModel}.plain`)}
            </p>
            <p>
              <strong>{t('mc.objective')}</strong> {t(`modelInfo.${draftModel}.objective`)}
            </p>
            <p>
              <strong>{t('mc.watchOut')}</strong> {t(`modelInfo.${draftModel}.caution`)}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};
