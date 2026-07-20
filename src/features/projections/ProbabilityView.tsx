import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import type { UseMonteCarloResult } from '@/hooks/useMonteCarlo';
import { successStatus, type SuccessZone } from '@/domain/successRate';
import {
  DEFAULT_MC_OPTIONS,
  MODEL_PARAMS,
  buildMonteCarloInput,
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

interface Props {
  plan: Plan;
  monteCarlo: UseMonteCarloResult;
  rates: RatesTable | undefined;
}

const ZONE_COLOR: Record<SuccessZone, string> = {
  strong: 'var(--success)',
  borderline: 'var(--amber)',
  weak: 'var(--danger, #f43f5e)',
};

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
  const model = plan.settings.monteCarloModel ?? 'bootstrap';
  // The matrix is still shown under a replay model (it documents the class
  // defaults) but is read-only: editing it there would change nothing.
  const correlationLive = usesCorrelationMatrix(model);
  const setModel = (m: MonteCarloModel) =>
    updateSettings(plan.id, { ...plan.settings, monteCarloModel: m });
  const histStartYear = plan.settings.histStartYear;
  const setHistStartYear = (y: number | undefined) =>
    updateSettings(plan.id, { ...plan.settings, histStartYear: y });
  const iterations = plan.settings.monteCarloIterations ?? DEFAULT_MC_OPTIONS.iterations;
  const setIterations = (n: number) =>
    updateSettings(plan.id, { ...plan.settings, monteCarloIterations: n });
  const btcCycleOn = plan.settings.btcHalvingCycle ?? false;
  const hasBtc = plan.holdings.some((h) => isBitcoinSymbol(h.instrument.symbol));
  const setBtcCycle = (on: boolean) =>
    updateSettings(plan.id, { ...plan.settings, btcHalvingCycle: on });
  const fadeCfg = plan.settings.growthFade ?? DEFAULT_GROWTH_FADE;
  const setFade = (on: boolean) =>
    updateSettings(plan.id, { ...plan.settings, growthFade: { ...fadeCfg, enabled: on } });
  const { status, result, error } = monteCarlo;
  const [showData, setShowData] = useState(false);
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

  const sx = result ? successStatus(result.successRate) : null;

  // "Where you land" at the end of the funding horizon, and the year the median
  // path runs dry (if it does), for the headline badges.
  const horizonEndYear = result ? result.retirementYear + result.retirementHorizon - 1 : 0;
  const endPctl =
    result?.percentiles.find((p) => p.year === horizonEndYear) ??
    result?.percentiles.at(-1) ??
    null;
  const medianDryYear =
    result?.percentiles.find((p) => p.year >= result.retirementYear && p.p50 <= 0.5)?.year ?? null;

  // Inspector data: the assumptions used for both the "view data" table and the
  // trial explorer modal.
  const inspector = useMemo(() => {
    if (!hasAssets) return null;
    const horizonYears = Math.max(1, endYear - startYear);
    const retirementHorizon = Math.max(1, endYear - retirementYear + 1);
    const input = buildMonteCarloInput(plan, rates, startYear, horizonYears);
    const options: MonteCarloOptions = {
      ...DEFAULT_MC_OPTIONS,
      retirementHorizon,
      seed: monteCarlo.seed,
      model: plan.settings.monteCarloModel ?? 'bootstrap',
      btcCycle: plan.settings.btcHalvingCycle ?? false,
      histStartYear: plan.settings.histStartYear,
    };
    return { input, options };
  }, [hasAssets, plan, rates, startYear, endYear, retirementYear, monteCarlo.seed]);

  const accountName = (id: string | null): string =>
    id === null
      ? t('portfolio.unassigned')
      : (plan.accounts.find((a) => a.id === id)?.name ?? t('portfolio.unassigned'));

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
        <div className="state-box">{t('mc.running', { count: iterations.toLocaleString() })}</div>
      ) : (
        <>
          <div className="hero hero--triple" data-tour="mc-summary-cards">
            <div
              className="hero__card prob-success-card"
              style={{ borderColor: ZONE_COLOR[sx.zone] }}
            >
              <div className="hero__row">
                <span className="hero__label">{t('mc.probabilityOfSuccess')}</span>
              </div>
              <div className="hero__big-row prob-success-card__value">
                <span className="hero__big hero__big--sm" style={{ color: ZONE_COLOR[sx.zone] }}>
                  {sx.pct.toFixed(0)}%
                </span>
                <span className="hero__big-note prob-success-card__note">
                  {t('dashboard.oddsNote', { age: lifeExpectancyAge })}
                </span>
              </div>
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

            <div className="hero__card">
              <div className="hero__row">
                <span className="hero__label">{t('mc.medianValueTitle')}</span>
              </div>
              <span className="hero__big hero__big--sm">{fmt.compact(endPctl?.p50 ?? 0)}</span>
              <span className="hero__big-note">
                {t('mc.medianValueNote', { age: lifeExpectancyAge })}
              </span>
            </div>

            <div className="hero__card">
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
                        tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
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
                        stroke="var(--text-dim)"
                        strokeDasharray="4 4"
                        label={{
                          value: t('projChart.retirement', { year: retirementYear }),
                          fill: 'var(--text-dim)',
                          fontSize: 10,
                          position: 'insideTopLeft',
                        }}
                      />
                      <ReferenceLine
                        x={endYear}
                        stroke="#5eead4"
                        strokeDasharray="4 4"
                        label={{
                          value: t('projChart.planEnds', { year: endYear }),
                          fill: '#5eead4',
                          fontSize: 10,
                          position: 'insideTopRight',
                        }}
                      />
                      {medianDryYear !== null && (
                        <ReferenceLine
                          x={medianDryYear}
                          stroke={FAN_RED}
                          strokeDasharray="6 4"
                          label={{
                            value: `Median dry ${medianDryYear}`,
                            fill: FAN_RED,
                            fontSize: 10,
                            position: 'top',
                          }}
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
                        'var(--success)',
                        t('mc.outcomeLargeSurplus'),
                        result.outcomeBreakdown.largeSurplus,
                        t('mc.tipLargeSurplus'),
                      ],
                      [
                        'comfortable',
                        'var(--accent)',
                        t('mc.outcomeComfortable'),
                        result.outcomeBreakdown.comfortable,
                        t('mc.tipComfortable'),
                      ],
                      [
                        'almostMadeIt',
                        'var(--amber)',
                        t('mc.outcomeAlmostMadeIt'),
                        result.outcomeBreakdown.almostMadeIt,
                        t('mc.tipAlmostMadeIt'),
                      ],
                      [
                        'failedInMiddle',
                        'var(--danger)',
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
                <div className="model-picker" data-tour="mc-model">
                  <label htmlFor="mc-model-select" className="model-picker__label">
                    {t('mc.selectModel')}
                  </label>
                  <select
                    id="mc-model-select"
                    className="select"
                    value={model}
                    onChange={(e) => setModel(e.target.value as MonteCarloModel)}
                  >
                    <optgroup label={t('mc.groupStandard')}>
                      {(['normal', 'crash-aware', 'bootstrap'] as const).map((m) => (
                        <option key={m} value={m}>
                          {t(`modelName.${m}`)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t('mc.groupAdvanced')}>
                      {(
                        [
                          'fat-tails',
                          'bootstrap-uncentered',
                          'historical-real-centered',
                          'historical-real',
                        ] as const
                      ).map((m) => (
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
                    aria-label={t('mc.aboutModel', { model: t(`modelName.${model}`) })}
                  >
                    <InfoIcon size={16} />
                  </button>
                </div>

                {(model === 'historical-real' || model === 'historical-real-centered') && (
                  <div className="hist-year-picker" data-tour="mc-hist-start-year">
                    <div className="hist-year-picker__row">
                      <span className="model-picker__label">{t('mc.histStartYear')}</span>
                      <label className="mc-switch">
                        <input
                          type="checkbox"
                          checked={histStartYear === undefined}
                          onChange={(e) =>
                            setHistStartYear(e.target.checked ? undefined : HIST_REAL_END_YEAR)
                          }
                        />
                        <span>{t('mc.histStartYearRandomToggle')}</span>
                      </label>
                    </div>
                    {histStartYear !== undefined && (
                      <select
                        id="mc-hist-start-year-select"
                        className="select"
                        aria-label={t('mc.histStartYear')}
                        value={histStartYear}
                        onChange={(e) => setHistStartYear(Number(e.target.value))}
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
                {(model === 'historical-real' || model === 'historical-real-centered') && (
                  <p className="field__hint" style={{ marginTop: 0 }}>
                    {histStartYear === undefined
                      ? t('mc.histStartYearHintRandom')
                      : t('mc.histStartYearHintFixed', { year: histStartYear })}
                  </p>
                )}

                <div className="mc-option-row">
                  <div className="mc-option">
                    <label className={cn('mc-switch', !hasBtc && 'is-disabled')}>
                      <span className="mc-switch__control">
                        <input
                          type="checkbox"
                          checked={btcCycleOn && hasBtc}
                          disabled={!hasBtc}
                          onChange={(e) => setBtcCycle(e.target.checked)}
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
                      <input
                        type="checkbox"
                        checked={fadeCfg.enabled}
                        onChange={(e) => setFade(e.target.checked)}
                      />
                      <span>{t('mc.fadeToggle')}</span>
                      <span className="mc-tip mc-tip--right" role="tooltip">
                        {t('mc.fadeHint', {
                          target: fadeCfg.targetPct,
                          years: fadeCfg.years,
                        })}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="mc-params-actions">
                  <Button onClick={() => monteCarlo.rerun()} disabled={status === 'running'}>
                    {status === 'running' ? t('mc.running2') : t('mc.runNew')}
                  </Button>
                  <Button data-tour="mc-viewdata" onClick={() => setShowData(true)}>
                    {t('mc.viewData')}
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
      {showTrialExplorer && inspector && (
        <TrialExplorerModal
          plan={plan}
          input={inspector.input}
          options={inspector.options}
          startYear={startYear}
          retirementYear={retirementYear}
          endYear={endYear}
          initialCategoryFilter={trialFilterCategory}
          onClose={() => setShowTrialExplorer(false)}
        />
      )}
      {showData && inspector && (
        <Modal title={t('mc.aboutSimulation')} onClose={() => setShowData(false)} xl>
          <div className="mc-data__body">
            <div className="wo-section-label" style={{ marginTop: 0 }}>
              {t('mc.iterationsLabel')}
            </div>
            <Stepper
              ariaLabel={t('mc.iterationsLabel')}
              value={iterations}
              min={MC_ITERATIONS_MIN}
              max={MC_ITERATIONS_MAX}
              step={MC_ITERATIONS_STEP}
              onChange={setIterations}
            />
            <p className="field__hint" style={{ marginTop: 4 }}>
              {t('mc.iterationsHint')}
            </p>
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
              <p className="field__hint" style={{ marginTop: 8 }}>
                <Link to={`/plan/${plan.id}/methodology`} className="method-link">
                  {t('methodology.seeFull')}
                </Link>
              </p>
            </div>
            <div className="wo-section-label" style={{ marginTop: 4 }}>
              {t('mc.dataPerAsset')}
            </div>
            <p className="field__hint" style={{ marginTop: 0 }}>
              {t('mc.dataVolHint')}
            </p>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>{t('mc.colAsset')}</th>
                    <th>{t('mc.colClass')}</th>
                    <th>{t('mc.colStartValue')}</th>
                    <th>{t('mc.colExpectedReturn')}</th>
                    <th>{t('mc.colVolatility')}</th>
                    <th>{t('mc.colAnnualContribution')}</th>
                    <th>{t('mc.colAccount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {inspector.input.assets.map((a, i) => {
                    const hid = a.holdingId;
                    const overridden =
                      hid !== undefined &&
                      plan.holdings.find((h) => h.id === hid)?.volatilityPct !== undefined;
                    return (
                      <tr key={i}>
                        <td>{a.symbol ?? `Asset ${i + 1}`}</td>
                        <td>{a.assetClass ?? '—'}</td>
                        <td>{fmt.compact(a.startValue)}</td>
                        <td>{a.driftPct.toFixed(1)}%</td>
                        <td>
                          {hid !== undefined ? (
                            <span className="mc-vol-cell">
                              <Stepper
                                compact
                                ariaLabel={`${a.symbol ?? 'asset'} volatility`}
                                value={Math.round(a.sigmaPct)}
                                min={0}
                                max={200}
                                step={5}
                                suffix="%"
                                onChange={(v) => updateHolding(plan.id, hid, { volatilityPct: v })}
                              />
                              {overridden && (
                                <button
                                  type="button"
                                  className="mc-vol-reset"
                                  title={t('mc.resetVolTitle')}
                                  onClick={() =>
                                    updateHolding(plan.id, hid, { volatilityPct: undefined })
                                  }
                                >
                                  {t('mc.reset')}
                                </button>
                              )}
                            </span>
                          ) : (
                            `±${a.sigmaPct.toFixed(0)}%`
                          )}
                        </td>
                        <td>
                          {a.annualContribution > 0
                            ? t('mc.perYrShort', { value: fmt.compact(a.annualContribution) })
                            : '—'}
                        </td>
                        <td>{accountName(a.accountId)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {inspector.input.assets.length > 1 && (
              <>
                <div
                  className="wo-section-label"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span>{t('mc.correlationMatrix')}</span>
                  {correlationLive &&
                    plan.correlationOverrides &&
                    Object.keys(plan.correlationOverrides).length > 0 && (
                      <Button size="sm" onClick={() => resetCorrelations(plan.id)}>
                        {t('mc.resetCorrelations')}
                      </Button>
                    )}
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
                          {inspector.input.correlation[i]!.map((c, j) => {
                            const idA = inspector.input.assets[i]?.holdingId;
                            const idB = inspector.input.assets[j]?.holdingId;
                            const editable =
                              correlationLive && i !== j && idA !== undefined && idB !== undefined;
                            return (
                              <td key={j}>
                                {editable ? (
                                  <input
                                    type="number"
                                    className="mc-corr-input"
                                    min={-1}
                                    max={1}
                                    step={0.05}
                                    value={Number(c.toFixed(2))}
                                    aria-label={`Correlation ${a.symbol} / ${inspector.input.assets[j]?.symbol}`}
                                    onChange={(e) =>
                                      setCorrelation(plan.id, idA, idB, Number(e.target.value))
                                    }
                                  />
                                ) : (
                                  c.toFixed(2)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="field__hint" style={{ marginTop: 0 }}>
                  {correlationLive
                    ? t('mc.correlationHint')
                    : t('mc.correlationIgnored', { model: t(`modelName.${model}`) })}
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
      {showModelInfo && (
        <Modal
          title={t('mc.aboutModel', { model: t(`modelName.${model}`) })}
          onClose={() => setShowModelInfo(false)}
          wide
        >
          <div className="mc-model-info">
            <b>{t(`modelName.${model}`)}</b>
            <p>
              <strong>{t('mc.inPlainTerms')}</strong> {t(`modelInfo.${model}.plain`)}
            </p>
            <p>
              <strong>{t('mc.objective')}</strong> {t(`modelInfo.${model}.objective`)}
            </p>
            <p>
              <strong>{t('mc.watchOut')}</strong> {t(`modelInfo.${model}.caution`)}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};
