import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createSandboxPlan } from '@/store/seed';
import { QuickStart } from './QuickStart';

const storeState = vi.hoisted(() => ({
  setPlanCurrency: vi.fn(),
  saveAccountsTaxConfig: vi.fn(),
  updateSettings: vi.fn(),
  addHolding: vi.fn(),
  renamePlan: vi.fn(),
  openPaywall: vi.fn(),
}));
const entitlementState = vi.hoisted(() => ({ maxAccounts: 1 as number | null }));
const planContext = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));
vi.mock('@/hooks/useEntitlements', () => ({
  useLimit: () => entitlementState.maxAccounts,
}));
vi.mock('@/features/portfolio/PlanLayout', () => ({
  usePlanContext: () => planContext.value,
}));
vi.mock('@/hooks/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({ compact: (value: number) => String(value) }),
}));
vi.mock('./useSaveSandboxPlan', () => ({
  useSaveSandboxPlan: () => ({
    save: vi.fn(),
    dialogOpen: false,
    closeDialog: vi.fn(),
    goToAccount: vi.fn(),
  }),
}));

describe('QuickStart account limit', () => {
  beforeEach(() => {
    entitlementState.maxAccounts = 1;
    storeState.openPaywall.mockReset();
    const plan = createSandboxPlan('en');
    planContext.value = {
      plan,
      projection: {
        active: {
          years: [{ year: plan.settings.retirementYear, openingBalance: 0 }],
          depletionYear: null,
        },
      },
    };
  });

  afterEach(cleanup);

  it('silently greys the remaining presets once the dynamic limit is reached', () => {
    render(<QuickStart onExit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const selected = screen.getByRole('button', { name: '401(k) / IRA' });
    const locked = screen.getByRole('button', { name: 'Traditional IRA' });

    fireEvent.click(selected);

    expect(selected).toHaveClass('is-selected');
    expect(selected).not.toBeDisabled();
    expect(locked).toBeDisabled();
    expect(locked).toHaveClass('is-locked');
    expect(storeState.openPaywall).not.toHaveBeenCalled();
  });

  it('uses the shared depletion gradient when the projected balance runs out', () => {
    (
      planContext.value as {
        projection: { active: { depletionYear: number | null } };
      }
    ).projection.active.depletionYear = 2070;

    const { container } = render(<QuickStart onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'See my projection' }));

    const depletionTitle = screen.getByText('Savings depletion');
    const depletionCard = depletionTitle.closest('.ov');

    expect(depletionCard).toHaveClass('hero__card--depletion');
    expect(container.querySelector('.ov.hero__card--depletion')).not.toBeNull();
  });
});
