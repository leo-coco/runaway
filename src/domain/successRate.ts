/**
 * Classification of a Monte Carlo success rate (probability the plan funds the
 * full retirement horizon) into plain-language zones for color coding. Thresholds
 * follow common financial-planning convention (≥85% strong, 70–85% borderline).
 */
export type SuccessZone = 'strong' | 'borderline' | 'weak';

/**
 * Fine-grained, user-facing assessment of the overall Monte Carlo success
 * rate. These bands mirror the six default ranges used by ProjectionLab.
 */
export type SuccessBand = 'excellent' | 'good' | 'fair' | 'risky' | 'concerning' | 'nonViable';

export interface SuccessStatus {
  /** Success rate as a percentage (0–100). */
  readonly pct: number;
  readonly zone: SuccessZone;
  readonly band: SuccessBand;
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

/**
 * Classify a success rate (fraction 0–1) for display:
 *  - Excellent:  >= 90%
 *  - Good:       >= 80% and < 90%
 *  - Fair:       >= 60% and < 80%
 *  - Risky:      >= 40% and < 60%
 *  - Concerning: >= 25% and < 40%
 *  - Non-viable: < 25%
 */
export const classifySuccessBand = (rate: number): SuccessBand => {
  if (rate >= 0.9) return 'excellent';
  if (rate >= 0.8) return 'good';
  if (rate >= 0.6) return 'fair';
  if (rate >= 0.4) return 'risky';
  if (rate >= 0.25) return 'concerning';
  return 'nonViable';
};

export const successStatus = (rate: number): SuccessStatus => ({
  pct: Math.round(rate * 1000) / 10,
  zone: classifySuccess(rate),
  band: classifySuccessBand(rate),
});
