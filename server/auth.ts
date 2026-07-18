import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db/client.js';
import { authSchema, verification } from './db/schema.js';
import { serverEnv } from './env.js';
import { sendResetPasswordEmail, sendVerificationEmail } from './email.js';

const languageSchema = z.enum(['en', 'fr']);

const env = serverEnv();

/**
 * Vercel provides the unique URL of each Preview deployment at runtime. Trust
 * only that exact origin so sign-in works from previews without accepting all
 * `*.vercel.app` applications.
 */
const previewDeploymentOrigin =
  process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;

const trustedOrigins = [env.BETTER_AUTH_URL, previewDeploymentOrigin].filter(
  (origin): origin is string => Boolean(origin),
);

/** Reads the additionalFields `language` off a Better Auth user via the same schema that validates it on input. */
const userLanguage = (user: Record<string, unknown>): 'en' | 'fr' | undefined =>
  languageSchema.safeParse(user.language).data;

/**
 * Better Auth server instance. Owns auth logic (tokens, sessions, verification);
 * email delivery is delegated to Resend via the send* callbacks. Sessions are
 * cookie-based (httpOnly) — no token stored in the browser.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  // Keep the canonical URL for absolute links sent by email. The active Vercel
  // Preview origin is added separately above for browser-origin validation.
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins,
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  user: {
    // Surface the freemium columns on the session user so the client can read
    // `session.user.tier` / `role`. Not user-writable: only the admin routes (and,
    // in phase 2, the Stripe webhook) mutate them, via direct Drizzle writes.
    additionalFields: {
      // Accepted on sign-up and through updateUser; the email callbacks below
      // receive this value from the freshly created user.
      language: {
        type: 'string',
        required: false,
        defaultValue: 'en',
        input: true,
        validator: { input: languageSchema },
      },
      taxResidence: {
        type: 'string',
        required: false,
        defaultValue: 'US',
        input: true,
        validator: { input: z.enum(['FR', 'US', 'CA']) },
      },
      role: { type: 'string', required: false, defaultValue: 'user', input: false },
      tier: { type: 'string', required: false, defaultValue: 'free', input: false },
      premiumUntil: { type: 'date', required: false, input: false },
    },
    // Foreign keys cascade to plans, sessions and login accounts. Password-reset
    // verification rows use the user id as a value rather than a foreign key, so
    // remove them explicitly as part of the same account-deletion operation.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await db.delete(verification).where(eq(verification.value, user.id));
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url, userLanguage(user));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url, userLanguage(user));
    },
  },
});

export type Auth = typeof auth;
