import { z } from 'zod';

/** Response schema for GET /search (CoinGecko). */
export const coinGeckoSearchSchema = z.object({
  coins: z.array(
    z.object({
      id: z.string(),
      symbol: z.string(),
      name: z.string(),
      market_cap_rank: z.number().nullable().optional(),
    }),
  ),
});
export type CoinGeckoSearch = z.infer<typeof coinGeckoSearchSchema>;

/**
 * Response schema for GET /simple/price?ids=...&vs_currencies=...
 * Shape: { [coinId]: { [currency]: number } }
 */
export const coinGeckoPriceSchema = z.record(z.string(), z.record(z.string(), z.number()));
export type CoinGeckoPrice = z.infer<typeof coinGeckoPriceSchema>;
