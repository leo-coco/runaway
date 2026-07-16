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
    category: 'vehicle',
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
  it('falls back to the wallet icon when an event contains an unknown runtime icon key', () => {
    vi.mocked(buildRunwayEvents).mockReturnValue([
      EVENTS[0]!,
      {
        id: 'flow:stale',
        kind: 'expense',
        year: 2029,
        labelKey: 'runway.flowNamed',
        labelParams: { name: 'Stale event' },
        icon: 'stale-icon' as RunwayEvent['icon'],
      },
      EVENTS[2]!,
    ]);

    expect(() => render(<RunwayTimeline />)).not.toThrow();
  });

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

    expect(screen.getByText('44 years')).toBeInTheDocument();
    expect(screen.queryByText('2029')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/See all events/));
    const dialog = screen.getByRole('dialog');
    const ageStops = [...dialog.querySelectorAll('time')].map((time) => time.textContent);
    expect(ageStops).toEqual(['40 years', '44 years', '47 years']);
    expect(within(dialog).getByText('2029')).toBeInTheDocument();
  });

  it('applies the confidence tint class to uncertain markers', () => {
    const { container } = render(<RunwayTimeline />);
    expect(container.querySelector('.runway__marker--weak')).not.toBeNull();
  });

  it('reuses the modal category tone on compact runway markers', () => {
    const { container } = render(<RunwayTimeline />);
    const marker = container.querySelector('.runway__marker.runway-event--category-vehicle');
    expect(marker).not.toBeNull();
  });

  it('defines a distinct runway tone for every added category', () => {
    for (const category of [
      'insurance',
      'relocation',
      'family',
      'renovation',
      'business',
      'pension',
      'debt',
      'taxLegal',
      'salary',
      'rentalIncome',
    ]) {
      expect(appCss).toContain(`.runway-event--category-${category}`);
    }
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

  it('opens the "see all events" modal as a vertical path sorted by year', () => {
    render(<RunwayTimeline />);
    fireEvent.click(screen.getByText(/See all events/));
    const dialog = screen.getByRole('dialog');
    const yearStops = [...dialog.querySelectorAll('time')].map((time) => time.textContent);
    expect(yearStops).toEqual(['2025', '2029', '2032']);

    const carButton = within(dialog).getByRole('button', { name: /New car/ });
    expect(carButton).toHaveClass('runway-event--category-vehicle');
    expect(carButton).toHaveTextContent('Vehicle');
    expect(carButton).toHaveTextContent(/−.*\d/);

    fireEvent.click(carButton);
    expect(carButton).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(dialog).getByText(/This expense is drawn from your portfolio/),
    ).toBeInTheDocument();
  });

  it('stacks multiple events from the same year under one date stop', () => {
    vi.mocked(buildRunwayEvents).mockReturnValue([
      ...EVENTS.slice(0, 2),
      {
        id: 'flow:gift',
        kind: 'income',
        year: 2029,
        labelKey: 'runway.flowNamed',
        labelParams: { name: 'Inheritance' },
        amount: 50000,
        icon: 'gift',
        category: 'gift',
        frequency: 'recurring',
      },
      EVENTS[2]!,
    ]);

    render(<RunwayTimeline />);
    fireEvent.click(screen.getByText(/See all events/));
    const dialog = screen.getByRole('dialog');
    const yearSections = dialog.querySelectorAll('.runway-events__year');
    expect(yearSections).toHaveLength(3);
    expect(yearSections[1]?.querySelectorAll('.runway-event')).toHaveLength(2);
    expect(within(yearSections[1] as HTMLElement).getByText('Inheritance')).toBeInTheDocument();
    const inheritance = within(yearSections[1] as HTMLElement).getByRole('button', {
      name: /Inheritance/,
    });
    expect(inheritance).toHaveTextContent('Periodic');
    fireEvent.click(inheritance);
    expect(
      within(yearSections[1] as HTMLElement).getByText(/yearly occurrence of the recurring income/),
    ).toBeInTheDocument();
  });

  it('renders localized labels (fr)', async () => {
    await i18n.changeLanguage('fr');
    render(<RunwayTimeline />);
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument();
    expect(screen.getByText('Portefeuille à sec')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Âge' }));
    expect(screen.getByText('44 ans')).toBeInTheDocument();
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
