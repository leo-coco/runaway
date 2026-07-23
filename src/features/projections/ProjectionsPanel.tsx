import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { colorForSymbol } from '@/lib/assetColors';
import { CASH_RESERVE_SYMBOL } from '@/services/retirementCalculator';
import type { Plan } from '@/domain/plan';
import type { ProjectionResult } from '@/hooks/useProjection';
import {
  buildAppreciationExpensesData,
  buildCompositionData,
  buildGrowthData,
  buildNetChangeData,
  buildOpeningClosingData,
  buildRealEstateData,
  buildScenarioData,
  buildSurvivalData,
} from './chartData';
import { ChartTooltip } from './ChartTooltip';
import { AxisModeSwitch } from './AxisModeSwitch';
import {
  buildLandmarkTicks,
  ImportantYearTick,
  LANDMARK_COLOR,
  LandmarkLabel,
} from './ChartLandmarks';

type ChartView =
  | 'composition'
  | 'growth'
  | 'openingClosing'
  | 'netChange'
  | 'appreciationExpenses'
  | 'realEstate'
  | 'scenarios'
  | 'postRetirement';

const VIEW_ORDER: ChartView[] = [
  'growth',
  'scenarios',
  'composition',
  'openingClosing',
  'netChange',
  'appreciationExpenses',
  'realEstate',
  'postRetirement',
];

const VIEW_LABEL_KEY: Record<ChartView, string> = {
  composition: 'projChart.optComposition',
  growth: 'projChart.optGrowth',
  openingClosing: 'projChart.optOpeningClosing',
  netChange: 'projChart.optNetChange',
  appreciationExpenses: 'projChart.optApprExpenses',
  realEstate: 'projChart.optRealEstate',
  postRetirement: 'projChart.optPostRetirement',
  scenarios: 'projChart.optScenarios',
};

const VIEW_DESC_KEY: Record<ChartView, string> = {
  composition: 'projChart.descComposition',
  growth: 'projChart.descGrowth',
  openingClosing: 'projChart.descOpeningClosing',
  netChange: 'projChart.descNetChange',
  appreciationExpenses: 'projChart.descApprExpenses',
  realEstate: 'projChart.descRealEstate',
  postRetirement: 'projChart.descPostRetirement',
  scenarios: 'projChart.descScenarios',
};

const SCENARIO_SERIES_KEY: Record<string, string> = {
  optimistic: 'overview.scenarioOptimistic',
  expected: 'overview.scenarioExpected',
  conservative: 'overview.scenarioConservative',
};

const C_APPRECIATION = '#38bdf8';
const C_EXPENSES = '#f5a623';
const C_PORTFOLIO = '#38bdf8';
const C_HOME_EQUITY = '#f7931a';
const C_RENTAL_EQUITY = '#a855f7';
const C_TOTAL = '#22c55e';
const MARKER_STROKE_WIDTH = 2;

const PIE_COLORS = ['#38bdf8', '#22c55e', '#a855f7', '#f7931a', '#f43f5e'];

interface ProjectionsPanelProps {
  plan: Plan;
  projection: ProjectionResult;
}

