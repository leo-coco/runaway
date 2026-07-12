import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Modal } from '@/components/ui/Modal';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import {
  sampleTrials,
  type MonteCarloInput,
  type MonteCarloOptions,
  type Trial,
  type TrialOutcomeCategory,
} from '@/services/monteCarlo';
import { SampleScenarioTable } from './SampleScenarioTable';
import type { Plan } from '@/domain/plan';
import { colorForSymbol } from '@/lib/assetColors';
import { cn } from '@/lib/cn';
import { GridIcon, InfoIcon, ListIcon } from '@/components/icons';
import { ChartTooltip } from './ChartTooltip';
import { AxisModeSwitch, type AxisMode } from './AxisModeSwitch';

interface Props {
  plan: Plan;
  input: MonteCarloInput;
  options: MonteCarloOptions;
  startYear: number;
  retirementYear: number;
  endYear: number;
  onClose: () => void;
  /** When set, the trial list opens pre-filtered to just this outcome category. */
  initialCategoryFilter?: TrialOutcomeCategory | null;
}

const TRIAL_COUNT = 100;

const CATEGORY_ORDER: readonly TrialOutcomeCategory[] = [
  'largeSurplus',
  'comfortable',
  'almostMadeIt',
  'failedInMiddle',
];

const CATEGORY_COLOR: Record<TrialOutcomeCategory, string> = {
  largeSurplus: 'var(--success)',
  comfortable: 'var(--accent)',
  almostMadeIt: 'var(--amber)',
  failedInMiddle: 'var(--danger)',
};

const CATEGORY_LABEL_KEY: Record<TrialOutcomeCategory, string> = {
  largeSurplus: 'mc.outcomeLargeSurplus',
  comfortable: 'mc.outcomeComfortable',
  almostMadeIt: 'mc.outcomeAlmostMadeIt',
  failedInMiddle: 'mc.outcomeFailedMiddle',
};

type SortMode = 'category' | 'balanceDesc' | 'balanceAsc';

const FAN_RED = '#f43f5e';

/**
 * Fullscreen browser over every sampled trial: a sortable/filterable list of
 * trials colored by outcome on top, the selected trial's composition chart
 * below it, then the existing year-by-year table underneath.
 */
