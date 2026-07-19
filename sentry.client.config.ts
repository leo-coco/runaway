import * as Sentry from '@sentry/astro';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

// Optional: error reporting stays off entirely if no DSN is configured (e.g.
// local dev, guest-only deployments). No session replay, no PII forwarded.
if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
  });
}
