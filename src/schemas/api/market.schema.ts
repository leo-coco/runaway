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
      /** Absent for instrument kinds we don't classify (only ETF/MUTUALFUND drive allocation lookups). */
      type: z.enum(['EQUITY', 'ETF', 'MUTUALFUND']).optional(),
    }),
  ),
});
export type MarketSearch = z.infer<typeof marketSearchSchema>;

/**
 * Fund/ETF composition from Yahoo's topHoldings + fundProfile modules. Absent
 * (null) for individual equities, which carry neither module.
 */
export const marketAllocationSchema = z.object({
  stockPct: z.number().nullable(),
  bondPct: z.number().nullable(),
  cashPct: z.number().nullable(),
  otherPct: z.number().nullable(),
  preferredPct: z.number().nullable(),
  convertiblePct: z.number().nullable(),
  categoryName: z.string().nullable(),
  fundFamily: z.string().nullable(),
  sectorWeightings: z.array(z.object({ sector: z.string(), weightPct: z.number() })),
});
export type MarketAllocation = z.infer<typeof marketAllocationSchema>;
