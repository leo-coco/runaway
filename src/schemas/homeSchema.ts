import { z } from 'zod';

/**
 * Validation for the "Home / Real estate" form. The home is described in today's
 * money; optional mortgage, future-purchase and sale sections are gated by their
 * own toggles, so their fields are only meaningful (and cross-checked) when on.
 */
export const homeFormSchema = z
  .object({
    name: z.string().min(1, 'Enter a name'),
    currentValue: z
      .number({ message: 'Enter the value' })
      .nonnegative('Value cannot be negative')
      .max(1_000_000_000, 'That value looks too large'),
    appreciationPct: z
      .number({ message: 'Enter an appreciation rate' })
      .min(-50, 'Too negative')
      .max(50, 'Too large'),
    ownershipCostPct: z
      .number({ message: 'Enter an ownership cost' })
      .min(0, 'Cannot be negative')
      .max(20, 'Above 20% is not supported'),

    hasMortgage: z.boolean(),
    mortgageBalance: z.number().nonnegative('Cannot be negative').max(1_000_000_000),
    mortgageRatePct: z.number().min(0, 'Cannot be negative').max(30, 'Above 30% is not supported'),
    mortgageTermYears: z.number().int().min(0).max(60),

    hasPurchase: z.boolean(),
    purchaseYear: z.number().int().min(1900).max(2200),
    downPayment: z.number().nonnegative('Cannot be negative').max(1_000_000_000),
    closingCostPct: z.number().min(0, 'Cannot be negative').max(20),

    hasSale: z.boolean(),
    saleYear: z.number().int().min(1900).max(2200),
    saleFeePct: z.number().min(0, 'Cannot be negative').max(20),
    saleCapitalGainsTaxable: z.boolean(),
  })
  .refine((v) => !(v.hasSale && v.hasPurchase) || v.saleYear > v.purchaseYear, {
    message: 'Sale must be after the purchase',
    path: ['saleYear'],
  });

export type HomeForm = z.infer<typeof homeFormSchema>;
