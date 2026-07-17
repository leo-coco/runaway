import { z } from 'zod';
import type { TFunction } from 'i18next';

/**
 * Validation for the "Home / Real estate" form. The home is described in today's
 * money; optional mortgage, future-purchase and sale sections are gated by their
 * own toggles, so their fields are only meaningful (and cross-checked) when on.
 * Takes `t` because messages are rendered directly in the form (localized), and
 * `startYear` so a purchase/sale can't be dated before the plan even starts.
 */
export const createHomeFormSchema = (t: TFunction, startYear: number) =>
  z
    .object({
      name: z.string().min(1, t('validation.home.enterName')),
      currentValue: z
        .number({ message: t('validation.home.enterValue') })
        .nonnegative(t('validation.common.cannotBeNegative'))
        .max(1_000_000_000, t('validation.home.valueTooLarge')),
      appreciationPct: z
        .number({ message: t('validation.home.enterAppreciation') })
        .min(-50, t('validation.common.tooNegative'))
        .max(50, t('validation.common.tooLarge')),
      ownershipCostPct: z
        .number({ message: t('validation.home.enterOwnershipCost') })
        .min(0, t('validation.common.cannotBeNegative'))
        .max(20, t('validation.common.aboveNotSupported', { max: 20 })),

      hasMortgage: z.boolean(),
      mortgageBalance: z
        .number()
        .nonnegative(t('validation.common.cannotBeNegative'))
        .max(1_000_000_000),
      mortgageRatePct: z
        .number()
        .min(0, t('validation.common.cannotBeNegative'))
        .max(30, t('validation.common.aboveNotSupported', { max: 30 })),
      mortgageTermYears: z.number().int().min(0).max(60),

      hasPurchase: z.boolean(),
      purchaseYear: z.number().int().min(1900).max(2200),
      downPayment: z
        .number()
        .nonnegative(t('validation.common.cannotBeNegative'))
        .max(1_000_000_000),
      closingCostPct: z.number().min(0, t('validation.common.cannotBeNegative')).max(20),

      hasSale: z.boolean(),
      saleYear: z.number().int().min(1900).max(2200),
      saleFeePct: z.number().min(0, t('validation.common.cannotBeNegative')).max(20),
      saleCapitalGainsTaxable: z.boolean(),
      costBasis: z.number().nonnegative(t('validation.common.cannotBeNegative')).max(1_000_000_000),
    })
    .refine((v) => !(v.hasSale && v.hasPurchase) || v.saleYear > v.purchaseYear, {
      message: t('validation.home.saleAfterPurchase'),
      path: ['saleYear'],
    })
    .refine((v) => !v.hasPurchase || v.purchaseYear >= startYear, {
      message: t('validation.home.purchaseNotPast'),
      path: ['purchaseYear'],
    })
    .refine((v) => !v.hasSale || v.saleYear >= startYear, {
      message: t('validation.home.saleNotPast'),
      path: ['saleYear'],
    });

export type HomeForm = z.infer<ReturnType<typeof createHomeFormSchema>>;
