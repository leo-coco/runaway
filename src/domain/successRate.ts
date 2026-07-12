/**
 * Classification of a Monte Carlo success rate (probability the plan funds the
 * full retirement horizon) into plain-language zones for color coding. Thresholds
 * follow common financial-planning convention (≥85% strong, 70–85% borderline).
 */
export type SuccessZone = 'strong' | 'borderline' | 'weak';

export interface SuccessStatus {
  /** Success rate as a percentage (0–100). */
  readonly pct: number;
  readonly zone: SuccessZone;
}

export const SUCCESS_ZONE_LABEL: Record<SuccessZone, string> = {
  strong: 'On track',
  borderline: 'Borderline',
  weak: 'At risk',
};

export const SUCCESS_ZONE_DESCRIPTION: Record<SuccessZone, string> = {
  strong: 'The plan funds your full retirement in most simulated markets.',
  borderline: 'The plan works in many markets but fails in a meaningful share.',
  weak: 'The plan runs out of money in too many simulated markets.',
};

/**
 * Classify a success rate (fraction 0–1).
 *  - Strong:     >= 0.85
 *  - Borderline: 0.70 – 0.85
 *  - Weak:       < 0.70
 */
export const classifySuccess = (rate: number): SuccessZone => {
  if (rate >= 0.85) return 'strong';
  if (rate >= 0.7) return 'borderline';
  return 'weak';
};

export const successStatus = (rate: number): SuccessStatus => ({
  pct: Math.round(rate * 1000) / 10,
  zone: classifySuccess(rate),
});
