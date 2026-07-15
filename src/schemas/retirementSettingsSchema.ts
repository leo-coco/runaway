import { z } from 'zod';
import type { TFunction } from 'i18next';

/** Validation for the "Edit Retirement Settings" form. */
export const createRetirementSettingsFormSchema = (t: TFunction) =>
  z
    .object({
      expensePeriod: z.enum(['monthly', 'yearly']),
      // Stored/edited as an annual figure; the form converts monthly entry to annual.
      annualSpending: z
        .number({ message: t('validation.retirementSettings.enterSpending') })
        .nonnegative(t('validation.retirementSettings.spendingCannotBeNegative'))
        .max(100_000_000, t('validation.retirementSettings.spendingTooLarge')),
      inflationPct: z
        .number({ message: t('validation.retirementSettings.enterInflation') })
        .min(0, t('validation.retirementSettings.inflationCannotBeNegative'))
        .max(50, t('validation.retirementSettings.inflationTooHigh')),
      spendingMode: z.enum(['linear', 'phased']),
      goGoEndAge: z.number().int().min(1).max(120),
      slowGoEndAge: z.number().int().min(1).max(120),
      slowGoAdjustmentPct: z
        .number()
        .min(-20, t('validation.common.tooNegative'))
        .max(20, t('validation.common.tooLarge')),
      noGoAdjustmentPct: z
        .number()
        .min(-20, t('validation.common.tooNegative'))
        .max(20, t('validation.common.tooLarge')),
      floorPct: z
        .number()
        .min(0, t('validation.common.cannotBeNegative'))
        .max(100, t('validation.retirementSettings.cannotExceed100')),
    })
    .refine((v) => v.slowGoEndAge >= v.goGoEndAge, {
      message: t('validation.retirementSettings.slowGoAfterGoGo'),
      path: ['slowGoEndAge'],
    });
export type RetirementSettingsForm = z.infer<ReturnType<typeof createRetirementSettingsFormSchema>>;
