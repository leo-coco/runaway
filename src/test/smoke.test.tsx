import type { ReactNode } from 'react';
import type * as Recharts from 'recharts';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ServicesProvider } from '@/providers/ServicesContext';
import { createQueryClient } from '@/providers/queryClient';
import { PlanLayout } from '@/features/portfolio/PlanLayout';
import { DashboardPage } from '@/features/portfolio/DashboardPage';
import { PortfolioPage } from '@/features/portfolio/PortfolioPage';
import { ProjectionPage } from '@/features/portfolio/ProjectionPage';
import { MonteCarloPage } from '@/features/portfolio/MonteCarloPage';
import { useAppStore } from '@/store';
import { ok } from '@/domain/result';
import type { Services } from '@/services/container';
import { AppModeProvider } from '@/providers/AppModeContext';

// ResponsiveContainer needs a non-zero size in jsdom.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof Recharts>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 800, height: 360 }}>{children}</div>
    ),
  };
});

const mockServices: Services = {
  price: {
    cryptoPrice: vi.fn(async () => ok(100)),
    cryptoPrices: vi.fn(async () => ok({})),
    stockPrice: vi.fn(async () => ok(50)),
    stockPrices: vi.fn(async () => ok({})),
    rates: vi.fn(async () => ok({ base: 'USD', rates: { USD: 1, CAD: 1.35 }, asOf: 0 })),
    allocation: vi.fn(async () =>
      ok({
        stockPct: null,
        bondPct: null,
        cashPct: null,
        otherPct: null,
        preferredPct: null,
        convertiblePct: null,
        categoryName: null,
        fundFamily: null,
        sectorWeightings: [],
      }),
    ),
  },
  search: { search: vi.fn(async () => ok([])) },
};

const renderAt = async (
  section: 'dashboard' | 'portfolio' | 'projection' | 'monte-carlo',
  sandbox = false,
) => {
  const planId = useAppStore.getState().plans[0]!.id;
  const client = createQueryClient();
  const result = render(
    <QueryClientProvider client={client}>
      <ServicesProvider services={mockServices}>
        <AppModeProvider sandbox={sandbox}>
          <MemoryRouter initialEntries={[`/plan/${planId}/${section}`]}>
            <Routes>
              <Route path="/plan/:id" element={<PlanLayout />}>
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="portfolio" element={<PortfolioPage />} />
                <Route path="projection" element={<ProjectionPage />} />
                <Route path="monte-carlo" element={<MonteCarloPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AppModeProvider>
      </ServicesProvider>
    </QueryClientProvider>,
  );
  // PlanLayout shows a spinner until the FX query resolves; wait it out so
  // callers can assert against the real page content.
  await waitFor(() => {
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });
  return result;
};

describe('plan pages (smoke)', () => {
  it('dashboard shows the plan header, currency control and plan settings', async () => {
    await renderAt('dashboard');
    expect(screen.getByRole('heading', { name: /My plan/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Currency')).toBeInTheDocument();
    expect(screen.getByText('Savings Capacity')).toBeInTheDocument();
  });

  it('shows the last-saved badge for account plans but not in the sandbox', async () => {
    const account = await renderAt('portfolio');
    expect(screen.getByText('Last saved')).toBeInTheDocument();
    account.unmount();

    await renderAt('portfolio', true);
    expect(screen.queryByText('Last saved')).not.toBeInTheDocument();
  });

  it('portfolio page shows the multi-currency breakdown and investment rows for seeded assets', async () => {
    await renderAt('portfolio');
    expect(screen.getByText('My Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Price (USD)')).toBeInTheDocument();
    expect(screen.getByText('Bitcoin')).toBeInTheDocument();
    // The asset name is visually truncated (AssetRow.tsx), but the ticker plus
    // full name is preserved in the title attribute for a tooltip on hover.
    expect(screen.getByTitle('NVDA NVIDIA Corporation')).toBeInTheDocument();
  });

  it('portfolio page shows "Add New Asset" outside of edit mode', async () => {
    await renderAt('portfolio');
    expect(screen.getByRole('button', { name: /Add New Asset/i })).toBeInTheDocument();
  });

  it('projection page shows the projections panel and savings flow row', async () => {
    await renderAt('projection');
    expect(screen.getByText('Portfolio Projections')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide row labels' }));
    expect(screen.getByRole('button', { name: 'Show row labels' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show row labels' }));
    expect(screen.getByRole('button', { name: 'Hide row labels' })).toBeInTheDocument();
    // The "Savings Contributions" detail row is nested inside the "Total
    // Income" row's expand-to-detail section, which is collapsed by default.
    fireEvent.click(screen.getByRole('button', { name: /Total Income/i }));
    expect(screen.getByText(/Savings Contributions/)).toBeInTheDocument();
  });
});
