import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createSandboxPlan } from '@/store/seed';
import { AccountsModal } from './AccountsModal';

const storeState = vi.hoisted(() => ({
  saveAccountsTaxConfig: vi.fn(),
  openPaywall: vi.fn(),
}));
const entitlementState = vi.hoisted(() => ({ maxAccounts: 10 as number | null }));

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@/hooks/useEntitlements', () => ({
  useLimit: () => entitlementState.maxAccounts,
}));

const renderModal = (onClose = vi.fn()) => {
  const plan = createSandboxPlan('en');
  const result = render(<AccountsModal plan={plan} rates={undefined} onClose={onClose} />);
  return { ...result, plan, onClose };
};

describe('AccountsModal transactional editing', () => {
  beforeEach(() => {
    storeState.saveAccountsTaxConfig.mockReset();
    storeState.openPaywall.mockReset();
    entitlementState.maxAccounts = 10;
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

  it('puts the tax-residence country first in the preset groups', () => {
    renderModal();

    fireEvent.change(screen.getByLabelText('Tax residence'), { target: { value: 'CA' } });
    fireEvent.focus(screen.getByLabelText('Account preset'));

    const groups = [...document.querySelectorAll('.search-group')].map((group) =>
      group.textContent?.trim(),
    );
    expect(groups.slice(0, 3)).toEqual(['🇨🇦 Canada', '🇫🇷 France', '🇺🇸 United States']);
  });

  it('keeps the selected-account add button beside the search input', () => {
    renderModal();

    const search = screen.getByLabelText('Account preset');
    const addButton = screen.getByRole('button', { name: 'Add (0)' });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveClass('acct-preset-combo__add-button');
    expect(addButton.parentElement).toBe(search.closest('.acct-preset-combo'));

    fireEvent.focus(search);
    fireEvent.click(screen.getByRole('checkbox', { name: '401(k) / IRA Tax-deferred' }));

    expect(screen.getByRole('button', { name: 'Add (1)' })).toBeEnabled();
    expect(document.querySelector('.acct-preset-combo__results button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add (1)' }));
    expect(screen.getByRole('button', { name: 'Add (0)' })).toBeDisabled();
    expect(screen.getByRole('columnheader', { name: 'Account (2)' })).toBeInTheDocument();
  });

  it('locks remaining presets with a PRO badge when the account limit is reached', () => {
    entitlementState.maxAccounts = 2;
    renderModal();

    fireEvent.focus(screen.getByLabelText('Account preset'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'PER Tax-deferred' }));

    const lockedRow = screen.getByRole('checkbox', {
      name: 'PERP / Madelin Tax-deferred Pro',
    });
    expect(lockedRow).toHaveAttribute('aria-disabled', 'true');
    expect(lockedRow).toHaveClass('is-locked');
    expect(document.querySelectorAll('.search-row.is-locked .pro-badge').length).toBeGreaterThan(0);

    fireEvent.click(lockedRow);
    expect(storeState.openPaywall).toHaveBeenCalledWith('accounts');
    expect(lockedRow).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('checkbox', { name: 'PER Tax-deferred' }));
    expect(screen.getByRole('checkbox', { name: 'PERP / Madelin Tax-deferred' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('gates custom, crypto, and preset additions at the free account limit', () => {
    entitlementState.maxAccounts = 1;
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Custom account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crypto Wallet' }));
    expect(storeState.openPaywall).toHaveBeenCalledTimes(2);
    expect(storeState.openPaywall).toHaveBeenNthCalledWith(1, 'accounts');
    expect(storeState.openPaywall).toHaveBeenNthCalledWith(2, 'accounts');

    fireEvent.focus(screen.getByLabelText('Account preset'));
    const lockedPreset = screen.getByRole('checkbox', {
      name: '401(k) / IRA Tax-deferred Pro',
    });
    expect(lockedPreset).toHaveClass('is-locked');
    expect(lockedPreset).toHaveAttribute('aria-disabled', 'true');
    expect(lockedPreset.querySelector('.pro-badge')).not.toBeNull();

    fireEvent.click(lockedPreset);
    expect(storeState.openPaywall).toHaveBeenCalledTimes(3);
    expect(storeState.openPaywall).toHaveBeenLastCalledWith('accounts');
  });
});
