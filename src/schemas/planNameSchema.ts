import { z } from 'zod';
import type { TFunction } from 'i18next';

/** Validation for editing a plan's name and description. */
export const createPlanNameFormSchema = (t: TFunction) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t('validation.planName.nameRequired'))
      .max(80, t('validation.planName.nameTooLong')),
    description: z.string().trim().max(200, t('validation.planName.descriptionTooLong')),
  });
export type PlanNameForm = z.infer<ReturnType<typeof createPlanNameFormSchema>>;
