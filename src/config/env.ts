import { z } from 'zod';

/**
 * Environment configuration, validated with Zod at module load.
 *
 * Per the architecture rules, all API keys are parsed and validated here. If a
 * required key is missing or malformed the app does not silently proceed — it
 * surfaces a typed failure that the root renders as a configuration screen.
 */

const rawSchema = z.object({
  VITE_ALPHA_VANTAGE_API_KEY: z.string().trim().min(1, 'Alpha Vantage API key is required'),
  VITE_EXCHANGERATE_API_KEY: z.string().trim().min(1, 'ExchangeRate-API key is required'),
  VITE_COINGECKO_BASE_URL: z.string().trim().url().default('https://api.coingecko.com/api/v3'),
});

export interface AppEnv {
  readonly alphaVantageApiKey: string;
  readonly exchangeRateApiKey: string;
  readonly coinGeckoBaseUrl: string;
}

export type EnvResult =
  | { readonly ok: true; readonly env: AppEnv }
  | { readonly ok: false; readonly issues: readonly string[] };

const toEnv = (raw: z.infer<typeof rawSchema>): AppEnv => ({
  alphaVantageApiKey: raw.VITE_ALPHA_VANTAGE_API_KEY,
  exchangeRateApiKey: raw.VITE_EXCHANGERATE_API_KEY,
  coinGeckoBaseUrl: raw.VITE_COINGECKO_BASE_URL,
});

/** Parse env from a record (import.meta.env by default). Pure + testable. */
export const parseEnv = (source: Record<string, unknown>): EnvResult => {
  const parsed = rawSchema.safeParse(source);
  if (parsed.success) {
    return { ok: true, env: toEnv(parsed.data) };
  }
  const issues = parsed.error.issues.map((i) => {
    const key = i.path.join('.') || '(root)';
    return `${key}: ${i.message}`;
  });
  return { ok: false, issues };
};

/** Validated env for the running app, evaluated once. */
export const ENV_RESULT: EnvResult = parseEnv(
  import.meta.env as unknown as Record<string, unknown>,
);
