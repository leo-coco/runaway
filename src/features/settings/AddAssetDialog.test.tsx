import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createSandboxPlan } from '@/store/seed';
import { AddAssetDialog } from './AddAssetDialog';

const storeState = vi.hoisted(() => ({
  removeHolding: vi.fn(),
  addAccount: vi.fn(),
  openPaywall: vi.fn(),
}));

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@/hooks/useEntitlements', () => ({
  useLimit: (limit: string) => (limit === 'maxAssets' ? 10 : 5),
}));

vi.mock('@/hooks/useAssetSearch', () => ({
  useAssetSearch: () => ({
    data: [],
    error: null,
    isError: false,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useSearchPrices', () => ({
  useSearchPrices: () => new Map(),
}));

vi.mock('@/providers/ServicesContext', () => ({
  useServices: () => ({ price: {} }),
}));

const renderDialog = () => {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(<AddAssetDialog plan={createSandboxPlan('en')} onAdd={onAdd} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Custom asset' }));
  return { onAdd, onClose };
};

const fillCustomAsset = () => {
  fireEvent.change(screen.getByPlaceholderText('e.g. Private fund, Collectible…'), {
    target: { value: 'Private fund' },
  });
  const price = screen.getByLabelText('Custom asset price');
  fireEvent.change(price, { target: { value: '100' } });
  fireEvent.blur(price);
};

describe('AddAssetDialog completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('saves the pending asset before Done closes the dialog', () => {
    const { onAdd, onClose } = renderDialog();
    fillCustomAsset();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 1,
        pricePerUnit: 100,
        instrument: expect.objectContaining({ name: 'Private fund' }),
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the dialog open after saving an asset for another entry', () => {
    const { onAdd, onClose } = renderDialog();
    fillCustomAsset();

    fireEvent.click(screen.getByRole('button', { name: 'Save and add another' }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the optional composition in a closed drawer until requested', () => {
    renderDialog();

    const trigger = screen.getByRole('button', { name: 'Composition (optional)' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Stocks')).not.toBeVisible();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Stocks')).toBeVisible();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Stocks')).not.toBeVisible();
  });
});
