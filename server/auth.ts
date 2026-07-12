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
