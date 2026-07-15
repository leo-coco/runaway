import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from '@/i18n';

let successRate = 0.5;

vi.mock('./PlanLayout', () => ({
  usePlanContext: () => ({
    plan: { id: 'plan-1', holdings: [{ id: 'holding-1' }] },
    monteCarlo: { result: { successRate } },
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
});

describe('MonteCarloSummaryCard risk border', () => {
  it('uses the 2px danger border when the Monte Carlo result is weak', () => {
    successRate = 0.69;
    const { container } = renderCard();
    const card = container.querySelector<HTMLElement>('.mc-card.hero__card--risk');

    expect(card).not.toBeNull();
    expect(riskBorderRule).toContain('border-width: 2px');
    expect(riskBorderRule).toContain('border-color: var(--danger, #f43f5e)');
  });

  it.each([
    ['borderline', 0.7],
    ['strong', 0.85],
  ])('does not use the risk border when the result is %s', (_zone, rate) => {
    successRate = rate;
    const { container } = renderCard();
    const card = container.querySelector<HTMLElement>('.mc-card');

    expect(card).not.toBeNull();
    expect(container.querySelector('.mc-card.hero__card--risk')).toBeNull();
  });
});
