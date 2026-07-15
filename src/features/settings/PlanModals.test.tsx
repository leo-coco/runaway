import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppModeProvider } from '@/providers/AppModeContext';
import { createSandboxPlan } from '@/store/seed';
import { PlanModals } from './PlanModals';

const storeState = vi.hoisted(() => ({
  activeModal: 'addAsset' as const,
  closeModal: vi.fn(),
  renamePlan: vi.fn(),
  updateSettings: vi.fn(),
  updateScenario: vi.fn(),
  updateHolding: vi.fn(),
  addHolding: vi.fn(),
}));

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('./AddAssetDialog', () => ({
  AddAssetDialog: () => <div role="dialog">Add asset dialog</div>,
}));

const renderModals = (sandbox: boolean) =>
  render(
    <AppModeProvider sandbox={sandbox}>
      <PlanModals plan={createSandboxPlan('en')} retirementValue={150_000} rates={undefined} />
    </AppModeProvider>,
  );

describe('PlanModals Sandbox restrictions', () => {
  it('does not render the add-asset dialog in Sandbox even if requested indirectly', () => {
    renderModals(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still renders the add-asset dialog outside Sandbox', () => {
    renderModals(false);
    expect(screen.getByRole('dialog')).toHaveTextContent('Add asset dialog');
  });
});
