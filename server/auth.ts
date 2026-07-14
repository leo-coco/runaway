import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/client.js';
import { authSchema } from './db/schema.js';
import { serverEnv } from './env.js';
import { sendResetPasswordEmail, sendVerificationEmail } from './email.js';

/**
 * Better Auth server instance. Owns auth logic (tokens, sessions, verification);
 * email delivery is delegated to Resend via the send* callbacks. Sessions are
 * cookie-based (httpOnly) — no token stored in the browser.
 */
export const auth = betterAuth({
  secret: serverEnv().BETTER_AUTH_SECRET,
  baseURL: serverEnv().BETTER_AUTH_URL,
  trustedOrigins: [serverEnv().BETTER_AUTH_URL],
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  user: {
    // Surface the freemium columns on the session user so the client can read
    // `session.user.tier` / `role`. Not user-writable: only the admin routes (and,
    // in phase 2, the Stripe webhook) mutate them, via direct Drizzle writes.
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'user', input: false },
      tier: { type: 'string', required: false, defaultValue: 'free', input: false },
      premiumUntil: { type: 'date', required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
});

export type Auth = typeof auth;
