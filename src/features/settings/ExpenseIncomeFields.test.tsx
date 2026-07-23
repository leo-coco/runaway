import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { draftFromItem, ExpenseIncomeFields, type ExpenseIncomeDraft } from './ExpenseIncomeFields';

const currentYear = new Date().getFullYear();

const pensionIncome: ExpenseIncomeDraft = {
  name: 'Public pension',
  amount: 20_000,
  year: currentYear + 5,
  kind: 'income',
  category: 'pension',
  inflate: true,
  frequency: 'recurring',
  endYear: currentYear + 20,
  taxable: true,
};

const renderFields = (
  draft: ExpenseIncomeDraft,
  onChange: (patch: Partial<ExpenseIncomeDraft>) => void = () => undefined,
) =>
  render(
    <ExpenseIncomeFields
      draft={draft}
      onChange={onChange}
      currentYear={currentYear}
      maxYear={currentYear + 50}
      currentAge={40}
      currency="USD"
      inflationPct={2}
    />,
  );

describe('ExpenseIncomeFields pension information', () => {
  it('shows the three official sources for pension income', () => {
    renderFields(pensionIncome);

    expect(screen.getByLabelText('Official pension calculators')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /United States/ })).toHaveAttribute(
      'href',
      'https://www.ssa.gov/prepare/get-benefits-estimate',
    );
    expect(screen.getByRole('link', { name: /Canada/ })).toHaveAttribute(
      'href',
      'https://www.canada.ca/en/services/benefits/publicpensions/cpp/retirement-income-calculator.html',
    );
    expect(screen.getByRole('link', { name: /France/ })).toHaveAttribute(
      'href',
      'https://www.info-retraite.fr/portail-info/sites/PortailInformationnel/home/mes-droits-a-la-retraite/age-et-montant-de-ma-retraite/en-synthese-1/quel-sera-le-montant-de-ma-ret-1.html',
    );
  });

  it('does not show the sources for an expense or another income category', () => {
    const { rerender } = renderFields({ ...pensionIncome, kind: 'expense' });

    expect(screen.queryByLabelText('Official pension calculators')).not.toBeInTheDocument();

    rerender(
      <ExpenseIncomeFields
        draft={{ ...pensionIncome, category: 'salary' }}
        onChange={() => undefined}
        currentYear={currentYear}
        maxYear={currentYear + 50}
        currentAge={40}
        currency="USD"
        inflationPct={2}
      />,
    );
    expect(screen.queryByLabelText('Official pension calculators')).not.toBeInTheDocument();
  });
});

describe('ExpenseIncomeFields categories by flow kind', () => {
  it('offers only expense categories for an expense', () => {
    renderFields({ ...pensionIncome, kind: 'expense', category: 'general' });

    expect(screen.getByRole('option', { name: 'Travel' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Other' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Retirement / pension' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Salary / compensation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rental income' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Taxes / legal fees' })).not.toBeInTheDocument();
  });

  it('offers only income categories for income', () => {
    renderFields(pensionIncome);

    expect(screen.getByRole('option', { name: 'Retirement / pension' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Salary / compensation' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Other' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rental income' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Travel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Loan / debt repayment' })).not.toBeInTheDocument();
  });

  it('resets an incompatible category to general when switching kind', () => {
    const onChange = vi.fn();
    renderFields(pensionIncome, onChange);

    fireEvent.click(screen.getByRole('tab', { name: /Expense/ }));

    expect(onChange).toHaveBeenCalledWith({ kind: 'expense', category: 'general' });
  });

  it('normalizes an incompatible category when editing legacy data', () => {
    expect(
      draftFromItem({
        id: 'legacy',
        name: 'Legacy pension expense',
        amount: 1_000,
        year: currentYear + 1,
        kind: 'expense',
        category: 'pension',
      }).category,
    ).toBe('general');
  });
});
