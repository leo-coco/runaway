import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PlusIcon, PencilIcon, TrashIcon, TrendingUpIcon } from '@/components/icons';
import { ExpenseCategoryIcon } from '@/components/ExpenseCategoryIcon';
import { useAppStore } from '@/store';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { cn } from '@/lib/cn';
import { AddExpenseIncomeDialog } from '@/features/settings/AddExpenseIncomeDialog';
import type { ExpenseIncome } from '@/domain/expenseIncome';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  onClose: () => void;
}

const compactPlainFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const formatCompactPlain = (amount: number): string => compactPlainFmt.format(amount);

const FlowRow = ({
  item,
  currency,
  onEdit,
  onRemove,
}: {
  item: ExpenseIncome;
  currency: string;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation();
  const isIncome = item.kind === 'income';
  const isRecurring = item.frequency === 'recurring';
  const endYear = item.endYear ?? item.year;
  const category = item.category ?? 'general';
  const name =
    item.name ||
    t(
      isIncome ? 'expensesIncomes.namePlaceholderIncome' : 'expensesIncomes.namePlaceholderExpense',
    );
  const inflationLabel = t('expensesIncomes.inflationLabel', { year: endYear });

  return (
    <div className="flow-table__row" role="row">
      <div className="flow-table__cell flow-table__flow" role="cell">
        <span className="flow-table__category-icon">
          <ExpenseCategoryIcon category={category} size={15} />
        </span>
        <span
          className="flow-table__flow-label"
          title={`${name} (${t(`expensesIncomes.categories.${category}`)})`}
        >
          <strong>{name}</strong> <span>({t(`expensesIncomes.categories.${category}`)})</span>
        </span>
      </div>

      <div className="flow-table__cell" role="cell" data-label={t('expensesIncomes.columnType')}>
        <span className={cn('flow-kind-badge', isIncome ? 'is-income' : 'is-expense')}>
          {isIncome ? '↑' : '↓'}{' '}
          {t(isIncome ? 'expensesIncomes.typeIncome' : 'expensesIncomes.typeExpense')}
        </span>
      </div>

      <div
        className="flow-table__cell flow-table__frequency"
        role="cell"
        data-label={t('expensesIncomes.columnFrequency')}
      >
        <span className="flow-frequency-badge">
          {t(isRecurring ? 'expensesIncomes.frequencyRecurring' : 'expensesIncomes.frequencyOnce')}
        </span>
      </div>

      <div
        className="flow-table__cell flow-table__amount"
        role="cell"
        data-label={t('expensesIncomes.columnAmount', { currency })}
      >
        <span className={cn(isIncome ? 'is-income' : 'is-expense')}>
          {formatCompactPlain(item.amount)}
          {isRecurring && t('common.perYear')}
        </span>
        {(item.inflate ?? true) && (
          <span className="flow-inflation-pill" tabIndex={0} aria-label={inflationLabel}>
            <TrendingUpIcon size={13} />
            <span className="flow-inflation-tooltip" role="tooltip">
              {inflationLabel}
            </span>
          </span>
        )}
      </div>

      <div
        className="flow-table__cell flow-table__period"
        role="cell"
        data-label={t('expensesIncomes.columnPeriod')}
      >
        {isRecurring ? `${item.year}–${endYear}` : item.year}
      </div>

      <div className="flow-table__cell flow-table__actions" role="cell">
        <Button
          variant="ghost"
          size="sm"
          className="icon-action"
          aria-label={t('expensesIncomes.editAria', { name })}
          onClick={onEdit}
        >
          <PencilIcon size={14} />
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="icon-action"
          aria-label={t('expensesIncomes.removeAria', { name })}
          onClick={onRemove}
        >
          <TrashIcon size={14} />
        </Button>
      </div>
    </div>
  );
};

export const ExpensesIncomesModal = ({ plan, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const addExpenseIncome = useAppStore((s) => s.addExpenseIncome);
  const updateExpenseIncome = useAppStore((s) => s.updateExpenseIncome);
  const removeExpenseIncome = useAppStore((s) => s.removeExpenseIncome);
  const currentYear = new Date().getFullYear();
  const items = useMemo(() => plan.settings.expensesIncomes ?? [], [plan.settings.expensesIncomes]);
  const [editing, setEditing] = useState<ExpenseIncome | 'new' | null>(null);

  const inflationFactorFor = (year: number): number =>
    Math.pow(1 + plan.settings.inflationPct / 100, year - currentYear);
  const totals = items.reduce(
    (summary, item) => {
      const endYear = item.frequency === 'recurring' ? (item.endYear ?? item.year) : item.year;
      let total = 0;
      for (let year = item.year; year <= endYear; year += 1) {
        total += item.amount * ((item.inflate ?? true) ? inflationFactorFor(year) : 1);
      }
      summary[item.kind] += total;
      return summary;
    },
    { income: 0, expense: 0 },
  );
  const net = totals.income - totals.expense;

  const handleDialogSave = (data: Omit<ExpenseIncome, 'id'>) => {
    if (editing === 'new') addExpenseIncome(plan.id, data);
    else if (editing) updateExpenseIncome(plan.id, editing.id, data);
  };

  return (
    <>
      <Modal
        title={t('expensesIncomes.title')}
        onClose={onClose}
        wide
        className="modal--flows"
        footer={
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        }
      >
        <div className="flows-modal-content">
          <div
            className="contrib-summary contrib-summary--triple"
            aria-label={t('expensesIncomes.summaryLabel')}
          >
            <div className="contrib-summary__item">
              <span className="ov__sub">
                {t('expensesIncomes.summaryIncome', { currency: plan.currency })}
              </span>
              <b className="is-pos">+{fmt.format(totals.income)}</b>
            </div>
            <div className="contrib-summary__item">
              <span className="ov__sub">
                {t('expensesIncomes.summaryExpense', { currency: plan.currency })}
              </span>
              <b className="is-neg">−{fmt.format(totals.expense)}</b>
            </div>
            <div className="contrib-summary__item">
              <span className="ov__sub">
                {t('expensesIncomes.summaryNet', { currency: plan.currency })}
              </span>
              <b className={cn(net < 0 ? 'is-neg' : net > 0 ? 'is-pos' : undefined)}>
                {net > 0 ? '+' : net < 0 ? '−' : ''}
                {fmt.format(Math.abs(net))}
              </b>
            </div>
          </div>

          <section className="flow-list-section" aria-label={t('expensesIncomes.listTitle')}>
            <div className="flow-list__head">
              <h3 className="flow-list__title">{t('expensesIncomes.listTitle')}</h3>
              <Button
                variant="accent"
                className="flow-list__add-button"
                onClick={() => setEditing('new')}
              >
                <PlusIcon size={15} /> {t('expensesIncomes.add')}
              </Button>
            </div>

            <div className="flow-list">
              {items.length === 0 ? (
                <div className="state-box flow-list__empty">{t('expensesIncomes.empty')}</div>
              ) : (
                <div
                  className="flow-table"
                  role="table"
                  aria-label={t('expensesIncomes.listTitle')}
                >
                  <div className="flow-table__header" role="row">
                    <span role="columnheader">{t('expensesIncomes.columnFlow')}</span>
                    <span role="columnheader">{t('expensesIncomes.columnType')}</span>
                    <span role="columnheader">{t('expensesIncomes.columnFrequency')}</span>
                    <span role="columnheader">
                      {t('expensesIncomes.columnAmount', { currency: plan.currency })}
                    </span>
                    <span role="columnheader">{t('expensesIncomes.columnPeriod')}</span>
                    <span role="columnheader" className="flow-table__action-heading">
                      {t('common.action')}
                    </span>
                  </div>
                  <div role="rowgroup">
                    {items.map((item) => (
                      <FlowRow
                        key={item.id}
                        item={item}
                        currency={plan.currency}
                        onEdit={() => setEditing(item)}
                        onRemove={() => removeExpenseIncome(plan.id, item.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
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
