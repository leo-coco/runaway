import { z } from 'zod';
import { ASSET_CLASSES } from '@/domain/assetClass';
import { SUPPORTED_CURRENCIES } from '@/domain/money';

/** Validation for adding a holding. Price is fetched, quantity is user-entered. */
export const addAssetFormSchema = z.object({
  instrumentId: z.string().min(1, 'Select an asset from the search results'),
  symbol: z.string().min(1),
  name: z.string().min(1),
  exchange: z.string().min(1),
  assetClass: z.enum(ASSET_CLASSES),
  nativeCurrency: z.enum(SUPPORTED_CURRENCIES),
  quantity: z
    .number({ message: 'Enter a quantity' })
    .positive('Quantity must be greater than zero'),
  pricePerUnit: z.number().nonnegative(),
  expectedCagrPct: z
    .number({ message: 'Enter an expected CAGR' })
    .min(-100, 'CAGR cannot be below -100%')
    .max(200, 'CAGR above 200% is not supported'),
});
export type AddAssetForm = z.infer<typeof addAssetFormSchema>;
