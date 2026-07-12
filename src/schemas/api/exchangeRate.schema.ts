import { z } from 'zod';

/** Response schema for GET /v6/{key}/latest/{base} (ExchangeRate-API). */
export const exchangeRateLatestSchema = z.object({
  result: z.string(),
  base_code: z.string(),
  conversion_rates: z.record(z.string(), z.number()),
  'error-type': z.string().optional(),
});
export type ExchangeRateLatest = z.infer<typeof exchangeRateLatestSchema>;
