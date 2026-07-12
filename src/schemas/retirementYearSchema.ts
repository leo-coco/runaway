import { z } from 'zod';

const currentYear = new Date().getFullYear();

/** Validation for the "Edit Retirement Year" form. */
export const retirementYearFormSchema = z.object({
  retirementYear: z
    .number({ message: 'Enter a year' })
    .int('Year must be a whole number')
    .min(currentYear, `Retirement year must be ${currentYear} or later`)
    .max(currentYear + 80, 'That year is too far out'),
  currentAge: z
    .number({ message: 'Enter your current age' })
    .int('Age must be a whole number')
    .min(0, 'Age cannot be negative')
    .max(120, 'That age is too high'),
});
export type RetirementYearForm = z.infer<typeof retirementYearFormSchema>;
