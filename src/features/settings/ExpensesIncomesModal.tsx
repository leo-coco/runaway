import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PlusIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { useAppStore } from '@/store';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { ageInYear, lifeExpectancyYear } from '@/domain/retirementSettings';
import { cn } from '@/lib/cn';
import { EXPENSE_COLOR, INCOME_COLOR } from '@/features/settings/ExpenseIncomeFields';
import { AddExpenseIncomeDialog } from '@/features/settings/AddExpenseIncomeDialog';
import type { CurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import type { ExpenseIncome } from '@/domain/expenseIncome';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  onClose: () => void;
}

/** A flow paired with its inflation-projected (nominal) amount in its target
 *  year — and, for a recurring flow, the projected amount in its end year too. */
interface FlowRow {
  item: ExpenseIncome;
  nominal: number;
  nominalEnd: number | undefined;
}

/**
 * A compact SVG bar chart of every flow along a year+amount axis. A one-time
 * flow is a single bar at its year; a recurring flow is a horizontal band
 * spanning its start–end range, dashed to stand apart from one-time bars.
 * Expenses drop below the zero line (red), inflows rise above it (green).
 * Clicking a bar/band highlights and scrolls to its card.
 */
const FlowsTimeline = ({
  rows,
  startYear,
  endYear,
  fmt,
  selectedId,
  onSelect,
}: {
  rows: readonly FlowRow[];
  startYear: number;
  endYear: number;
  fmt: CurrencyFormatter;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const W = 1000;
  const H = 190;
  const padLeft = 66; // room for the amount (Y) axis labels
  const padRight = 28;
  const zeroY = 100; // the value = 0 baseline
  const axisY = H - 8; // year labels sit here
  const barW = 20;
  const maxBarH = Math.min(zeroY - 24, axisY - 20 - zeroY); // symmetric room up/down
  const span = Math.max(1, endYear - startYear);
  const x = (year: number) => padLeft + ((year - startYear) / span) * (W - padLeft - padRight);

  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.nominal)));
  const yFor = (v: number) => zeroY - (v / maxAbs) * maxBarH;
  const barHeight = (amount: number) => Math.max(6, (Math.abs(amount) / maxAbs) * maxBarH);

  // Six evenly spaced year ticks along the X axis…
  const ticks = Array.from({ length: 7 }, (_, i) => Math.round(startYear + (span * i) / 6));
  // …and symmetric amount ticks for the Y axis (income above 0, expense below).
  const yTicks = [1, 0.5, 0, -0.5, -1].map((f) => f * maxAbs);
  const yLabel = (v: number) => (v > 0 ? `+${fmt.compact(v)}` : fmt.compact(v));

  const selectHandlers = (id: string) => ({
    onClick: () => onSelect(id),
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') onSelect(id);
    },
  });

  return (
    <div className="flow-timeline">
      <div className="flow-timeline__head">
        <span className="wo-section-label">{t('expensesIncomes.timelineTitle')}</span>
        <span className="flow-timeline__legend">
          <span className="flow-legend flow-legend--expense">
            {t('expensesIncomes.legendExpense')}
          </span>
          <span className="flow-legend flow-legend--income">
            {t('expensesIncomes.legendIncome')}
          </span>
        </span>
      </div>
      <svg className="flow-timeline__svg" viewBox={`0 0 ${W} ${H}`} role="img">
        {/* Y axis: amount gridlines + labels */}
        {yTicks.map((v) => {
          const gy = yFor(v);
          return (
            <g key={v}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={gy}
                y2={gy}
                stroke="var(--border)"
                strokeWidth={1}
                opacity={v === 0 ? 1 : 0.35}
                strokeDasharray={v === 0 ? undefined : '3 4'}
              />
              <text x={padLeft - 10} y={gy + 4} className="flow-timeline__ytick" textAnchor="end">
                {yLabel(v)}
              </text>
            </g>
          );
        })}
        {/* X axis: year ticks */}
        {ticks.map((year) => (
          <text
            key={year}
            x={x(year)}
            y={axisY}
            className="flow-timeline__tick"
            textAnchor="middle"
          >
            {year}
          </text>
        ))}
        {rows.map((r) => {
          const isIncome = r.item.kind === 'income';
          const color = isIncome ? INCOME_COLOR : EXPENSE_COLOR;
          const isRecurring = r.item.frequency === 'recurring';
          const h = barHeight(r.nominal);
          const barY = isIncome ? zeroY - h : zeroY;
          const active = selectedId === r.item.id;

          if (isRecurring) {
            const endYr = r.item.endYear ?? r.item.year;
            const x1 = x(r.item.year);
            const x2 = Math.max(x1 + barW, x(endYr));
            const labelX = (x1 + x2) / 2;
            const labelY = isIncome ? barY - 8 : barY + h + 18;
            const label = `${isIncome ? '+' : '-'}${fmt.compact(Math.abs(r.nominal))}/yr · ${r.item.year}–${endYr}`;
            return (
              <g
                key={r.item.id}
                className={cn('flow-band', active && 'is-active')}
                {...selectHandlers(r.item.id)}
              >
                <rect
                  x={x1}
                  y={barY}
                  width={x2 - x1}
                  height={h}
                  rx={6}
                  fill={color}
                  fillOpacity={active ? 0.5 : 0.3}
                  stroke={color}
                  strokeWidth={active ? 2 : 1.5}
                  strokeDasharray="5 3"
                />
                <text
                  x={labelX}
                  y={labelY}
                  fill={color}
                  textAnchor="middle"
                  className="flow-bar__label"
                >
                  {label}
                </text>
              </g>
            );
          }

          const cx = x(r.item.year);
          const label = `${isIncome ? '+' : '-'}${fmt.compact(Math.abs(r.nominal))}`;
          const labelY = isIncome ? barY - 8 : barY + h + 18;
          return (
            <g
              key={r.item.id}
              className={cn('flow-bar', active && 'is-active')}
              {...selectHandlers(r.item.id)}
            >
              <rect
                x={cx - barW / 2}
                y={barY}
                width={barW}
                height={h}
                rx={4}
                fill={color}
                fillOpacity={active ? 0.95 : 0.6}
                stroke={color}
                strokeWidth={active ? 2 : 0}
              />
              <text x={cx} y={labelY} fill={color} textAnchor="middle" className="flow-bar__label">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * A single flow's read-only detail row — name, amount, year(s), projection
 * and badges — with edit/delete actions. All editing happens in the
 * AddExpenseIncomeDialog; this card never mutates the store directly.
 */
const FlowCard = ({
  item,
  nominal,
  nominalEnd,
  fmt,
  currentYear,
  currentAge,
  selected,
  cardRef,
  onEdit,
  onRemove,
}: {
  item: ExpenseIncome;
  nominal: number;
  nominalEnd: number | undefined;
  fmt: CurrencyFormatter;
  currentYear: number;
  currentAge: number;
  selected: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation();
  const isIncome = item.kind === 'income';
  const isRecurring = item.frequency === 'recurring';
  const endYr = item.endYear ?? item.year;
  const age = ageInYear(currentAge, currentYear, item.year);

  return (
    <div
      ref={cardRef}
      className={cn(
        'flow-card',
        'flow-card--readonly',
        isIncome ? 'flow-card--income' : 'flow-card--expense',
        selected && 'is-highlight',
      )}
    >
      <div className="flow-card__top">
        <span className={cn('flow-kind-badge', isIncome ? 'is-income' : 'is-expense')}>
          {isIncome ? '↑' : '↓'} {t(isIncome ? 'expensesIncomes.typeIncome' : 'expensesIncomes.typeExpense')}
        </span>
        <div className="flow-card__top-right">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('expensesIncomes.editAria', { name: item.name || t('expensesIncomes.name') })}
            onClick={onEdit}
          >
            <PencilIcon size={16} />
          </Button>
          <Button
            variant="danger"
            size="sm"
            aria-label={t('expensesIncomes.removeAria', { name: item.name || t('expensesIncomes.name') })}
            onClick={onRemove}
          >
            <TrashIcon size={16} />
          </Button>
        </div>
      </div>

      <div className="flow-card__name flow-card__name--readonly">
        {item.name || t(isIncome ? 'expensesIncomes.namePlaceholderIncome' : 'expensesIncomes.namePlaceholderExpense')}
      </div>

      <div className="flow-card__detail">
        <span className="flow-card__amount">
          {fmt.compact(item.amount)}
          {isRecurring && t('common.perYear')}
        </span>
        <span className="ov__sub">
          {isRecurring
            ? `${item.year}–${endYr}`
            : `${item.year}${age !== null ? ` · ${t('expensesIncomes.ageParen', { age })}` : ''}`}
        </span>
      </div>

      <span className="flow-projection">
        {isRecurring
          ? t('expensesIncomes.projectionRecurring', {
              from: fmt.compact(item.amount),
              toStart: fmt.compact(nominal),
              startYear: item.year,
              toEnd: fmt.compact(nominalEnd ?? nominal),
              endYear: endYr,
            })
          : t('expensesIncomes.projection', {
              from: fmt.compact(item.amount),
              to: fmt.compact(nominal),
              year: item.year,
            })}
      </span>

      {((item.inflate ?? true) || (isIncome && !(item.taxable ?? true))) && (
        <div className="flow-card__badges">
          {(item.inflate ?? true) && (
            <span className="flow-badge">{t('expensesIncomes.inflationLabel', { year: endYr })}</span>
          )}
          {isIncome && !(item.taxable ?? true) && (
            <span className="flow-badge">{t('expensesIncomes.taxableLabel')}</span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Manage cashflows tied to specific year(s) — a property purchase or sale, a
 * big one-time expense, an inheritance received, or a recurring cost like
 * tuition. Each flow is a read-only detail card with edit/delete actions;
 * creating or editing a flow opens a dedicated dialog with validation, and a
 * timeline gives the whole picture at a glance.
 */
export const ExpensesIncomesModal = ({ plan, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const addExpenseIncome = useAppStore((s) => s.addExpenseIncome);
  const updateExpenseIncome = useAppStore((s) => s.updateExpenseIncome);
  const removeExpenseIncome = useAppStore((s) => s.removeExpenseIncome);

  const currentYear = new Date().getFullYear();
  const currentAge = plan.settings.currentAge;
  const maxYear = lifeExpectancyYear(currentAge, currentYear, plan.settings.lifeExpectancyAge);
  const items = useMemo(() => plan.settings.expensesIncomes ?? [], [plan.settings.expensesIncomes]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ExpenseIncome | 'new' | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const inflationFactorFor = (year: number): number =>
    Math.pow(1 + plan.settings.inflationPct / 100, year - currentYear);

  // Each flow with its inflation-projected (nominal) amount, plus the net total
  // over the period — a recurring flow's contribution sums every year in range.
  const rows = useMemo<FlowRow[]>(
    () =>
      items.map((item) => {
        const factor = (item.inflate ?? true) ? inflationFactorFor(item.year) : 1;
        const nominal = item.amount * factor;
        let nominalEnd: number | undefined;
        if (item.frequency === 'recurring') {
          const endYear = item.endYear ?? item.year;
          const factorEnd = (item.inflate ?? true) ? inflationFactorFor(endYear) : 1;
          nominalEnd = item.amount * factorEnd;
        }
        return { item, nominal, nominalEnd };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, plan.settings.inflationPct, currentYear],
  );

  const net = rows.reduce((sum, r) => {
    const { item } = r;
    let total = r.nominal;
    if (item.frequency === 'recurring') {
      const endYear = item.endYear ?? item.year;
      total = 0;
      for (let y = item.year; y <= endYear; y += 1) {
        total += item.amount * ((item.inflate ?? true) ? inflationFactorFor(y) : 1);
      }
    }
    return sum + (item.kind === 'income' ? total : -total);
  }, 0);
  const endYear = Math.max(
    maxYear,
    currentYear + 8,
    ...items.map((i) => (i.frequency === 'recurring' ? (i.endYear ?? i.year) : i.year)),
  );

  const selectFlow = (id: string) => {
    setSelectedId(id);
    cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleDialogSave = (data: Omit<ExpenseIncome, 'id'>) => {
    if (editing === 'new') addExpenseIncome(plan.id, data);
    else if (editing) updateExpenseIncome(plan.id, editing.id, data);
  };

  return (
    <>
      <Modal
        title={t('expensesIncomes.title')}
        description={t('expensesIncomes.desc')}
        onClose={onClose}
        wide
        headerActions={
          <Button variant="accent" onClick={() => setEditing('new')}>
            <PlusIcon /> {t('expensesIncomes.add')}
          </Button>
        }
        footer={
          <>
            <span
              className={cn('flow-net', net < 0 ? 'is-neg' : net > 0 ? 'is-pos' : undefined)}
              style={{ marginRight: 'auto' }}
            >
              {t('expensesIncomes.netTotal', { amount: fmt.compact(net) })}
            </span>
            <Button variant="primary" onClick={onClose}>
              {t('common.done')}
            </Button>
          </>
        }
      >
        {rows.length > 0 && (
          <FlowsTimeline
            rows={rows}
            startYear={currentYear}
            endYear={endYear}
            fmt={fmt}
            selectedId={selectedId}
            onSelect={selectFlow}
          />
        )}

        {items.length === 0 ? (
          <div className="state-box">{t('expensesIncomes.empty')}</div>
        ) : (
          <div className="flow-cards">
            {rows.map(({ item, nominal, nominalEnd }) => (
              <FlowCard
                key={item.id}
                item={item}
                nominal={nominal}
                nominalEnd={nominalEnd}
                fmt={fmt}
                currentYear={currentYear}
                currentAge={currentAge}
                selected={selectedId === item.id}
                cardRef={(el) => {
                  cardRefs.current[item.id] = el;
                }}
                onEdit={() => setEditing(item)}
                onRemove={() => removeExpenseIncome(plan.id, item.id)}
              />
            ))}
          </div>
        )}
      </Modal>

      {editing !== null && (
        <AddExpenseIncomeDialog
          plan={plan}
          initial={editing === 'new' ? undefined : editing}
          onSave={handleDialogSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
