import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildLandmarkTicks, ImportantYearTick, LandmarkLabel } from './ChartLandmarks';

describe('projection chart landmarks', () => {
  it('keeps the depletion year on the X axis', () => {
    const years = Array.from({ length: 31 }, (_, index) => 2026 + index);

    expect(buildLandmarkTicks(years, [2045, 2051])).toContain(2045);
  });

  it('renders the depletion tick in red with the active axis formatter', () => {
    render(
      <svg>
        <ImportantYearTick
          payload={{ value: 2045 }}
          importantYears={[2035, 2051]}
          dangerYears={[2045]}
          formatter={() => '69'}
        />
      </svg>,
    );

    const tick = screen.getByText('69');
    expect(tick).toHaveAttribute('fill', 'var(--danger)');
    expect(tick).toHaveAttribute('font-weight', '700');
  });

  it('renders the depletion label as a high-contrast red badge', () => {
    const { container } = render(
      <svg>
        <LandmarkLabel
          value="Épuisement 2045"
          tone="danger"
          verticalAlign="middle"
          viewBox={{ x: 100, y: 10, width: 0, height: 200 }}
        />
      </svg>,
    );

    expect(screen.getByText('Épuisement 2045')).toHaveAttribute('fill', 'var(--danger-contrast)');
    expect(container.querySelector('rect')).toHaveAttribute('fill', 'var(--danger)');
    expect(container.querySelector('rect')).toHaveAttribute('y', '99');
  });
});
