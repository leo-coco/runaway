import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartTooltip } from '@/features/projections/ChartTooltip';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useAppStore } from '@/store';
import { accountTaxAtSpending } from '@/domain/accountTaxRate';
import { scenarioAdjustmentPts } from '@/domain/scenario';
import { valueHoldings } from '@/services/portfolioService';
import { buildProjectionInput } from '@/services/projectionBuilder';
import { project } from '@/services/retirementCalculator';
import {
  orderPreserveGrowth,
  orderRiskOnFirst,
  orderTaxOptimized,
  type AccountRanking,
} from '@/services/drawdownSimulator';
import { bracketFxFactor, type RatesTable } from '@/services/currencyService';
import type { Plan } from '@/domain/plan';
import { cn } from '@/lib/cn';

interface Props {
  plan: Plan;
  rates: RatesTable | undefined;
  onClose: () => void;
}

const HORIZON_YEARS = 50;
const PALETTE = ['#8b8bf6', '#34d3c0', '#b07cf0', '#f5a623', '#f43f5e', '#38bdf8', '#22c55e'];

const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

interface SankeyNodeDatum {
  name: string;
  color?: string;
  targetLinks?: unknown[];
}

/** Sankey node: a coloured bar with a label placed outside the diagram. */
const SankeyNode = (props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: SankeyNodeDatum;
}) => {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  // Source nodes (accounts) have no incoming links → label on the left.
  const isSource = (payload?.targetLinks?.length ?? 0) === 0;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(1, height)}
        rx={2}
        fill={payload?.color ?? 'var(--accent)'}
        fillOpacity={0.9}
      />
      <text
        x={isSource ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isSource ? 'end' : 'start'}
        dominantBaseline="middle"
        fontSize={11}
        style={{ fill: 'var(--text-muted)' }}
      >
        {payload?.name}
      </text>
    </g>
  );
};

/** Sankey link: a curved band coloured by its source (account) colour. */
const SankeyLink = (props: {
  sourceX?: number;
  targetX?: number;
  sourceY?: number;
  targetY?: number;
  sourceControlX?: number;
  targetControlX?: number;
  linkWidth?: number;
  payload?: { source?: SankeyNodeDatum; target?: SankeyNodeDatum };
}) => {
  const {
    sourceX = 0,
    targetX = 0,
    sourceY = 0,
    targetY = 0,
    sourceControlX = 0,
    targetControlX = 0,
    linkWidth = 0,
    payload,
  } = props;
  const color = payload?.source?.color ?? payload?.target?.color ?? 'var(--text-dim)';
  return (
    <path
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      style={{ stroke: color }}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.45}
    />
  );
};

const permutations = <T,>(items: readonly T[]): T[][] => {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
};

