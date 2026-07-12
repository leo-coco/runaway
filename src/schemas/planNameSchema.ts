import { z } from 'zod';

/** Validation for editing a plan's name and description. */
export const planNameFormSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required').max(80, 'Name is too long'),
  description: z.string().trim().max(200, 'Description is too long'),
});
export type PlanNameForm = z.infer<typeof planNameFormSchema>;
