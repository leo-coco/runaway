import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createSandboxPlan } from '@/store/seed';
import { GoalSeekModal } from './GoalSeekModal';

const storeState = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  updateHolding: vi.fn(),
}));

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

const plan = createSandboxPlan('en');
const [voo, btc] = plan.holdings;

const renderModal = () => {
  const onClose = vi.fn();
  render(<GoalSeekModal plan={plan} rates={undefined} onClose={onClose} />);
  return { onClose };
};

const openConfirmation = async () => {
  const applyButton = await screen.findByRole('button', { name: 'Apply mix' }, { timeout: 5000 });
  fireEvent.click(applyButton);
  return screen.findByRole('heading', { name: 'Confirm changes' });
};

describe('GoalSeekModal apply flow', () => {
  it('opens a confirmation step instead of applying immediately', async () => {
    renderModal();
    await openConfirmation();
    expect(storeState.updateSettings).not.toHaveBeenCalled();
    expect(storeState.updateHolding).not.toHaveBeenCalled();
  });

  it('Cancel returns to the editable view without committing anything', async () => {
    renderModal();
    await openConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('slider', { name: 'Cut target retirement income' }),
    ).toBeInTheDocument();
    expect(storeState.updateSettings).not.toHaveBeenCalled();
    expect(storeState.updateHolding).not.toHaveBeenCalled();
  });

  it('committing a spending cut only updates settings, never a holding', async () => {
    renderModal();
    const spendingSlider = await screen.findByRole('slider', {
      name: 'Cut target retirement income',
    });
    fireEvent.change(spendingSlider, { target: { value: '5000' } });

    await openConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(storeState.updateSettings).toHaveBeenCalledTimes(1);
    const [, patch] = storeState.updateSettings.mock.calls[0]!;
    expect(patch.annualSpending).toBe(plan.settings.annualSpending - 5000);
    expect(storeState.updateHolding).not.toHaveBeenCalled();
  });

  it('committing extra savings distributes it across existing holdings', async () => {
    renderModal();
    const savingsSlider = await screen.findByRole('slider', { name: 'Save more' });
    fireEvent.change(savingsSlider, { target: { value: '600' } });

    const heading = await openConfirmation();
    expect(
      within(heading.closest('[role="dialog"]')!).getByText(/existing holding/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(storeState.updateHolding).toHaveBeenCalledTimes(2);
    const patchFor = (id: string) =>
      storeState.updateHolding.mock.calls.find((call) => call[1] === id)?.[2];
    const vooPatch = patchFor(voo!.id);
    const btcPatch = patchFor(btc!.id);
    expect(vooPatch?.monthlyContribution).toBeGreaterThan(voo!.monthlyContribution);
    expect(btcPatch?.monthlyContribution).toBeGreaterThan(btc!.monthlyContribution);
  });
});
