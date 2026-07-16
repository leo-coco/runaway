import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createSandboxPlan } from '@/store/seed';
import { SavingsCapacityModal } from './SavingsCapacityModal';

vi.mock('@/hooks/useExchangeRate', () => ({
  useExchangeRate: () => ({ data: undefined }),
}));

describe('SavingsCapacityModal automatic distribution', () => {
  afterEach(cleanup);

  it('uses short action labels and resets to the saved contributions', () => {
    const plan = createSandboxPlan('en');
    render(<SavingsCapacityModal plan={plan} onSave={vi.fn()} onClose={vi.fn()} />);

    const spread = screen.getByLabelText('Total monthly amount to spread');
    const reset = screen.getByRole('button', { name: 'Reset' });

    expect(screen.getByRole('button', { name: 'Split' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /across 2 assets/i })).not.toBeInTheDocument();
    expect(reset).toBeDisabled();

    fireEvent.change(spread, { target: { value: '600' } });
    fireEvent.blur(spread);
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));

    expect(screen.getByLabelText('VOO monthly contribution')).toHaveValue('300');
    expect(screen.getByLabelText('BTC monthly contribution')).toHaveValue('300');

    fireEvent.click(reset);

    expect(spread).toHaveValue('0');
    expect(screen.getByLabelText('VOO monthly contribution')).toHaveValue('100');
    expect(screen.getByLabelText('BTC monthly contribution')).toHaveValue('0');
  });
});
