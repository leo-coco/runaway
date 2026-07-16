import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import {
  ExpenseIncomeFields,
  draftFromItem,
  type ExpenseIncomeDraft,
} from '@/features/settings/ExpenseIncomeFields';
import type { ExpenseIncome } from '@/domain/expenseIncome';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  /** Present = editing this item; absent = creating a new one. */
  initial?: ExpenseIncome;
  onSave: (data: Omit<ExpenseIncome, 'id'>) => void;
  onClose: () => void;
}

const blankDraft = (currentYear: number): ExpenseIncomeDraft => ({
  name: '',
  amount: 20_000,
  year: currentYear + 5,
  kind: 'expense',
  category: 'general',
  inflate: true,
  frequency: 'once',
  endYear: currentYear + 5,
  taxable: true,
});

export const AddExpenseIncomeDialog = ({ plan, initial, onSave, onClose }: Props) => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const currentAge = plan.settings.currentAge;
  const maxYear = lifeExpectancyYear(currentAge, currentYear, plan.settings.lifeExpectancyAge);

  const [draft, setDraft] = useState<ExpenseIncomeDraft>(() =>
    initial ? draftFromItem(initial) : blankDraft(currentYear),
  );
  const [attempted, setAttempted] = useState(false);

  const nameInvalid = draft.name.trim().length === 0;
  const amountInvalid = !(draft.amount > 0);
  const canSave = !nameInvalid && !amountInvalid;

  const handleSave = () => {
    if (!canSave) {
      setAttempted(true);
      return;
    }
    onSave({
      name: draft.name.trim(),
      amount: draft.amount,
      year: draft.year,
      kind: draft.kind,
      category: draft.category === 'general' ? undefined : draft.category,
      inflate: draft.inflate,
      frequency: draft.frequency,
      endYear: draft.frequency === 'recurring' ? draft.endYear : undefined,
      taxable: draft.kind === 'income' ? draft.taxable : undefined,
    });
    onClose();
  };

  return (
    <Modal
      title={t(initial ? 'expensesIncomes.editTitle' : 'expensesIncomes.addTitle')}
      onClose={onClose}
      className="flow-editor-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSave} disabled={attempted && !canSave}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <ExpenseIncomeFields
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        currentYear={currentYear}
        maxYear={maxYear}
        currentAge={currentAge}
        currency={plan.currency}
        inflationPct={plan.settings.inflationPct}
        nameError={attempted && nameInvalid ? t('expensesIncomes.nameRequired') : undefined}
        amountError={attempted && amountInvalid ? t('expensesIncomes.amountRequired') : undefined}
      />
    </Modal>
  );
};
