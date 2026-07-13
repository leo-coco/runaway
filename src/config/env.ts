import { z } from 'zod';

/**
 * Environment configuration, validated with Zod at module load.
 *
 * Only non-secret client config lives here. The Alpha Vantage and
 * ExchangeRate-API keys are secrets and are held server-side (see
 * server/env.ts + server/routes/market.ts); the client reaches those providers
 * through the same-origin /api/market proxy. CoinGecko needs no key, so its
 * (overridable) base URL stays a client value.
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
