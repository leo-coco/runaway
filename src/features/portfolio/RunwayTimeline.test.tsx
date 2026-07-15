import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from '@/i18n';
import type * as RunwayEventsModule from '@/services/runwayEvents';
import { buildRunwayEvents } from '@/services/runwayEvents';
import type { RunwayEvent } from '@/services/runwayEvents';

// jsdom has no ResizeObserver; the component only uses it to react to layout
// changes, which the tests don't need to exercise.
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;

// The component derives events from context + service; mock both so the test
// drives a fixed event list and never needs the store/network.
const EVENTS: RunwayEvent[] = [
  { id: 'today', kind: 'today', year: 2025, labelKey: 'runway.today', icon: 'dot' },
  {
    id: 'flow:car',
    kind: 'expense',
    year: 2029,
    labelKey: 'runway.flowNamed',
    labelParams: { name: 'New car' },
    amount: 20000,
    icon: 'car',
  },
  {
    id: 'portfolio-dry',
    kind: 'portfolio-dry',
    year: 2032,
    labelKey: 'runway.portfolioDry',
    icon: 'alert',
    confidence: 'weak',
    mcRange: { lowYear: 2030, highYear: 2034 },
  },
];

vi.mock('@/services/runwayEvents', async (importOriginal) => {
  const actual = await importOriginal<typeof RunwayEventsModule>();
  return { ...actual, buildRunwayEvents: vi.fn(() => EVENTS) };
});

const PLAN = { currency: 'CAD', holdings: [{ id: 'h1' }], settings: { currentAge: 40 } };

vi.mock('./PlanLayout', () => ({
  usePlanContext: () => ({
    plan: PLAN,
    projection: { active: {}, startYear: 2025 },
    monteCarlo: { result: { successRate: 0.5 } },
  }),
}));

vi.mock('@/hooks/useEntitlements', () => ({ useLimit: () => null }));

const openModal = vi.fn();
const openPaywall = vi.fn();
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({ openModal, openPaywall }),
}));

import { RUNWAY_ITEM_WIDTH, RunwayTimeline, selectVisibleRunwayEvents } from './RunwayTimeline';

const appCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const riskBorderRule = appCss.match(
  /\.hero__card--risk,\s*\.runway\.hero__card--risk\s*\{([^}]*)\}/,
)?.[1];

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.mocked(buildRunwayEvents).mockReturnValue(EVENTS);
});

describe('RunwayTimeline', () => {
  it('keeps today and the terminal point, with the nearest milestones before an ellipsis', () => {
    const events: RunwayEvent[] = [
      { id: 'today', kind: 'today', year: 2026, labelKey: 'runway.today', icon: 'dot' },
      {
        id: 'm1',
        kind: 'wealth-milestone',
        year: 2029,
        labelKey: 'runway.milestone',
        labelParams: { amount: 200_000 },
        amount: 200_000,
        icon: 'trophy',
      },
      {
        id: 'm2',
        kind: 'wealth-milestone',
        year: 2030,
        labelKey: 'runway.milestone',
        icon: 'trophy',
      },
      {
        id: 'm3',
        kind: 'wealth-milestone',
        year: 2031,
        labelKey: 'runway.milestone',
        icon: 'trophy',
      },
      {
        id: 'death',
        kind: 'projection-end',
        year: 2060,
        labelKey: 'runway.projectionEnd',
        icon: 'star',
      },
    ];

    const compact = selectVisibleRunwayEvents(events, RUNWAY_ITEM_WIDTH * 4);
    expect(compact.collapsed).toBe(true);
    expect(compact.visible.map((event) => event.id)).toEqual(['today', 'm1', 'death']);

    const expanded = selectVisibleRunwayEvents(events, RUNWAY_ITEM_WIDTH * 5);
    expect(expanded.collapsed).toBe(false);
    expect(expanded.visible.map((event) => event.id)).toEqual(events.map((event) => event.id));
  });

  it('renders a marker per event, including today', () => {
    render(<RunwayTimeline />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('New car')).toBeInTheDocument();
    expect(screen.getByText('Portfolio runs dry')).toBeInTheDocument();
    expect(screen.getByText('2029')).toBeInTheDocument();
  });

  it('switches timeline markers and the full event list from years to ages', () => {
    render(<RunwayTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'Age' }));

    expect(screen.getByText('44')).toBeInTheDocument();
    expect(screen.queryByText('2029')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/See all events/));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('columnheader', { name: 'Age' })).toBeInTheDocument();
    const ageCells = within(dialog)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td')?.textContent);
    expect(ageCells).toEqual(['40', '44', '47']);
  });

  it('applies the confidence tint class to uncertain markers', () => {
    const { container } = render(<RunwayTimeline />);
    expect(container.querySelector('.runway__marker--weak')).not.toBeNull();
  });

  it('uses the same 2px danger border as Monte Carlo when the portfolio runs dry', () => {
    const { container } = render(<RunwayTimeline />);
    const card = container.querySelector<HTMLElement>('.runway.hero__card--risk');

    expect(card).not.toBeNull();
    expect(riskBorderRule).toContain('border-width: 2px');
    expect(riskBorderRule).toContain('border-color: var(--danger, #f43f5e)');
  });

  it('does not use the risk border when the portfolio remains funded', () => {
    vi.mocked(buildRunwayEvents).mockReturnValue(
      EVENTS.filter((event) => event.kind !== 'portfolio-dry'),
    );

    const { container } = render(<RunwayTimeline />);
    const card = container.querySelector<HTMLElement>('.runway');

    expect(card).not.toBeNull();
    expect(container.querySelector('.runway.hero__card--risk')).toBeNull();
  });

  it('opens the "see all events" modal with rows sorted by year', () => {
    render(<RunwayTimeline />);
    fireEvent.click(screen.getByText(/See all events/));
    const dialog = screen.getByRole('dialog');
    const yearCells = within(dialog)
      .getAllByRole('row')
      .slice(1) // skip header
      .map((row) => row.querySelector('td')?.textContent);
    expect(yearCells).toEqual(['2025', '2029', '2032']);
    // The 2029 (car) row shows a formatted amount. Assert only that a numeric
    // amount is rendered in its last cell, not the exact currency string, which
    // varies with the runtime's ICU data (symbol, spacing, compact notation).
    const carRow = within(dialog)
      .getAllByRole('row')
      .find((row) => row.querySelector('td')?.textContent === '2029');
    const amountCell = carRow?.querySelectorAll('td')[2];
    expect(amountCell?.textContent).toMatch(/\d/);
  });

  it('renders localized labels (fr)', async () => {
    await i18n.changeLanguage('fr');
    render(<RunwayTimeline />);
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument();
    expect(screen.getByText('Portefeuille à sec')).toBeInTheDocument();
  });

  it('shows an add-asset prompt instead of the timeline when there are no holdings', () => {
    PLAN.holdings = [];
    render(<RunwayTimeline />);
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add an asset'));
    expect(openModal).toHaveBeenCalledWith('addAsset');
    PLAN.holdings = [{ id: 'h1' }];
  });
});
