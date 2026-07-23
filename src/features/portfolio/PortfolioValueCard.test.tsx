import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import i18n from '@/i18n';

const context = {
  plan: {
    currency: 'USD',
    settings: { currentAge: 40, retirementYear: 2050 },
  },
  projection: {
    active: {
      depletionYear: null as number | null,
      years: [
        { year: 2025, closingBalance: 1_000_000 },
        { year: 2050, closingBalance: 2_000_000 },
        { year: 2085, closingBalance: 7_180_000_000 },
      ],
    },
  },
};

vi.mock('./PlanLayout', () => ({
  usePlanContext: () => context,
}));

import { PortfolioValueCard } from './PortfolioValueCard';

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  context.projection.active.depletionYear = null;
  context.projection.active.years[1]!.closingBalance = 2_000_000;
});

describe('PortfolioValueCard', () => {
  it('presents the closing portfolio when savings last through the plan', () => {
    const { container } = render(<PortfolioValueCard />);
    const cards = container.querySelectorAll('.hero__card');
    const terminalCard = cards[2] as HTMLElement;

    expect(within(terminalCard).getByText('Portefeuille à la fin du plan')).toBeInTheDocument();
    expect(within(terminalCard).getByText('$7.18B')).toBeInTheDocument();
    expect(within(terminalCard).getByText('Solde de clôture')).toBeInTheDocument();
    expect(screen.queryByText('Épuisement de l’épargne')).not.toBeInTheDocument();
    expect(terminalCard).not.toHaveClass('hero__card--depletion');
  });

  it('keeps the depletion year and age when savings run out', () => {
    context.projection.active.depletionYear = 2070;

    const { container } = render(<PortfolioValueCard />);
    const cards = container.querySelectorAll('.hero__card');
    const terminalCard = cards[2] as HTMLElement;

    expect(within(terminalCard).getByText('Épuisement de l’épargne')).toBeInTheDocument();
    expect(within(terminalCard).getByText('2070')).toBeInTheDocument();
    expect(within(terminalCard).getByText('Âge 85')).toBeInTheDocument();
    expect(terminalCard).toHaveClass('hero__card--depletion');
  });

  it('uses the depletion gradient when the portfolio is empty at retirement', () => {
    context.projection.active.years[1]!.closingBalance = 0;

    const { container } = render(<PortfolioValueCard />);
    const cards = container.querySelectorAll('.hero__card');
    const retirementCard = cards[1] as HTMLElement;

    expect(within(retirementCard).getByText('Portefeuille à la retraite')).toBeInTheDocument();
    expect(within(retirementCard).getByText(/^\$0(\.00)?$/)).toBeInTheDocument();
    expect(retirementCard).toHaveClass('hero__card--depletion');
  });
});
