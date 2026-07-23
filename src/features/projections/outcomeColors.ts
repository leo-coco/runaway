import type { TrialOutcomeCategory } from '@/services/monteCarlo';

/** Shared outcome palette, ordered from the strongest result to the weakest. */
export const OUTCOME_CATEGORY_COLOR: Record<TrialOutcomeCategory, string> = {
  largeSurplus: 'var(--success-band-excellent)',
  comfortable: 'var(--success-band-good)',
  tightSuccess: 'var(--success-band-fair)',
  almostMadeIt: 'var(--success-band-risky)',
  failedInMiddle: 'var(--success-band-non-viable)',
};
