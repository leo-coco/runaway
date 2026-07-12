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
  Pie,
  PieChart,
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
import type { Plan } from '@/domain/plan';
import type { ProjectionResult } from '@/hooks/useProjection';
import {
  buildAllocationData,
  buildAppreciationExpensesData,
  buildCompositionData,
  buildGrowthData,
  buildNetChangeData,
  buildOpeningClosingData,
  buildScenarioData,
  buildSurvivalData,
} from './chartData';
import { ChartTooltip } from './ChartTooltip';
import { AxisModeSwitch } from './AxisModeSwitch';

type ChartView =
  | 'composition'
  | 'growth'
  | 'openingClosing'
  | 'netChange'
  | 'appreciationExpenses'
  | 'allocation'
  | 'scenarios'
  | 'postRetirement';

const VIEW_ORDER: ChartView[] = [
  'composition',
  'growth',
  'openingClosing',
  'netChange',
  'appreciationExpenses',
  'allocation',
  'postRetirement',
  'scenarios',
];

const VIEW_LABEL_KEY: Record<ChartView, string> = {
  composition: 'projChart.optComposition',
  growth: 'projChart.optGrowth',
  openingClosing: 'projChart.optOpeningClosing',
  netChange: 'projChart.optNetChange',
  appreciationExpenses: 'projChart.optApprExpenses',
  allocation: 'projChart.optAllocation',
  postRetirement: 'projChart.optPostRetirement',
  scenarios: 'projChart.optScenarios',
};

const VIEW_DESC_KEY: Record<ChartView, string> = {
  composition: 'projChart.descComposition',
  growth: 'projChart.descGrowth',
  openingClosing: 'projChart.descOpeningClosing',
  netChange: 'projChart.descNetChange',
  appreciationExpenses: 'projChart.descApprExpenses',
  allocation: 'projChart.descAllocation',
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
const C_HORIZON = '#5eead4';

const PIE_COLORS = ['#38bdf8', '#22c55e', '#a855f7', '#f7931a', '#f43f5e'];

interface ProjectionsPanelProps {
  plan: Plan;
  projection: ProjectionResult;
}

export const ProjectionsPanel = ({ plan, projection }: ProjectionsPanelProps) => {
  const { t } = useTranslation();
  const [view, setView] = useState<ChartView>('composition');
  const [xAxisMode, setXAxisMode] = useState<'year' | 'age'>('year');
  const fmt = useCurrencyFormatter(plan.currency);

  const symbols = useMemo(
    () =>
      plan.holdings.map((h, i) => ({
        symbol: h.instrument.symbol,
        color: colorForSymbol(h.instrument.symbol, i),
      })),
    [plan.holdings],
  );

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
  const allocationData = useMemo(() => buildAllocationData(projection.allocation), [projection]);
  const survivalData = useMemo(() => buildSurvivalData(projection.byScenario), [projection]);

  const depletion = projection.active.depletionYear;
  const tip = (v: number | string) => fmt.compact(Number(v));
  const axisTick = { fill: 'var(--text-dim)', fontSize: 11 };

  // Age annotations (when the user's current age is set).
  const currentAge = plan.settings.currentAge;
  const ageAt = (year: number): number | null =>
    currentAge > 0 ? currentAge + (year - projection.startYear) : null;
  const withAge = (year: number): string => {
    const age = ageAt(year);
    return age !== null ? t('projChart.withAge', { year, age }) : `${year}`;
  };
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

  // Vertical markers shared by every time-axis chart: retirement, plan-end
  // (death) and, if the money runs out, the depletion year.
  const yearMarkers = (labels: boolean) => {
    const els = [
      <ReferenceLine
        key="ret"
        x={plan.settings.retirementYear}
        stroke="var(--text-dim)"
        strokeDasharray="4 4"
        label={
          labels
            ? {
                value:
                  retirementAge !== null
                    ? t('projChart.retirementAge', {
                        year: plan.settings.retirementYear,
                        age: retirementAge,
                      })
                    : t('projChart.retirement', { year: plan.settings.retirementYear }),
                fill: 'var(--text-dim)',
                fontSize: 10,
                position: 'insideTopLeft',
              }
            : undefined
        }
      />,
      <ReferenceLine
        key="hor"
        x={horizonYear}
        stroke={C_HORIZON}
        strokeDasharray="4 4"
        label={
          labels
            ? {
                value:
                  horizonAge !== null
                    ? t('projChart.planEndsAge', { year: horizonYear, age: horizonAge })
                    : t('projChart.planEnds', { year: horizonYear }),
                fill: C_HORIZON,
                fontSize: 10,
                position: 'insideTopRight',
              }
            : undefined
        }
      />,
    ];
    if (depletion !== null) {
      els.push(
        <ReferenceLine
          key="dep"
          x={depletion}
          stroke="var(--danger)"
          strokeDasharray="6 4"
          label={
            labels
              ? {
                  value:
                    depletionAge !== null
                      ? t('projChart.depletionAge', { year: depletion, age: depletionAge })
                      : t('projChart.depletion', { year: depletion }),
                  fill: 'var(--danger)',
                  fontSize: 11,
                  position: 'top',
                }
              : undefined
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
            {VIEW_ORDER.map((v) => (
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
              tick={axisTick}
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
            {yearMarkers(true)}
            {symbols.map((s) => (
              <Area
                key={s.symbol}
                type="monotone"
                dataKey={s.symbol}
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
              tick={axisTick}
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
            {yearMarkers(false)}
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
              tick={axisTick}
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
            {yearMarkers(false)}
            <Line type="monotone" dataKey="opening" stroke="#38bdf8" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="closing" stroke="#22c55e" dot={false} strokeWidth={2} />
          </LineChart>
        ) : view === 'netChange' ? (
          <LineChart data={netChangeData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={axisTick}
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
            {yearMarkers(true)}
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
              tick={axisTick}
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
            {yearMarkers(false)}
            <Bar dataKey="appreciation" fill={C_APPRECIATION} radius={[2, 2, 0, 0]} />
            <Bar dataKey="expenses" fill={C_EXPENSES} radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : view === 'scenarios' ? (
          <LineChart data={scenarioData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={axisTick}
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
            {yearMarkers(false)}
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
        ) : view === 'allocation' ? (
          <PieChart>
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(value: unknown, name: unknown) => [
                    fmt.format(Number(value)),
                    String(name),
                  ]}
                />
              }
            />
            <Pie
              data={allocationData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={130}
              innerRadius={70}
              paddingAngle={2}
            >
              {allocationData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
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

      {canShowAge && view !== 'allocation' && view !== 'postRetirement' && (
        <AxisModeSwitch mode={xAxisMode} onChange={setXAxisMode} />
      )}

      {(view === 'composition' ||
        view === 'growth' ||
        view === 'openingClosing' ||
        view === 'netChange') && (
        <div className="chart-meta">
          {t('projChart.metaToday', { value: tip(growthData[0]?.total ?? 0) })}
          {depletion !== null && (
            <span>{t('projChart.metaDeplete', { when: withAge(depletion) })}</span>
          )}
          {projection.active.yearsOfSurvival !== null && (
            <span>{t('projChart.metaSurvival', { years: projection.active.yearsOfSurvival })}</span>
          )}
        </div>
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

      {view === 'composition' && (
        <div className="legend">
          {symbols.map((s) => (
            <span key={s.symbol}>
              <i style={{ background: s.color }} />
              {s.symbol}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
};
