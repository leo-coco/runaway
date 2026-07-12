import { z } from 'zod';

/** Validation for the "Edit Price Projection Scenario" form. */
export const scenarioFormSchema = z.object({
  active: z.enum(['conservative', 'expected', 'optimistic']),
  conservativeAdjustmentPts: z
    .number({ message: 'Enter an adjustment' })
    .min(0, 'Use a positive number; it is subtracted automatically')
    .max(50, 'Adjustment too large'),
  optimisticAdjustmentPts: z
    .number({ message: 'Enter an adjustment' })
    .min(0, 'Use a positive number')
    .max(50, 'Adjustment too large'),
});
export type ScenarioForm = z.infer<typeof scenarioFormSchema>;
