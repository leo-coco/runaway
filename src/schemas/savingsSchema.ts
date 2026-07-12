import { z } from 'zod';

/** Validation for a single asset's monthly contribution (native currency). */
export const monthlyContributionSchema = z
  .number({ message: 'Enter an amount' })
  .nonnegative('Contribution cannot be negative')
  .max(10_000_000, 'That contribution looks too large');

export type MonthlyContribution = z.infer<typeof monthlyContributionSchema>;
