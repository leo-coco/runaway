import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createSandboxPlan } from '@/store/seed';
import { AccountsModal } from './AccountsModal';

const storeState = vi.hoisted(() => ({
  saveAccountsTaxConfig: vi.fn(),
  openPaywall: vi.fn(),
}));

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@/hooks/useEntitlements', () => ({
  useLimit: () => 10,
}));

const renderModal = (onClose = vi.fn()) => {
  const plan = createSandboxPlan('en');
  render(<AccountsModal plan={plan} rates={undefined} onClose={onClose} />);
  return { plan, onClose };
};

describe('AccountsModal transactional editing', () => {
  beforeEach(() => {
    storeState.saveAccountsTaxConfig.mockReset();
    storeState.openPaywall.mockReset();
  });

  afterEach(cleanup);

  it('discards the local draft when cancelled', () => {
    const { onClose } = renderModal();

    fireEvent.change(screen.getByLabelText('Tax residence'), { target: { value: 'FR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(storeState.saveAccountsTaxConfig).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('commits the complete draft only when Save Changes is clicked', () => {
    const { plan, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText('Tax residence'), { target: { value: 'FR' } });
    expect(storeState.saveAccountsTaxConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(storeState.saveAccountsTaxConfig).toHaveBeenCalledOnce();
    expect(storeState.saveAccountsTaxConfig).toHaveBeenCalledWith(
      plan.id,
      expect.objectContaining({ residenceCountry: 'FR', accounts: plan.accounts }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
