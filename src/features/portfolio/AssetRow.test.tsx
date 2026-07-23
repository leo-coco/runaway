import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSandboxPlan } from '@/store/seed';
import { AssetRow } from './AssetRow';

describe('AssetRow keyboard editing', () => {
  it('commits the current input and closes editing when Enter is pressed', () => {
    const plan = createSandboxPlan('en');
    const holding = plan.holdings[0]!;
    const onUpdate = vi.fn();
    const onToggleEdit = vi.fn();

    render(
      <AssetRow
        plan={plan}
        holding={holding}
        index={0}
        editing
        onToggleEdit={onToggleEdit}
        rates={undefined}
        fetchState={undefined}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
      />,
    );

    const quantity = screen.getByLabelText(`${holding.instrument.symbol} quantity`);
    fireEvent.change(quantity, { target: { value: '42' } });
    fireEvent.keyDown(quantity, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith(holding.id, { quantity: 42 });
    expect(onToggleEdit).toHaveBeenCalledOnce();
  });
});
