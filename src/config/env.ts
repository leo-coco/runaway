import { z } from 'zod';

/**
 * Client environment configuration, validated with Zod at module load.
 *
 * Only non-secret client config lives here. Alpha Vantage and ExchangeRate keys
 * are NOT client env anymore: those calls go through the cached server proxy
 * (server/routes/market.ts), so their keys stay server-side. CoinGecko needs no
 * key. If required config is missing the app surfaces a typed configuration
 * screen instead of silently proceeding.
 */

const rawSchema = z.object({
  VITE_COINGECKO_BASE_URL: z.string().trim().url().default('https://api.coingecko.com/api/v3'),
});

export interface AppEnv {
  readonly coinGeckoBaseUrl: string;
}

export type EnvResult =
  | { readonly ok: true; readonly env: AppEnv }
  | { readonly ok: false; readonly issues: readonly string[] };

const toEnv = (raw: z.infer<typeof rawSchema>): AppEnv => ({
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
