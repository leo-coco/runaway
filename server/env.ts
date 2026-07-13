import { z } from 'zod';

/**
 * Server-side environment, validated at load. These are runtime secrets read by
 * the API (Hono functions / dev server), never exposed to the client bundle.
 * They are NOT prefixed with VITE_ on purpose: Vite must not inline them.
 */
const schema = z.object({
  /** Neon pooled connection string (postgresql://…?sslmode=require). */
  DATABASE_URL: z.string().url(),
  /** Better Auth signing secret. Generate with `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
  /** Public base URL the app is served from (used for cookies + email links). */
  BETTER_AUTH_URL: z.string().url(),
  /** Resend API key (re_…). */
  RESEND_API_KEY: z.string().min(1),
  /** Verified sender, e.g. "Retire on Model <no-reply@yourdomain.com>". */
  EMAIL_FROM: z.string().min(3),
  /** Alpha Vantage API key — US/CA stock & ETF quotes. Proxied via /api/market. */
  ALPHA_VANTAGE_API_KEY: z.string().min(1),
  /** ExchangeRate-API key — live FX rates. Proxied via /api/market. */
  EXCHANGERATE_API_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Parse + cache the server env. Throws a readable error if misconfigured. */
export const serverEnv = (): ServerEnv => {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
};