export const WithdrawalOrderModal = ({ plan, rates, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const taxBadge = (effTax: number): string =>
    effTax <= 0
      ? t('withdrawal.taxFree')
      : t('withdrawal.taxed', { rate: (effTax * 100).toFixed(0) });
  const openModal = useAppStore((s) => s.openModal);
  const setWithdrawalOrder = useAppStore((s) => s.setWithdrawalOrder);
  const [outflowView, setOutflowView] = useState<'flow' | 'yearly'>('yearly');

  const startYear = new Date().getFullYear();
  const { currentAge, annualSpending, inflationPct, retirementYear } = plan.settings;
  const inflationOn = inflationPct > 0;
  const horizonEndYear = startYear + HORIZON_YEARS;

  // Normalised draw order: stored order (valid ids) then any missing account.
  const order = useMemo(() => {
    const ids = plan.withdrawalOrder.filter((id) => plan.accounts.some((a) => a.id === id));
    for (const a of plan.accounts) if (!ids.includes(a.id)) ids.push(a.id);
    return ids;
  }, [plan.withdrawalOrder, plan.accounts]);

  // Per-account balance / blended return / tax (for the list + presets). The
  // tax badge uses the engine-faithful rate AT the plan's spending level with
  // the live gain fraction — the same figure the projection actually charges —
  // instead of the static headline rate (which ignores brackets and live gains).
  const summaries = useMemo(() => {
    const values = valueHoldings(plan.holdings, plan.currency, rates);
    const adj = scenarioAdjustmentPts(plan.scenario, plan.scenario.active);
    return plan.accounts.map((acc) => {
      const held = values.filter((v) => v.accountId === acc.id);
      const balance = held.reduce((s, v) => s + v.value, 0);
      const basis = held.reduce(
        (s, v) => s + (v.costBasis ?? v.value * ((acc.costBasisPct ?? 0) / 100)),
        0,
      );
      const liveGain =
        balance > 0 ? Math.min(1, Math.max(0, (balance - basis) / balance)) : undefined;
      const returnPct =
        balance > 0 ? held.reduce((s, v) => s + v.value * (v.baseCagrPct + adj), 0) / balance : 0;
      return {
        id: acc.id,
        label: acc.name,
        balance,
        returnPct,
        effectiveTaxRate: accountTaxAtSpending(
          acc,
          plan.residenceCountry ?? 'US',
          plan.settings.annualSpending,
          liveGain,
          plan.residenceProvince,
          bracketFxFactor(plan.residenceCountry ?? 'US', plan.currency, rates),
        ).effective,
      };
    });
  }, [
    plan.holdings,
    plan.accounts,
    plan.scenario,
    plan.currency,
    plan.residenceCountry,
    plan.residenceProvince,
    plan.settings.annualSpending,
    rates,
  ]);
  const summaryById = useMemo(() => new Map(summaries.map((s) => [s.id, s])), [summaries]);
  const colorById = useMemo(() => {
    const m = new Map<string, string>();
    plan.accounts.forEach((a, i) => m.set(a.id, PALETTE[i % PALETTE.length] ?? '#8b8bf6'));
    return m;
  }, [plan.accounts]);

  // The actual simulation uses the shared projection engine (same as the page).
  const projection = useMemo(
    () =>
      project(
        buildProjectionInput(plan, rates, startYear, HORIZON_YEARS, order),
        plan.scenario.active,
      ),
    [plan, rates, order, startYear],
  );

  const accountIdByHolding = useMemo(
    () => new Map(plan.holdings.map((h) => [h.id, h.accountId])),
    [plan.holdings],
  );

  // Aggregate per-asset balances into per-account balances for the chart.
  const { chartData, emptiesYear } = useMemo(() => {
    const rows = projection.years.map((y) => {
      const row: Record<string, number> = { year: y.year };
      for (const a of plan.accounts) row[a.id] = 0;
      for (const pa of y.perAsset) {
        const accId = accountIdByHolding.get(pa.holdingId) ?? null;
        if (accId && row[accId] !== undefined) row[accId] += pa.value;
      }
      return row;
    });
    const empties: Record<string, number | null> = {};
    for (const a of plan.accounts) {
      let started = false;
      let year: number | null = null;
      for (const row of rows) {
        const v = row[a.id] ?? 0;
        if (v > 0.5) started = true;
        else if (started && year === null) year = row.year as number;
      }
      empties[a.id] = year;
    }
    return { chartData: rows, emptiesYear: empties };
  }, [projection, plan.accounts, accountIdByHolding]);

  // Per-account amount withdrawn each year, derived from the balance series and
  // each account's (constant, pro-rata) blended return:
  //   outflow = opening × (1 + return) − closing, clamped to ≥ 0.
  // Pre-retirement years (where contributions lift the balance) net out to 0.
  const outflowData = useMemo(() => {
    const rByAccount = new Map(summaries.map((s) => [s.id, s.returnPct / 100]));
    return chartData.map((row, i) => {
      const out: Record<string, number> = { year: row.year as number };
      for (const a of plan.accounts) {
        if (i === 0) {
          out[a.id] = 0;
          continue;
        }
        const prev = chartData[i - 1]!;
        const r = rByAccount.get(a.id) ?? 0;
        const opening = (prev[a.id] as number) ?? 0;
        const closing = (row[a.id] as number) ?? 0;
        const flow = opening * (1 + r) - closing;
        out[a.id] = flow > 0.5 ? flow : 0;
      }
      return out;
    });
  }, [chartData, summaries, plan.accounts]);

  // Sankey: total withdrawn from each account over the horizon, split into the
  // net that funds spending and the tax paid. Shows where retirement money comes
  // from and how much each account leaks to tax under the chosen order.
  const sankey = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of plan.accounts) totals.set(a.id, 0);
    for (const row of outflowData) {
      for (const a of plan.accounts) {
        totals.set(a.id, (totals.get(a.id) ?? 0) + ((row[a.id] as number) ?? 0));
      }
    }
    const active = plan.accounts
      .map((a) => ({ a, gross: totals.get(a.id) ?? 0 }))
      .filter((x) => x.gross > 0.5);

    const nodes: SankeyNodeDatum[] = active.map((x) => ({
      name: x.a.name,
      color: colorById.get(x.a.id),
    }));
    const links: Array<{ source: number; target: number; value: number }> = [];

    const taxOf = (id: string, gross: number) =>
      gross * (summaryById.get(id)?.effectiveTaxRate ?? 0);
    const anyTax = active.some((x) => taxOf(x.a.id, x.gross) > 0.5);

    const spendingIdx = nodes.length;
    nodes.push({ name: t('withdrawal.sankeySpending'), color: 'var(--success)' });
    let taxesIdx = -1;
    if (anyTax) {
      taxesIdx = nodes.length;
      nodes.push({ name: t('withdrawal.sankeyTaxes'), color: 'var(--danger, #f43f5e)' });
    }

    active.forEach((x, i) => {
      const tax = taxOf(x.a.id, x.gross);
      const net = x.gross - tax;
      if (net > 0.5) links.push({ source: i, target: spendingIdx, value: Math.round(net) });
      if (taxesIdx >= 0 && tax > 0.5)
        links.push({ source: i, target: taxesIdx, value: Math.round(tax) });
    });

    return { nodes, links };
  }, [outflowData, plan.accounts, colorById, summaryById, t]);

  const depletionYear = projection.depletionYear;
  const fullyFunded = depletionYear === null;

  // Total tax paid over the whole retirement under the current order.
  const lifetimeTax = useMemo(
    () => projection.years.reduce((s, y) => s + y.taxPaid, 0),
    [projection],
  );

  // Best / worst depletion AND lifetime tax across all orderings (≤ 7 accounts).
  const comparison = useMemo(() => {
    if (plan.accounts.length === 0 || plan.accounts.length > 7) return null;
    const metric = (ord: string[]): { deplete: number; tax: number } => {
      const p = project(
        buildProjectionInput(plan, rates, startYear, HORIZON_YEARS, ord),
        plan.scenario.active,
      );
      return {
        deplete: p.depletionYear ?? horizonEndYear + 1,
        tax: p.years.reduce((s, y) => s + y.taxPaid, 0),
      };
    };
    let best = -Infinity;
    let worst = Infinity;
    let minTax = Infinity;
    let maxTax = -Infinity;
    for (const perm of permutations(plan.accounts.map((a) => a.id))) {
      const m = metric(perm);
      if (m.deplete > best) best = m.deplete;
      if (m.deplete < worst) worst = m.deplete;
      if (m.tax < minTax) minTax = m.tax;
      if (m.tax > maxTax) maxTax = m.tax;
    }
    const current = metric(order);
    const cap = (n: number): number => Math.min(n, horizonEndYear);
    return {
      bestYear: cap(best),
      worstYear: cap(worst),
      currentIsBest: current.deplete >= best,
      currentIsWorst: current.deplete <= worst && best > worst,
      minTax,
      maxTax,
      currentIsLowestTax: current.tax <= minTax + 0.5,
    };
  }, [plan, rates, order, startYear, horizonEndYear]);

  const ranking: AccountRanking[] = summaries.map((s) => ({
    id: s.id,
    returnPct: s.returnPct,
    effectiveTaxRate: s.effectiveTaxRate,
  }));
  const presets = [
    {
      key: 'tax',
      title: t('withdrawal.presetTaxTitle'),
      desc: t('withdrawal.presetTaxDesc'),
      order: orderTaxOptimized(ranking),
    },
    {
      key: 'growth',
      title: t('withdrawal.presetGrowthTitle'),
      desc: t('withdrawal.presetGrowthDesc'),
      order: orderPreserveGrowth(ranking),
    },
    {
      key: 'risk',
      title: t('withdrawal.presetRiskTitle'),
      desc: t('withdrawal.presetRiskDesc'),
      order: orderRiskOnFirst(ranking),
    },
  ];

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    setWithdrawalOrder(plan.id, next);
  };

  const vsPill = comparison
    ? comparison.currentIsBest
      ? { label: t('withdrawal.bestOrderPill'), cls: 'is-funded' }
      : comparison.currentIsWorst
        ? { label: t('withdrawal.worstOrderPill'), cls: 'is-risk' }
        : { label: t('withdrawal.midOrderPill'), cls: '' }
    : null;

  const moneyLastsLabel = fullyFunded ? `${horizonEndYear}+` : String(depletionYear);
  const subLabel = fullyFunded
    ? currentAge > 0
      ? t('withdrawal.toAge', { age: currentAge + (horizonEndYear - startYear) })
      : t('withdrawal.beyondHorizon')
    : currentAge > 0 && depletionYear !== null
      ? t('withdrawal.atAge', { age: currentAge + (depletionYear - startYear) })
      : t('withdrawal.savingsRunOut');

  return (
    <Modal
      title={t('withdrawal.title')}
      onClose={onClose}
      xl
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('common.done')}
        </Button>
      }
    >
      {plan.accounts.length === 0 ? (
        <div className="state-box" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span>{t('withdrawal.needAccounts')}</span>
          <div>
            <Button variant="accent" onClick={() => openModal('accounts')}>
              {t('withdrawal.setupAccounts')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="contrib-summary wo-cards">
            <div className="contrib-summary__item">
              <span className="ov__sub">{t('withdrawal.moneyLastsUntil')}</span>
              <b style={{ color: fullyFunded ? 'var(--success)' : 'var(--amber)' }}>
                {moneyLastsLabel}
              </b>
              <span className="ov__sub">{subLabel}</span>
            </div>

            <div className="contrib-summary__item">
              <span className="ov__sub">{t('withdrawal.lifetimeTax')}</span>
              <b>{fmt.compact(lifetimeTax)}</b>
              {comparison?.currentIsLowestTax ? (
                <span className="ov__sub" style={{ color: 'var(--success)' }}>
                  {t('withdrawal.lowestTax')}
                </span>
              ) : comparison ? (
                <span className="ov__sub">
                  {t('withdrawal.taxRange', {
                    min: fmt.compact(comparison.minTax),
                    max: fmt.compact(comparison.maxTax),
                  })}
                </span>
              ) : null}
            </div>

            <div className="contrib-summary__item">
              <span className="ov__sub">{t('withdrawal.vsOtherTitle')}</span>
              {vsPill ? (
                <>
                  <span className={cn('wo-badge', vsPill.cls)}>{vsPill.label}</span>
                  <span className="ov__sub">
                    {t('withdrawal.bestWorst', {
                      best: comparison!.bestYear,
                      worst: comparison!.worstYear,
                    })}
                  </span>
                </>
              ) : (
                <b>—</b>
              )}
            </div>

            <div className="contrib-summary__item">
              <span className="ov__sub">{t('withdrawal.annualSpending')}</span>
              <b>{fmt.compact(annualSpending)}</b>
              <span className="ov__sub">
                {inflationOn
                  ? `${t('withdrawal.inflation')} · ${t('withdrawal.inflationRate', { rate: inflationPct })}`
                  : `${t('withdrawal.inflation')} ${t('withdrawal.inflationOff')}`}
              </span>
            </div>
          </div>

          <div className="wo-grid">
            <div className="wo-left">
              <div className="wo-section-label">{t('withdrawal.drawOrder')}</div>
              {order.map((id, i) => {
                const s = summaryById.get(id);
                if (!s) return null;
                const empty = emptiesYear[id];
                return (
                  <div className="wo-item" key={id} style={{ borderLeftColor: colorById.get(id) }}>
                    <span className="wo-rank">{i + 1}</span>
                    <div className="wo-item__body">
                      <div className="wo-item__top">
                        <span className="wo-item__name">{s.label}</span>
                        <span className="wo-tag tip-host" tabIndex={0}>
                          {taxBadge(s.effectiveTaxRate)}
                          <span className="tip-bubble" role="tooltip">
                            {t('withdrawal.taxedTip')}
                          </span>
                        </span>
                      </div>
                      <div className="wo-item__meta">
                        {t('withdrawal.metaLine', {
                          balance: fmt.compact(s.balance),
                          rate: s.returnPct.toFixed(0),
                        })}
                        {empty != null ? (
                          <span className="wo-empty">
                            {t('withdrawal.empties', { year: empty })}
                          </span>
                        ) : (
                          <span className="wo-never">{t('withdrawal.neverEmpties')}</span>
                        )}
                      </div>
                    </div>
                    <div className="wo-arrows">
                      <button
                        type="button"
                        aria-label={t('withdrawal.moveUp', { name: s.label })}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUpIcon size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={t('withdrawal.moveDown', { name: s.label })}
                        disabled={i === order.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDownIcon size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="wo-section-label" style={{ marginTop: 18 }}>
                {t('withdrawal.strategyPresets')}
              </div>
              {presets.map((p) => {
                const active = sameOrder(order, p.order);
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={cn('wo-preset', active && 'active')}
                    onClick={() => setWithdrawalOrder(plan.id, p.order)}
                  >
                    <div>
                      <div className="wo-preset__title">{p.title}</div>
                      <div className="wo-preset__desc">{p.desc}</div>
                    </div>
                    <span className="wo-preset__action">
                      {active ? t('withdrawal.active') : t('withdrawal.apply')}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                className="wo-preset"
                style={{ marginTop: 10 }}
                onClick={() => openModal('conversions')}
              >
                <div>
                  <div className="wo-preset__title">{t('withdrawal.conversionsTitle')}</div>
                  <div className="wo-preset__desc">{t('withdrawal.conversionsDesc')}</div>
                </div>
                <span className="wo-preset__action">{t('common.open')}</span>
              </button>
            </div>

            <div className="wo-right">
              <div className="wo-section-label">{t('withdrawal.balancesTitle')}</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                  <XAxis
                    dataKey="year"
                    tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                    stroke="var(--border)"
                    minTickGap={40}
                  />
                  <YAxis hide />
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
                  <Tooltip
                    content={
                      <ChartTooltip
                        formatter={(value: unknown, name: unknown) => [
                          fmt.format(Number(value)),
                          summaryById.get(String(name))?.label ?? String(name),
                        ]}
                      />
                    }
                  />
                  {plan.accounts.map((a) => (
                    <Area
                      key={a.id}
                      type="monotone"
                      dataKey={a.id}
                      stackId="1"
                      stroke={colorById.get(a.id)}
                      fill={colorById.get(a.id)}
                      fillOpacity={0.5}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>

              <div className="legend">
                {plan.accounts.map((a) => (
                  <span key={a.id}>
                    <i style={{ background: colorById.get(a.id) }} />
                    {a.name}
                  </span>
                ))}
              </div>

              <div className="wo-section-label" style={{ marginTop: 16 }}>
                {outflowView === 'flow'
                  ? t('withdrawal.outflowTitleFlow')
                  : t('withdrawal.outflowTitleYearly')}
              </div>

              <div
                className="seg-tabs"
                role="radiogroup"
                aria-label={t('withdrawal.outflowTitleYearly')}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={outflowView === 'yearly'}
                  className={`seg-tab ${outflowView === 'yearly' ? 'is-active' : ''}`}
                  onClick={() => setOutflowView('yearly')}
                >
                  {t('withdrawal.viewYearly')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={outflowView === 'flow'}
                  className={`seg-tab ${outflowView === 'flow' ? 'is-active' : ''}`}
                  onClick={() => setOutflowView('flow')}
                >
                  {t('withdrawal.viewFlow')}
                </button>
              </div>

              {outflowView === 'flow' ? (
                sankey.links.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <Sankey
                      data={sankey}
                      node={<SankeyNode />}
                      nodePadding={20}
                      nodeWidth={10}
                      linkCurvature={0.5}
                      link={<SankeyLink />}
                      margin={{ top: 8, right: 130, bottom: 8, left: 130 }}
                    >
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const link = payload[0]?.payload as
                            | { source?: SankeyNodeDatum; target?: SankeyNodeDatum; value?: number }
                            | undefined;
                          if (!link?.source || !link?.target) return null;
                          return (
                            <div className="mc-fan-tip">
                              <div className="mc-fan-tip__row">
                                <i style={{ background: link.source.color }} />
                                <span>
                                  {link.source.name} → {link.target.name}
                                </span>
                                <b>{fmt.format(link.value ?? 0)}</b>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </Sankey>
                  </ResponsiveContainer>
                ) : (
                  <p className="field__hint">{t('withdrawal.outflowEmpty')}</p>
                )
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={outflowData} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                    <XAxis
                      dataKey="year"
                      tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                      stroke="var(--border)"
                      minTickGap={40}
                    />
                    <YAxis hide />
                    <ReferenceLine
                      x={retirementYear}
                      stroke="var(--text-dim)"
                      strokeDasharray="4 4"
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      content={
                        <ChartTooltip
                          formatter={(value: unknown, name: unknown) => [
                            fmt.format(Number(value)),
                            summaryById.get(String(name))?.label ?? String(name),
                          ]}
                        />
                      }
                    />
                    {plan.accounts.map((a) => (
                      <Bar
                        key={a.id}
                        dataKey={a.id}
                        stackId="outflow"
                        fill={colorById.get(a.id)}
                        fillOpacity={0.85}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
};
