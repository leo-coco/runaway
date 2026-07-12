import { z } from 'zod';
import { COUNTRIES } from '@/domain/country';

/**
 * Bounds for the user-editable tax fields of an account. The engines also clamp
 * at runtime (defence in depth), but this is the declarative source of truth for
 * what a valid account looks like — used by `sanitizeAccountTaxFields` callers
 * and available to any future account form.
 */
export const accountTaxFieldsSchema = z.object({
  /** Cost-basis share of a taxable account (percent of current value). */
  costBasisPct: z.number().min(0).max(100).optional(),
  /** Home-country special flat rate (percent) — assurance-vie, PEE, PEA… */
  reducedRatePct: z.number().min(0).max(99).optional(),
  /** Legacy manual marginal rate (percent). */
  taxRatePct: z.number().min(0).max(99).optional(),
  /** Legacy manual inclusion rate (percent). */
  taxableBasePct: z.number().min(0).max(100).optional(),
  kind: z.enum(['tax_deferred', 'tax_free', 'taxable']).optional(),
  sourceCountry: z.enum(COUNTRIES).optional(),
  taxMode: z.enum(['manual', 'auto']).optional(),
});

export type AccountTaxFields = z.infer<typeof accountTaxFieldsSchema>;
