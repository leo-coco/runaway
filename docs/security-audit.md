# Security audit

Scope: authentication, authorization, cross-user data access, input validation,
API protections, rate limiting. Each item lists the control, where it lives, and
the automated test that locks it against regression. Status is one of **OK**
(control in place + tested), **OK (untested edge)**, or **Action**.

Date: 2026-07-17. Re-run this review whenever a new route or a new stored field
is added.

## Summary

The API is small (Hono, `server/app.ts`) and the security-sensitive surface is
well covered. Owner scoping, the auth/admin gates, input validation, the contact
anti-abuse defences and Stripe webhook signature verification all have
regression tests driving the real handlers. No cross-user data-access defect was
found. Recommendations below are hardening, not fixes.

## 1. Authentication

- **Control.** Better Auth owns `/api/auth/*` (`server/app.ts`). Every owner-scoped
  route re-checks the session server-side via `auth.api.getSession()` and returns
  401 when absent — see the gate in `server/routes/plans.ts:58` and `admin.ts`.
  The client never asserts identity; the server does.
- **Tests.** `server/routes/plans.test.ts` (`authentication` → 401 on GET/PUT/DELETE);
  `server/routes/admin.test.ts` (`401s without a session`).
- **Status: OK.**

## 2. Authorization (roles)

- **Control.** Admin routes run a real `isAdmin` gate before any handler; a
  signed-in non-admin gets 403 (`server/routes/admin.ts`).
- **Tests.** `server/routes/admin.test.ts` (`403s a non-admin on %s %s` across
  GET/PUT `/config`, GET `/users`, PATCH `/users/:id`).
- **Status: OK.**

## 3. Cross-user data access (the critical one)

- **Control.** Every `plans` query is scoped to the caller: reads/deletes use
  `and(eq(plans.id, …), eq(plans.userId, caller))`, and the upsert guards the
  overwrite with `onConflictDoUpdate.setWhere: eq(plans.userId, caller)` so a
  collision on another user's plan id updates nothing (returns 409), never
  leaking or clobbering their row (`server/routes/plans.ts:76-178`). The plan-cap
  count is also user-scoped so one user's volume can't gate another's.
- **Tests.** `server/routes/plans.test.ts` → `cross-user isolation`: list returns
  only the caller's rows; GET on another user's plan 404s; DELETE on another
  user's plan is a no-op; PUT on another user's id can't overwrite (409). The
  in-memory `fakeDb` (`server/test/fakeDb.ts`) evaluates the real `where` clauses,
  so a dropped `eq(userId)` fails the test rather than being replayed past.
- **Status: OK.**

## 4. Input validation

- **Control.** Request bodies are parsed with Zod before use and rejected 400 on
  failure: plan upsert (`upsertSchema`, plus an explicit id-mismatch 400) in
  `plans.ts:25`; admin tier config and user PATCH in `admin.ts`; contact form in
  `contact.ts:25`. Stored plan `data` is treated as an opaque JSONB blob,
  encrypted at rest (see §7), never interpolated into SQL (Drizzle parameterises).
- **Tests.** `plans.test.ts` (`PUT validation`: malformed body, id mismatch);
  `admin.test.ts` (`rejects an invalid config`, `rejects an invalid patch`);
  `contact.test.ts` (`validation`: malformed body, non-JSON body).
- **Status: OK.**

## 5. API protections (abuse / spoofing)

- **Control.** The contact form is an open (guest-allowed) route that sends a
  billed email, so it carries a hidden honeypot and a per-IP rate limit, and a
  signed-in sender's identity overrides the posted name/email so a message can't
  be attributed to an address they don't own (`contact.ts`). Stripe webhooks are
  verified by signature (`webhooks.constructEventAsync`) in `billing.ts` before
  any DB mutation.
- **Tests.** `contact.test.ts` (`honeypot`, `identity substitution`,
  `delivery failure` 502); `billing.test.ts` drives the webhook path with the
  signature check mocked at the SDK boundary.
- **Status: OK.**

## 6. Rate limiting

- **Control.** `server/lib/rateLimit.ts` is a DB-backed fixed-window IP limiter
  (single atomic upsert, so the counter survives serverless cold starts and can't
  lose increments to a race). Applied to `contact` and `market`. Better Auth's
  own limiter covers `/api/auth/*`.
- **Tests.** `contact.test.ts` (`rate limiting`: 429 once exceeded; IP bucketing
  by first `x-forwarded-for` hop; shared bucket when IP unknown). The limiter's
  own SQL `CASE` (window roll-forward) is exercised behaviourally through the
  handler, not unit-tested in isolation — a real Postgres would be needed to test
  the raw `sql` template, which the in-memory fake does not interpret.
- **Status: OK (untested edge).** The window-expiry branch has no isolated test;
  see recommendations.

## 7. Data at rest

- **Control.** Plan `name` and `data` are encrypted before storage
  (`server/crypto/dataCrypto.ts`); reads decrypt, with legacy plaintext rows
  passing through for backward compatibility (`plans.ts:31-53`).
- **Tests.** `server/crypto/dataCrypto.test.ts`; `plans.test.ts` asserts stored
  rows are envelopes (never plaintext) and that legacy rows still read.
- **Status: OK.**

## Recommendations (hardening, non-blocking)

1. **Rate-limiter window expiry.** Add an integration test against a real/ephemeral
   Postgres (or a `sql`-aware fake) covering the roll-forward branch of
   `hitRateLimit` so the reset-after-expiry path is regression-locked. Low
   priority: the branch is simple and behaviourally covered.
2. **Rate-limit coverage.** Consider extending the per-IP limit to other
   guest-reachable POST routes if any are added; today only `contact`/`market`
   need it.
3. **Security headers.** Consider a minimal set of response headers (e.g.
   `X-Content-Type-Options: nosniff`, a restrictive CSP) at the edge for the app
   shell. Out of scope for the API tests but worth a follow-up.