export const TrialExplorerModal = ({
  plan,
  input,
  options,
  startYear,
  retirementYear,
  onClose,
  initialCategoryFilter,
}: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const { currentAge } = plan.settings;

  const trials = useMemo(() => sampleTrials(input, options, TRIAL_COUNT), [input, options]);
  // Grouping by start year is only meaningful when each trial draws its own
  // cohort. A fixed histStartYear pins every trial to the same historical
  // replay, so every tile would show the same year.
  const supportsYearGrid =
    (options.model === 'historical-real' || options.model === 'historical-real-centered') &&
    options.histStartYear === undefined;

  const [sortMode, setSortMode] = useState<SortMode>('category');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(supportsYearGrid ? 'grid' : 'list');
  const [categoryFilter, setCategoryFilter] = useState<Set<TrialOutcomeCategory>>(
    () => (initialCategoryFilter ? new Set([initialCategoryFilter]) : new Set(CATEGORY_ORDER)),
  );
  const [selectedSeed, setSelectedSeed] = useState<number | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({ closing: true });
  const toggleRow = (key: string) => setOpenRows((prev) => ({ ...prev, [key]: !prev[key] }));
  const [compView, setCompView] = useState<'stacked' | 'total'>('total');
  const [xAxisMode, setXAxisMode] = useState<AxisMode>('year');
  const canShowAge = currentAge > 0;
  const showAge = canShowAge && xAxisMode === 'age';
  const ageAt = (year: number): number => currentAge + (year - startYear);
  const xAxisTickFormatter = (v: number) => (showAge ? `${ageAt(v)}` : `${v}`);
  const xAxisLabelFormatter = (label: string | number) => (showAge ? ageAt(Number(label)) : label);

  const visibleTrials = useMemo(() => {
    const categoryRank = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
    const filtered = trials.filter((tr) => categoryFilter.has(tr.category));
    const sorted = filtered.slice().sort((a, b) => {
      if (sortMode === 'balanceDesc') return b.terminalBalance - a.terminalBalance;
      if (sortMode === 'balanceAsc') return a.terminalBalance - b.terminalBalance;
      const rankDiff = categoryRank.get(a.category)! - categoryRank.get(b.category)!;
      return rankDiff !== 0 ? rankDiff : b.terminalBalance - a.terminalBalance;
    });
    return sorted;
  }, [trials, categoryFilter, sortMode]);

  const selected: Trial | null =
    visibleTrials.find((tr) => tr.seed === selectedSeed) ?? visibleTrials[0] ?? null;

  const toggleCategory = (cat: TrialOutcomeCategory) => {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next.size === 0 ? new Set(CATEGORY_ORDER) : next;
    });
  };

  const years = selected?.path.years ?? [];

  const syms = input.assets.map((a, i) => {
    const symbol = a.symbol ?? `Asset ${i + 1}`;
    return { symbol, color: colorForSymbol(symbol, i) };
  });

  const chartData = years.map((y) => {
    const row: { year: number } & Record<string, number> = { year: y.year, total: y.closingTotal };
    y.assets.forEach((a, i) => {
      const sym = syms[i];
      if (sym) row[sym.symbol] = a.closing;
    });
    return row;
  });

  return (
    <Modal
      title={t('mc.trialExplorerTitle')}
      description={t('mc.trialExplorerDesc', { count: TRIAL_COUNT })}
      onClose={onClose}
      fullscreen
    >
      <div className="trial-explorer">
        <div className="trial-explorer__top">
        <div className="trial-explorer__list">
          <div className="trial-explorer__controls">
            <div className="trial-explorer__controls-row">
              <label className="trial-explorer__sort">
                <span>{t('mc.trialSortBy')}</span>
                <select
                  className="select"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                >
                  <option value="category">{t('mc.trialSortCategory')}</option>
                  <option value="balanceDesc">{t('mc.trialSortBalanceDesc')}</option>
                  <option value="balanceAsc">{t('mc.trialSortBalanceAsc')}</option>
                </select>
              </label>
              {supportsYearGrid && (
                <div className="trial-explorer__view-toggle" role="group">
                  <button
                    type="button"
                    className={cn(
                      'trial-explorer__view-btn',
                      viewMode === 'grid' && 'is-active',
                    )}
                    aria-label={t('mc.trialViewGrid')}
                    title={t('mc.trialViewGrid')}
                    onClick={() => setViewMode('grid')}
                  >
                    <GridIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'trial-explorer__view-btn',
                      viewMode === 'list' && 'is-active',
                    )}
                    aria-label={t('mc.trialViewList')}
                    title={t('mc.trialViewList')}
                    onClick={() => setViewMode('list')}
                  >
                    <ListIcon size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="trial-explorer__filters">
              {CATEGORY_ORDER.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={cn('trial-explorer__filter', categoryFilter.has(cat) && 'is-active')}
                  style={{
                    borderColor: CATEGORY_COLOR[cat],
                    color: categoryFilter.has(cat) ? CATEGORY_COLOR[cat] : undefined,
                  }}
                  onClick={() => toggleCategory(cat)}
                >
                  <i style={{ background: CATEGORY_COLOR[cat] }} />
                  {t(CATEGORY_LABEL_KEY[cat])}
                </button>
              ))}
            </div>
          </div>
          {viewMode === 'grid' && supportsYearGrid ? (
            <div className="trial-explorer__grid-wrap">
              <div className="trial-explorer__grid-title">
                {t('mc.trialsByStartYear')}
                <span className="mc-info" role="img" aria-label={t('mc.trialsByStartYearInfo')}>
                  <InfoIcon size={13} />
                  <span className="mc-tip" role="tooltip">
                    {t('mc.trialsByStartYearInfo')}
                  </span>
                </span>
              </div>
              <div className="trial-explorer__grid">
                {visibleTrials.map((tr) => (
                  <button
                    key={tr.seed}
                    type="button"
                    className={cn(
                      'trial-explorer__tile',
                      selected?.seed === tr.seed && 'is-selected',
                    )}
                    style={{ background: CATEGORY_COLOR[tr.category] }}
                    title={`${t(CATEGORY_LABEL_KEY[tr.category])} · ${fmt.compact(tr.terminalBalance)}`}
                    onClick={() => setSelectedSeed(tr.seed)}
                  >
                    {tr.histStartYear ?? '—'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="trial-explorer__table-wrap">
              <table className="trial-explorer__table">
                <thead>
                  <tr>
                    <th>{t('mc.trialCol')}</th>
                    <th>{t('mc.colCategory')}</th>
                    <th className="num">{t('mc.colTerminalBalance')}</th>
                    <th className="num">{t('mc.colDryYear')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTrials.map((tr) => (
                    <tr
                      key={tr.seed}
                      className={cn(
                        'trial-explorer__row',
                        selected?.seed === tr.seed && 'is-selected',
                      )}
                      onClick={() => setSelectedSeed(tr.seed)}
                    >
                      <td>#{tr.index}</td>
                      <td>
                        <i
                          className="trial-explorer__dot"
                          style={{ background: CATEGORY_COLOR[tr.category] }}
                        />
                        {t(CATEGORY_LABEL_KEY[tr.category])}
                      </td>
                      <td className="num">{fmt.compact(tr.terminalBalance)}</td>
                      <td className="num">{tr.dryYear ?? t('mc.trialNever')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected && (
          <div className="trial-explorer__chart">
            <div className="chart-view" style={{ marginBottom: 8 }}>
              <select
                aria-label={t('projChart.chartView')}
                className="select"
                value={compView}
                onChange={(e) => setCompView(e.target.value as 'stacked' | 'total')}
              >
                <option value="total">{t('projChart.optGrowth')}</option>
                <option value="stacked">{t('projChart.optComposition')}</option>
              </select>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
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
                <ReferenceLine x={retirementYear} stroke="var(--text-dim)" strokeDasharray="4 4" />
                {selected.dryYear !== null && (
                  <ReferenceLine x={selected.dryYear} stroke={FAN_RED} strokeDasharray="6 4" />
                )}
                {compView === 'stacked' ? (
                  syms.map((s) => (
                    <Area
                      key={s.symbol}
                      type="monotone"
                      dataKey={s.symbol}
                      stackId="1"
                      stroke={s.color}
                      fill={s.color}
                      fillOpacity={0.55}
                    />
                  ))
                ) : (
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Portfolio"
                    stroke="var(--accent)"
                    fill="var(--accent)"
                    fillOpacity={0.25}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
            {canShowAge && <AxisModeSwitch mode={xAxisMode} onChange={setXAxisMode} />}
          </div>
        )}
        </div>

        {selected && (
          <div className="trial-explorer__data">
            <SampleScenarioTable
              plan={plan}
              years={years}
              symbols={syms.map((s) => s.symbol)}
              format={fmt.format}
              openRows={openRows}
              toggleRow={toggleRow}
              currentAge={currentAge}
              startYear={startYear}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
