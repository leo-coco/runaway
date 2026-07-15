import { z } from 'zod';

/** Validation for the "Edit Retirement Settings" form. */
export const retirementSettingsFormSchema = z
  .object({
    expensePeriod: z.enum(['monthly', 'yearly']),
    // Stored/edited as an annual figure; the form converts monthly entry to annual.
    annualSpending: z
      .number({ message: 'Enter a spending amount' })
      .nonnegative('Spending cannot be negative')
      .max(100_000_000, 'That spending figure looks too large'),
    inflationPct: z
      .number({ message: 'Enter an inflation rate' })
      .min(0, 'Inflation cannot be negative')
      .max(50, 'Inflation above 50% is not supported'),
    spendingMode: z.enum(['linear', 'phased']),
    goGoEndAge: z.number().int().min(1).max(120),
    slowGoEndAge: z.number().int().min(1).max(120),
    slowGoAdjustmentPct: z.number().min(-20, 'Too negative').max(20, 'Too large'),
    noGoAdjustmentPct: z.number().min(-20, 'Too negative').max(20, 'Too large'),
    floorPct: z.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%'),
  })
  .refine((v) => v.slowGoEndAge >= v.goGoEndAge, {
    message: 'Slow-Go must end on or after Go-Go',
    path: ['slowGoEndAge'],
  });
export type RetirementSettingsForm = z.infer<typeof retirementSettingsFormSchema>;
