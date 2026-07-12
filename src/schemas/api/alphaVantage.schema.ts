import { z } from 'zod';

/**
 * Alpha Vantage returns a `Note`/`Information` field instead of an error status
 * when throttled, so schemas tolerate those and the client inspects them.
 */
export const alphaVantageSearchSchema = z.object({
  bestMatches: z
    .array(
      z.object({
        '1. symbol': z.string(),
        '2. name': z.string(),
        '3. type': z.string(),
        '4. region': z.string(),
        '8. currency': z.string(),
      }),
    )
    .optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
});
export type AlphaVantageSearch = z.infer<typeof alphaVantageSearchSchema>;

export const alphaVantageQuoteSchema = z.object({
  'Global Quote': z
    .object({
      '01. symbol': z.string(),
      '05. price': z.string(),
    })
    .optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
});
export type AlphaVantageQuote = z.infer<typeof alphaVantageQuoteSchema>;