export const ProjectionsPanel = ({ plan, projection }: ProjectionsPanelProps) => {
  const { t } = useTranslation();
  const [rawView, setView] = useState<ChartView>('growth');
  const [xAxisMode, setXAxisMode] = useState<'year' | 'age'>('year');
  const fmt = useCurrencyFormatter(plan.currency);

  // Series follow what the projection actually holds — including the synthetic
  // cash reserve that `'cash'`-mode property sale proceeds land in — not just the
  // plan's current holdings, so a reinvested lump renders instead of vanishing.
  const symbols = useMemo(() => {
    const perAsset = projection.active.years[0]?.perAsset ?? [];
    const list =
      perAsset.length > 0
        ? perAsset.map((a) => a.symbol)
        : plan.holdings.map((h) => h.instrument.symbol);
    return list.map((symbol, i) => ({
      symbol,
      label: symbol === CASH_RESERVE_SYMBOL ? t('projChart.cashReserve') : symbol,
      color: colorForSymbol(symbol, i),
    }));
  }, [projection, plan.holdings, t]);

  const compositionData = useMemo(() => buildCompositionData(projection.active), [projection]);
  const growthData = useMemo(() => buildGrowthData(projection.active), [projection]);
  const openingClosingData = useMemo(
    () => buildOpeningClosingData(projection.active),
    [projection],
  );
  const apprExpensesData = useMemo(
    () => buildAppreciationExpensesData(projection.active),
    [projection],
  );
  const netChangeData = useMemo(() => buildNetChangeData(projection.active), [projection]);
  const scenarioData = useMemo(() => buildScenarioData(projection.byScenario), [projection]);
  const survivalData = useMemo(() => buildSurvivalData(projection.byScenario), [projection]);
  const hasRealEstate = Boolean(plan.home) || (plan.properties?.length ?? 0) > 0;
  const hasRentals = (plan.properties?.length ?? 0) > 0;
  const realEstateData = useMemo(
    () =>
      hasRealEstate
        ? buildRealEstateData(projection.active, plan.home, plan.properties, projection.startYear)
        : [],
    [projection, plan.home, plan.properties, hasRealEstate],
  );
  const viewOrder = useMemo(
    () => (hasRealEstate ? VIEW_ORDER : VIEW_ORDER.filter((v) => v !== 'realEstate')),
    [hasRealEstate],
  );
  // Falls back to the primary total-portfolio view if a selected view becomes unavailable.
  const view = viewOrder.includes(rawView) ? rawView : 'growth';

  const depletion = projection.active.depletionYear;
  const axisTick = { fill: 'var(--text-dim)', fontSize: 11 };

  // Age annotations (when the user's current age is set).
  const currentAge = plan.settings.currentAge;
  const ageAt = (year: number): number | null =>
    currentAge > 0 ? currentAge + (year - projection.startYear) : null;
  const retirementAge = ageAt(plan.settings.retirementYear);
  const depletionAge = depletion !== null ? ageAt(depletion) : null;
  // The planning horizon — the year the user reaches their life-expectancy age.
  const horizonYear = projection.startYear + (plan.settings.lifeExpectancyAge - currentAge);
  const horizonAge = ageAt(horizonYear);
  // Whether the year/age switch on the X axis is shown at all: it's meaningless
  // without a valid current age to convert from.
  const canShowAge = currentAge > 0;
  const showAge = canShowAge && xAxisMode === 'age';
  const xAxisTickFormatter = (v: number) => (showAge ? `${ageAt(v) ?? v}` : `${v}`);
  const xAxisLabelFormatter = (label: unknown) => {
    const year = Number(label);
    return showAge ? `${ageAt(year) ?? year}` : `${year}`;
  };
  const importantYearTick = (
    <ImportantYearTick
      importantYears={[plan.settings.retirementYear, horizonYear]}
      dangerYears={depletion === null ? [] : [depletion]}
      firstYear={projection.active.years[0]?.year ?? projection.startYear}
      lastYear={projection.active.years.at(-1)?.year ?? horizonYear}
      formatter={xAxisTickFormatter}
    />
  );
  const xAxisTicks = buildLandmarkTicks(
    projection.active.years.map(({ year }) => year),
    [plan.settings.retirementYear, horizonYear, ...(depletion === null ? [] : [depletion])],
  );

  // Vertical markers shared by every time-axis chart: retirement, plan-end
  // (death) and, if the money runs out, the depletion year. Always labelled —
  // every chart view needs the same landmarks, not just the default one.
  const yearMarkers = () => {
    const els = [
      <ReferenceLine
        key="ret"
        x={plan.settings.retirementYear}
        stroke={LANDMARK_COLOR}
        strokeWidth={MARKER_STROKE_WIDTH}
        strokeDasharray="4 4"
        label={
          <LandmarkLabel
            value={
              showAge && retirementAge !== null
                ? t('projChart.retirementAgeOnly', { age: retirementAge })
                : t('projChart.retirement', { year: plan.settings.retirementYear })
            }
            align="left"
            verticalAlign="top"
          />
        }
      />,
      <ReferenceLine
        key="hor"
        x={horizonYear}
        stroke={LANDMARK_COLOR}
        strokeWidth={MARKER_STROKE_WIDTH}
        strokeDasharray="4 4"
        label={
          <LandmarkLabel
            value={
              showAge && horizonAge !== null
                ? t('projChart.planEndsAgeOnly', { age: horizonAge })
                : t('projChart.planEnds', { year: horizonYear })
            }
            align="right"
            verticalAlign="top"
          />
        }
      />,
    ];
    if (depletion !== null) {
      els.push(
        <ReferenceLine
          key="dep"
          x={depletion}
          stroke="var(--danger)"
          strokeWidth={MARKER_STROKE_WIDTH}
          strokeDasharray="6 4"
          label={
            <LandmarkLabel
              value={
                showAge && depletionAge !== null
                  ? t('projChart.depletionAgeOnly', { age: depletionAge })
                  : t('projChart.depletion', { year: depletion })
              }
              align="left"
              verticalAlign="middle"
              tone="danger"
            />
          }
        />,
      );
    }
    return els;
  };

  return (
    <Card className="chart-card" data-tour="projection-chart">
      <div className="chart-card__head">
        <div>
          <h3 className="chart-card__title">{t('projChart.title')}</h3>
          <p className="chart-card__desc">{t(VIEW_DESC_KEY[view])}</p>
        </div>
        <div className="chart-view" data-tour="chart-view">
          <label htmlFor="chart-view">{t('projChart.chartView')}</label>
          <select
            id="chart-view"
            className="select"
            value={view}
            onChange={(e) => setView(e.target.value as ChartView)}
          >
            {viewOrder.map((v) => (
              <option key={v} value={v}>
                {t(VIEW_LABEL_KEY[v])}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        {view === 'composition' ? (
          <AreaChart data={compositionData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={importantYearTick}
              ticks={xAxisTicks}
              interval={0}
              stroke="var(--border)"
              minTickGap={40}
              tickFormatter={xAxisTickFormatter}
            />
            <YAxis
              tick={axisTick}
              stroke="var(--border)"
              tickFormatter={(v) => fmt.compact(Number(v))}
              width={60}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={xAxisLabelFormatter}
                  formatter={(value: unknown, name: unknown) => [
                    fmt.format(Number(value)),
                    String(name),
                  ]}
                />
              }
            />
            {yearMarkers()}
            {symbols.map((s) => (
              <Area
                key={s.symbol}
                type="monotone"
                dataKey={s.symbol}
                name={s.label}
                stackId="1"
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.55}
              />
            ))}
          </AreaChart>
        ) : view === 'growth' ? (
          <AreaChart data={growthData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={importantYearTick}
              ticks={xAxisTicks}
              interval={0}
              stroke="var(--border)"
              minTickGap={40}
              tickFormatter={xAxisTickFormatter}
            />
            <YAxis
              tick={axisTick}
              stroke="var(--border)"
              tickFormatter={(v) => fmt.compact(Number(v))}
              width={60}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={xAxisLabelFormatter}
                  formatter={(value: unknown) => [
                    fmt.format(Number(value)),
                    t('projChart.seriesPortfolio'),
                  ]}
                />
              }
            />
            {yearMarkers()}
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--accent)"
              fill="var(--accent)"
              fillOpacity={0.25}
            />
          </AreaChart>
        ) : view === 'openingClosing' ? (
          <LineChart data={openingClosingData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={importantYearTick}
              ticks={xAxisTicks}
              interval={0}
              stroke="var(--border)"
              minTickGap={40}
              tickFormatter={xAxisTickFormatter}
            />
            <YAxis
              tick={axisTick}
              stroke="var(--border)"
              tickFormatter={(v) => fmt.compact(Number(v))}
              width={60}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={xAxisLabelFormatter}
                  formatter={(value: unknown, name) => [
                    fmt.format(Number(value)),
                    name === 'opening'
                      ? t('projChart.seriesOpening')
                      : t('projChart.seriesClosing'),
                  ]}
                />
              }
            />
            {yearMarkers()}
            <Line type="monotone" dataKey="opening" stroke="#38bdf8" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="closing" stroke="#22c55e" dot={false} strokeWidth={2} />
          </LineChart>
        ) : view === 'netChange' ? (
          <LineChart data={netChangeData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={importantYearTick}
              ticks={xAxisTicks}
              interval={0}
              stroke="var(--border)"
              minTickGap={40}
              tickFormatter={xAxisTickFormatter}
            />
            <YAxis
              tick={axisTick}
              stroke="var(--border)"
              tickFormatter={(v) => fmt.compact(Number(v))}
              width={64}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={xAxisLabelFormatter}
                  formatter={(value: unknown) => [
                    fmt.format(Number(value)),
                    t('projChart.seriesNetChange'),
                  ]}
                />
              }
            />
            <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
            {yearMarkers()}
            <Line
              type="monotone"
              dataKey="net"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 2, fill: '#38bdf8' }}
            />
          </LineChart>
        ) : view === 'appreciationExpenses' ? (
          <BarChart data={apprExpensesData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={importantYearTick}
              ticks={xAxisTicks}
              interval={0}
              stroke="var(--border)"
              minTickGap={40}
              tickFormatter={xAxisTickFormatter}
            />
            <YAxis
              tick={axisTick}
              stroke="var(--border)"
              tickFormatter={(v) => fmt.compact(Number(v))}
              width={60}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={
                <ChartTooltip
                  labelFormatter={xAxisLabelFormatter}
                  formatter={(value: unknown, name) => [
                    fmt.format(Number(value)),
                    name === 'appreciation'
                      ? t('projChart.seriesAppreciation')
                      : t('projChart.seriesExpenses'),
                  ]}
                />
              }
            />
            {yearMarkers()}
            <Bar dataKey="appreciation" fill={C_APPRECIATION} radius={[2, 2, 0, 0]} />
            <Bar dataKey="expenses" fill={C_EXPENSES} radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : view === 'realEstate' ? (
          <LineChart data={realEstateData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={importantYearTick}
              ticks={xAxisTicks}
              interval={0}
              stroke="var(--border)"
              minTickGap={40}
              tickFormatter={xAxisTickFormatter}
            />
            <YAxis
              tick={axisTick}
              stroke="var(--border)"
              tickFormatter={(v) => fmt.compact(Number(v))}
              width={60}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={xAxisLabelFormatter}
                  formatter={(value: unknown, name) => [
                    fmt.format(Number(value)),
                    name === 'portfolio'
                      ? t('projChart.seriesPortfolio')
                      : name === 'homeEquity'
                        ? t('projChart.seriesHomeEquity')
                        : name === 'rentalEquity'
                          ? t('projChart.seriesRentalEquity')
                          : t('projChart.seriesTotal'),
                  ]}
                />
              }
            />
            {yearMarkers()}
            <Line
              type="monotone"
              dataKey="portfolio"
              stroke={C_PORTFOLIO}
              dot={false}
              strokeWidth={2}
            />
            {plan.home && (
              <Line
                type="monotone"
                dataKey="homeEquity"
                stroke={C_HOME_EQUITY}
                dot={false}
                strokeWidth={2}
              />
            )}
            {hasRentals && (
              <Line
                type="monotone"
                dataKey="rentalEquity"
                stroke={C_RENTAL_EQUITY}
                dot={false}
                strokeWidth={2}
              />
            )}
            <Line type="monotone" dataKey="total" stroke={C_TOTAL} dot={false} strokeWidth={2} />
          </LineChart>
        ) : view === 'scenarios' ? (
          <LineChart data={scenarioData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={importantYearTick}
              ticks={xAxisTicks}
              interval={0}
              stroke="var(--border)"
              minTickGap={40}
              tickFormatter={xAxisTickFormatter}
            />
            <YAxis
              tick={axisTick}
              stroke="var(--border)"
              tickFormatter={(v) => fmt.compact(Number(v))}
              width={60}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={xAxisLabelFormatter}
                  formatter={(value: unknown, name: unknown) => [
                    fmt.format(Number(value)),
                    SCENARIO_SERIES_KEY[String(name)]
                      ? t(SCENARIO_SERIES_KEY[String(name)]!)
                      : String(name),
                  ]}
                />
              }
            />
            {yearMarkers()}
            <Line
              type="monotone"
              dataKey="optimistic"
              stroke="#22c55e"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="expected"
              stroke="var(--accent)"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="conservative"
              stroke="#f43f5e"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        ) : (
          <BarChart data={survivalData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={axisTick} stroke="var(--border)" />
            <YAxis tick={axisTick} stroke="var(--border)" width={40} />
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(value: unknown) => [
                    t('projChart.yearsValue', { years: Number(value) }),
                    t('projChart.seriesSurvival'),
                  ]}
                />
              }
            />
            <Bar dataKey="years" radius={[6, 6, 0, 0]}>
              {survivalData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>

      {canShowAge && view !== 'postRetirement' && (
        <AxisModeSwitch mode={xAxisMode} onChange={setXAxisMode} />
      )}

      {view === 'openingClosing' && (
        <div className="legend">
          <span>
            <i style={{ background: '#38bdf8' }} /> {t('projChart.legendOpening')}
          </span>
          <span>
            <i style={{ background: '#22c55e' }} /> {t('projChart.legendClosing')}
          </span>
        </div>
      )}

      {view === 'appreciationExpenses' && (
        <div className="legend">
          <span>
            <i style={{ background: C_APPRECIATION }} /> {t('projChart.seriesAppreciation')}
          </span>
          <span>
            <i style={{ background: C_EXPENSES }} /> {t('projChart.seriesExpenses')}
          </span>
        </div>
      )}

      {view === 'realEstate' && (
        <div className="legend">
          <span>
            <i style={{ background: C_PORTFOLIO }} /> {t('projChart.seriesPortfolio')}
          </span>
          {plan.home && (
            <span>
              <i style={{ background: C_HOME_EQUITY }} /> {t('projChart.seriesHomeEquity')}
            </span>
          )}
          {hasRentals && (
            <span>
              <i style={{ background: C_RENTAL_EQUITY }} /> {t('projChart.seriesRentalEquity')}
            </span>
          )}
          <span>
            <i style={{ background: C_TOTAL }} /> {t('projChart.seriesTotal')}
          </span>
        </div>
      )}

      {view === 'composition' && (
        <div className="legend">
          {symbols.map((s) => (
            <span key={s.symbol}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
};
