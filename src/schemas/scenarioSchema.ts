import { z } from 'zod';
import type { TFunction } from 'i18next';

/** Validation for the "Edit Price Projection Scenario" form. */
export const createScenarioFormSchema = (t: TFunction) =>
  z.object({
    active: z.enum(['conservative', 'expected', 'optimistic']),
    conservativeAdjustmentPts: z
      .number({ message: t('validation.scenario.enterAdjustment') })
      .min(0, t('validation.scenario.useAPositiveAuto'))
      .max(50, t('validation.scenario.adjustmentTooLarge')),
    optimisticAdjustmentPts: z
      .number({ message: t('validation.scenario.enterAdjustment') })
      .min(0, t('validation.scenario.useAPositive'))
      .max(50, t('validation.scenario.adjustmentTooLarge')),
  });
export type ScenarioForm = z.infer<ReturnType<typeof createScenarioFormSchema>>;
