import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_TIER_CONFIG, resolveEntitlements } from '@/domain/entitlements';
import { BillingCard } from './BillingCard';

const { startCheckout, openBillingPortal, BillingUnavailableError, useEntitlements } = vi.hoisted(
  () => {
    class BillingUnavailableError extends Error {}
    return {
      startCheckout: vi.fn(),
      openBillingPortal: vi.fn(),
      BillingUnavailableError,
      useEntitlements: vi.fn(),
    };
  },
);
vi.mock('./billingApi', () => ({ startCheckout, openBillingPortal, BillingUnavailableError }));
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => useEntitlements() }));

vi.mock('@/lib/authClient', () => ({
  useSession: () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }),
}));

const asTier = (tier: 'free' | 'premium') =>
  resolveEntitlements(tier, tier === 'premium' ? null : undefined, DEFAULT_TIER_CONFIG);

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillingCard />
    </QueryClientProvider>,
  );

beforeEach(() => {
  startCheckout.mockReset();
  openBillingPortal.mockReset();
  useEntitlements.mockReset();
});

describe('BillingCard', () => {
  it('shows an upgrade CTA for free users and starts checkout', async () => {
    useEntitlements.mockReturnValue(asTier('free'));
    startCheckout.mockResolvedValue(undefined);
    renderCard();

    const cta = screen.getByRole('button', { name: /Upgrade/i });
    fireEvent.click(cta);
    await waitFor(() => expect(startCheckout).toHaveBeenCalledOnce());
    expect(openBillingPortal).not.toHaveBeenCalled();
  });

  it('shows a manage-billing CTA for premium users and opens the portal', async () => {
    useEntitlements.mockReturnValue(asTier('premium'));
    openBillingPortal.mockResolvedValue(undefined);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /Manage billing/i }));
    await waitFor(() => expect(openBillingPortal).toHaveBeenCalledOnce());
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('falls back to the coming-soon note when billing is unconfigured', async () => {
    useEntitlements.mockReturnValue(asTier('free'));
    startCheckout.mockRejectedValue(new BillingUnavailableError());
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /Upgrade/i }));
    await waitFor(() => expect(screen.getByText(/coming soon/i)).toBeInTheDocument());
  });
});
