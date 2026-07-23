import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from '@/i18n';

let successRate = 0.5;
let monteCarloStatus: 'running' | 'done' = 'done';

vi.mock('./PlanLayout', () => ({
  usePlanContext: () => ({
    plan: { id: 'plan-1', holdings: [{ id: 'holding-1' }] },
    monteCarlo: { result: { successRate }, status: monteCarloStatus },
  }),
}));

vi.mock('@/hooks/useEntitlements', () => ({ useFeature: () => true }));

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { openPaywall: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ openPaywall: vi.fn() }),
}));

import { MonteCarloSummaryCard } from './MonteCarloSummaryCard';

const appCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const riskBorderRule = appCss.match(
  /\.hero__card--risk,\s*\.runway\.hero__card--risk\s*\{([^}]*)\}/,
)?.[1];

const renderCard = () =>
  render(
    <MemoryRouter>
      <MonteCarloSummaryCard />
    </MemoryRouter>,
  );

beforeEach(async () => {
  await i18n.changeLanguage('en');
  monteCarloStatus = 'done';
});

describe('MonteCarloSummaryCard risk border', () => {
  it('uses the 2px severity border when the result is concerning', () => {
    successRate = 0.39;
    const { container } = renderCard();
    const card = container.querySelector<HTMLElement>('.mc-card.hero__card--risk');

    expect(card).not.toBeNull();
    expect(riskBorderRule).toContain('border-width: 2px');
    expect(card?.style.borderColor).toBe('var(--success-band-concerning)');
  });

  it.each([
    ['risky', 0.4],
    ['fair', 0.6],
    ['good', 0.8],
    ['excellent', 0.9],
  ])('does not use the 2px severity border when the result is %s', (_band, rate) => {
    successRate = rate;
    const { container } = renderCard();
    const card = container.querySelector<HTMLElement>('.mc-card');

    expect(card).not.toBeNull();
    expect(container.querySelector('.mc-card.hero__card--risk')).toBeNull();
  });

  it.each([
    [0.9, 'var(--success-band-excellent)'],
    [0.8, 'var(--success-band-good)'],
    [0.6, 'var(--success-band-fair)'],
    [0.4, 'var(--success-band-risky)'],
    [0.25, 'var(--success-band-concerning)'],
    [0.249, 'var(--success-band-non-viable)'],
  ] as const)('uses the matching band color at %s', (rate, color) => {
    successRate = rate;
    const { container } = renderCard();
    const card = container.querySelector<HTMLElement>('.mc-card');
    const title = container.querySelector<HTMLElement>('.mc-card__title');
    const donut = container.querySelector<HTMLElement>('.mc-donut');

    expect(card?.style.borderColor).toBe(color);
    expect(title?.style.color).toBe(color);
    expect(donut?.style.getPropertyValue('--mc-color')).toBe(color);
  });
});

describe('MonteCarloSummaryCard trajectory label', () => {
  it.each([
    [0.9, 'Excellent trajectory'],
    [0.8, 'Good trajectory'],
    [0.6, 'Fair trajectory'],
    [0.4, 'Risky trajectory'],
    [0.25, 'Concerning trajectory'],
    [0.249, 'Non-viable trajectory'],
  ] as const)('shows the correct English label at %s', (rate, label) => {
    successRate = rate;
    renderCard();

    expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
  });

  it.each([
    [0.9, 'Excellente trajectoire'],
    [0.8, 'Bonne trajectoire'],
    [0.6, 'Trajectoire acceptable'],
    [0.4, 'Trajectoire risquée'],
    [0.25, 'Trajectoire préoccupante'],
    [0.249, 'Trajectoire non viable'],
  ] as const)('shows the correct French label at %s', async (rate, label) => {
    await i18n.changeLanguage('fr');
    successRate = rate;
    renderCard();

    expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
  });
});

describe('MonteCarloSummaryCard recalculation state', () => {
  it('replaces the percentage with a busy indicator while keeping the previous result', () => {
    successRate = 0.82;
    monteCarloStatus = 'running';
    const { container } = renderCard();

    const card = container.querySelector('.mc-card');
    expect(card).toHaveClass('mc-card--calculating');
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Running the simulation…' })).toBeInTheDocument();
    expect(screen.queryByText('82%')).not.toBeInTheDocument();
  });
});
