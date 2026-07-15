import type { ReactNode } from 'react';
import type * as Recharts from 'recharts';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ServicesProvider } from '@/providers/ServicesContext';
import { createQueryClient } from '@/providers/queryClient';
import { PlanLayout } from '@/features/portfolio/PlanLayout';
import { DashboardPage } from '@/features/portfolio/DashboardPage';
import { PortfolioPage } from '@/features/portfolio/PortfolioPage';
import { useAppStore } from '@/store';
import { ok } from '@/domain/result';
import type { Services } from '@/services/container';
import { DASHBOARD_GUIDE_STEPS } from './tourSteps';

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
    rates: vi.fn(async () => ok({ base: 'USD', rates: { USD: 1, CAD: 1.35 }, asOf: 0 })),
  },
  search: { search: vi.fn(async () => ok([])) },
};

const renderAt = (section: 'dashboard' | 'portfolio') => {
  const planId = useAppStore.getState().plans[0]!.id;
  const client = createQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ServicesProvider services={mockServices}>
        <MemoryRouter initialEntries={[`/plan/${planId}/${section}`]}>
          <Routes>
            <Route path="/plan/:id" element={<PlanLayout />}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="portfolio" element={<PortfolioPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ServicesProvider>
    </QueryClientProvider>,
  );
};

const has = (container: HTMLElement, key: string): boolean =>
  container.querySelector(`[data-tour="${key}"]`) !== null;

/**
 * Guards the invariant that broke the dashboard guide: a step's anchor must live
 * on the page the step declares. The dashboard redesign moved the editable asset
 * table (add/fetch/quantity/CAGR/drag anchors) onto the `portfolio` route, so
 * those steps must declare `page: 'portfolio'` — otherwise the controller waits on
 * the dashboard for anchors that never mount and silently skips them.
 */
describe('dashboard guide anchors resolve on their declared page', () => {
  const ASSET_KEYS = [
    'addasset-btn',
    'fetch-prices-btn',
    'quantity-input',
    'cagr-input',
    'drag-handle',
  ];

  it('asset anchors are on the portfolio page, not the dashboard', () => {
    const { container: dash } = renderAt('dashboard');
    for (const key of ASSET_KEYS) {
      expect(has(dash, key), `${key} should NOT be on the dashboard`).toBe(false);
    }
  });

  it('the portfolio page renders every asset anchor', () => {
    const { container: pf } = renderAt('portfolio');
    for (const key of ASSET_KEYS) {
      expect(has(pf, key), `${key} should be on the portfolio page`).toBe(true);
    }
  });

  it('every asset step now declares page: portfolio', () => {
    const assetIds = new Set([
      'addAssetButton',
      'addAsset',
      'fetchPrices',
      'quantity',
      'cagr',
      'drag',
    ]);
    const offenders = DASHBOARD_GUIDE_STEPS.filter(
      (s) => assetIds.has(s.id) && s.page !== 'portfolio',
    ).map((s) => s.id);
    expect(offenders).toEqual([]);
  });

  it('overview anchors remain on the dashboard', () => {
    const { container: dash } = renderAt('dashboard');
    for (const key of ['timeline-card', 'accounts-card', 'savings-card', 'spending-card']) {
      expect(has(dash, key), `${key} should be on the dashboard`).toBe(true);
    }
  });
});
