import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createSandboxPlan } from '@/store/seed';
import { ImportLocalPlansDialog } from './ImportLocalPlansDialog';

describe('ImportLocalPlansDialog', () => {
  afterEach(cleanup);

  it('shows the detected plan name and retirement age', () => {
    const plan = createSandboxPlan('en');
    render(<ImportLocalPlansDialog plans={[plan]} onDecide={vi.fn()} />);

    const retireAge =
      plan.settings.currentAge + (plan.settings.retirementYear - new Date().getFullYear());

    expect(screen.getByText(plan.name)).toBeInTheDocument();
    expect(
      screen.getByText(`Retires at ${retireAge} (${plan.settings.retirementYear})`),
    ).toBeInTheDocument();
  });
});
