import { z } from 'zod';

/** Maximum number of unique equity symbols accepted by one batch request. */
export const MAX_EQUITY_BATCH_SYMBOLS = 20;

/**
 * Provider-neutral market DTOs. The upstream vendor (see server/routes/market.ts)
 * is mapped into these shapes server-side, so no provider-specific field naming
 * reaches the client.
 */
export const marketQuoteSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  currency: z.string(),
  exchange: z.string(),
  /** Quote timestamp, epoch ms. */
  asOf: z.number(),
});
export type MarketQuote = z.infer<typeof marketQuoteSchema>;

/** Batch quotes. Symbols the provider does not know are simply absent. */
export const marketQuotesSchema = z.object({
  quotes: z.array(marketQuoteSchema),
});
export type MarketQuotes = z.infer<typeof marketQuotesSchema>;

export const marketSearchSchema = z.object({
  results: z.array(
    z.object({
      symbol: z.string(),
      name: z.string(),
      exchange: z.string(),
      currency: z.string(),
    }),
  ),
});
export type MarketSearch = z.infer<typeof marketSearchSchema>;
