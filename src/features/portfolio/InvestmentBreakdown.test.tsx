import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { AppModeProvider } from '@/providers/AppModeContext';
import { createSandboxPlan } from '@/store/seed';
import { InvestmentBreakdown } from './InvestmentBreakdown';

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string },
}));

const storeState = vi.hoisted(() => ({
  updateHolding: vi.fn(),
  removeHolding: vi.fn(),
  openModal: vi.fn(),
  openPaywall: vi.fn(),
}));

const priceState = vi.hoisted(() => ({
  fetchPrice: vi.fn(),
  fetchAll: vi.fn(),
}));

vi.mock('@/lib/authClient', () => ({
  useSession: () => ({ data: authState.user ? { user: authState.user } : null }),
}));

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@/hooks/useEntitlements', () => ({ useLimit: () => 2 }));

vi.mock('@/hooks/usePriceFetcher', () => ({
  usePriceFetcher: () => ({
    statuses: {},
    isFetchingAll: false,
    fetchPrice: priceState.fetchPrice,
    fetchAll: priceState.fetchAll,
  }),
}));

const renderPortfolio = (sandbox: boolean) => {
  const plan = createSandboxPlan('en');
  render(
    <AppModeProvider sandbox={sandbox}>
      <InvestmentBreakdown plan={plan} totalValue={150_000} rates={undefined} />
    </AppModeProvider>,
  );
};

beforeEach(async () => {
  authState.user = null;
  window.history.replaceState({}, '', '/en/app/sandbox/plan/test/portfolio');
  await i18n.changeLanguage('en');
});

describe('InvestmentBreakdown Sandbox controls', () => {
  it('hides every live-price and add-asset control and shows the account CTA', () => {
    renderPortfolio(true);

    expect(screen.queryByRole('button', { name: 'Fetch Latest Prices' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Fetch latest price for VOO' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Fetch latest price for BTC' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add New Asset' })).not.toBeInTheDocument();

    const cta = screen.getByRole('link', {
      name: 'Create an account to customize the portfolio',
    });
    expect(cta).toHaveAttribute('href', '/en/app/signup');
    expect(cta).toHaveClass('action-banner__push-right');
  });

  it('returns signed-in Sandbox visitors to their account instead of signup', () => {
    authState.user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };
    renderPortfolio(true);

    expect(screen.getByRole('link', { name: 'Customize in my account' })).toHaveAttribute(
      'href',
      '/en/app',
    );
  });

  it('keeps live prices and asset creation available outside the Sandbox', () => {
    renderPortfolio(false);

    expect(screen.getByRole('button', { name: 'Fetch Latest Prices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch latest price for VOO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch latest price for BTC' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add New Asset' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create an account to customize the portfolio' }),
    ).not.toBeInTheDocument();
  });
});
