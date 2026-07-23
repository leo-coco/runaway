import { describe, expect, it } from 'vitest';
import { classifySuccessBand, successStatus } from './successRate';

describe('classifySuccessBand', () => {
  it.each([
    [1, 'excellent'],
    [0.9, 'excellent'],
    [0.899, 'good'],
    [0.8, 'good'],
    [0.799, 'fair'],
    [0.6, 'fair'],
    [0.599, 'risky'],
    [0.4, 'risky'],
    [0.399, 'concerning'],
    [0.25, 'concerning'],
    [0.249, 'nonViable'],
    [0, 'nonViable'],
  ] as const)('classifies %s as %s', (rate, expected) => {
    expect(classifySuccessBand(rate)).toBe(expected);
  });

  it('includes the display band in the success status', () => {
    expect(successStatus(0.85)).toMatchObject({
      pct: 85,
      band: 'good',
    });
  });
});
