import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

/**
 * Better Auth browser client. Same-origin: in dev Vite proxies /api to the Hono
 * server, in prod the Vercel function serves it, so the default baseURL (current
 * origin) + basePath /api/auth is correct. Sessions ride httpOnly cookies.
 */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        language: { type: 'string', input: true },
        taxResidence: { type: 'string', input: true },
      },
    }),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
