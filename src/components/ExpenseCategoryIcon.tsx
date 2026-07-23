import { RUNWAY_ICONS, type RunwayIconName } from '@/components/icons';
import type { ExpenseCategory } from '@/domain/expenseIncome';

/** Shared mapping so a category keeps the same icon in forms, tables and the runway. */
export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, RunwayIconName> = {
  general: 'wallet',
  other: 'dot',
  vehicle: 'car',
  travel: 'plane',
  education: 'graduation',
  health: 'heart',
  wedding: 'ring',
  gift: 'gift',
  home: 'home',
  insurance: 'shield',
  relocation: 'globe',
  family: 'family',
  renovation: 'tools',
  business: 'briefcase',
  pension: 'umbrella',
  debt: 'credit-card',
  taxLegal: 'tax',
  salary: 'paycheck',
  rentalIncome: 'key',
};

export const ExpenseCategoryIcon = ({
  category = 'general',
  size = 16,
  className,
}: {
  category?: ExpenseCategory;
  size?: number;
  className?: string;
}) => {
  const Icon = RUNWAY_ICONS[EXPENSE_CATEGORY_ICONS[category]];
  return <Icon size={size} className={className} aria-hidden="true" />;
};
