import { z } from 'zod';
import type { TFunction } from 'i18next';

/**
 * Validation for the "Rental property" form. The property is described in today's
 * money; optional mortgage, future-purchase and sale sections are gated by their
 * own toggles, so their fields are only meaningful (and cross-checked) when on.
 * Mirrors {@link createHomeFormSchema}, plus the rental-specific rent/vacancy/
 * operating-cost fields. Takes `t` (localized messages rendered in the form) and
 * `startYear` (a purchase/sale can't predate the plan).
 */
export const createRentalPropertyFormSchema = (t: TFunction, startYear: number) =>
  z
    .object({
      name: z.string().min(1, t('validation.rental.enterName')),
      currentValue: z
        .number({ message: t('validation.rental.enterValue') })
        .nonnegative(t('validation.common.cannotBeNegative'))
        .max(1_000_000_000, t('validation.rental.valueTooLarge')),
      appreciationPct: z
        .number({ message: t('validation.rental.enterAppreciation') })
        .min(-50, t('validation.common.tooNegative'))
        .max(50, t('validation.common.tooLarge')),

      monthlyRent: z
        .number({ message: t('validation.rental.enterRent') })
        .nonnegative(t('validation.common.cannotBeNegative'))
        .max(10_000_000, t('validation.rental.rentTooLarge')),
      rentInflationPct: z
        .number({ message: t('validation.rental.enterRentInflation') })
        .min(-50, t('validation.common.tooNegative'))
        .max(50, t('validation.common.tooLarge')),
      vacancyPct: z
        .number({ message: t('validation.rental.enterVacancy') })
        .min(0, t('validation.common.cannotBeNegative'))
        .max(100, t('validation.rental.vacancyTooLarge')),
      managementFeePct: z.number().min(0, t('validation.common.cannotBeNegative')).max(50),
      propertyTaxAnnual: z
        .number()
        .nonnegative(t('validation.common.cannotBeNegative'))
        .max(1_000_000_000),
      maintenancePct: z
        .number()
        .min(0, t('validation.common.cannotBeNegative'))
        .max(20, t('validation.common.aboveNotSupported', { max: 20 })),
      insuranceAnnual: z
        .number()
        .nonnegative(t('validation.common.cannotBeNegative'))
        .max(1_000_000_000),
      taxMode: z.enum(['net', 'gross']),

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
      saleProceedsReinvest: z.enum(['spread', 'cash']),
      costBasis: z.number().nonnegative(t('validation.common.cannotBeNegative')).max(1_000_000_000),
    })
    .refine((v) => !(v.hasSale && v.hasPurchase) || v.saleYear > v.purchaseYear, {
      message: t('validation.rental.saleAfterPurchase'),
      path: ['saleYear'],
    })
    .refine((v) => !v.hasPurchase || v.purchaseYear >= startYear, {
      message: t('validation.rental.purchaseNotPast'),
      path: ['purchaseYear'],
    })
    .refine((v) => !v.hasSale || v.saleYear >= startYear, {
      message: t('validation.rental.saleNotPast'),
      path: ['saleYear'],
    });

export type RentalPropertyForm = z.infer<ReturnType<typeof createRentalPropertyFormSchema>>;
