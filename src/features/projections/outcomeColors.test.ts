import { describe, expect, it } from 'vitest';
import { OUTCOME_CATEGORY_COLOR } from './outcomeColors';

describe('OUTCOME_CATEGORY_COLOR', () => {
  it('follows the shared success palette from best to worst outcome', () => {
    expect(OUTCOME_CATEGORY_COLOR).toEqual({
      largeSurplus: 'var(--success-band-excellent)',
      comfortable: 'var(--success-band-good)',
      tightSuccess: 'var(--success-band-fair)',
      almostMadeIt: 'var(--success-band-risky)',
      failedInMiddle: 'var(--success-band-non-viable)',
    });
  });
});
