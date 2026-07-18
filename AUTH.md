# Auth & user data — setup and deployment

User accounts + per-user saved plans, gated by a freemium tier system. Backend: Hono API +
Better Auth + Drizzle + Neon Postgres + Resend. The backend lives outside `src/` (never
bundled into the client).

## Architecture

- **Client (`src/`)**: unchanged app + `src/features/auth/*` (sign in/up, reset, sync).
  Plans stay in the Zustand store; `PlanSyncManager` hydrates from the server on
  sign-in and pushes debounced changes. Guest mode keeps localStorage.
- **API (`server/`, `api/`)**: Hono app (`server/app.ts`).
  - `/api/auth/*` — Better Auth (`server/auth.ts`): cookie-based sessions, email+password
    with required verification, reset-password/verification emails via Resend
    (`server/email.ts`). The session user carries two admin/billing-only fields
    (`role`, `tier`, `premiumUntil`) as Better Auth `additionalFields` — not
    user-writable, only set via direct Drizzle writes from the admin routes (Stripe
    webhook in phase 2).
  - `/api/plans` — CRUD, every route scoped to the session user. Plan name and data are
    encrypted at rest (`server/routes/plans.ts`, AES-256 via `DATA_ENCRYPTION_KEY`).
  - `/api/entitlements` — resolves the caller's effective entitlements (guests get free
    defaults) from `tier_config` (`server/entitlements.ts`).
  - `/api/admin` — tier-config editing + manual tier grants, gated on `role === 'admin'`
    inside the route (`server/routes/admin.ts`).
  - `/api/market` — equities (Yahoo, keyless) + FX (ExchangeRate-API, keyed) proxy, so
    provider keys never reach the client bundle; responses cached in Postgres
    (`server/routes/market.ts`, `server/lib/cachedFetch.ts`).
  - `/api/contact` — footer contact form → `CONTACT_EMAIL_TO` mailbox, open to guests
    (`server/routes/contact.ts`).
  - Vercel entry: `api/[...route].ts`, a single **Node.js** serverless function (`export
    const config = { runtime: 'nodejs' }`) — not Edge. Better Auth's Drizzle adapter
    pulls in modules the Edge runtime doesn't support.
- **DB**: Neon Postgres via Drizzle (`server/db/`). Plans stored as encrypted JSONB.

## One-time setup

1. **Neon** — create a project at https://neon.com, copy the **pooled** connection
   string into `.env` → `DATABASE_URL`.
2. **Resend** — create an API key at https://resend.com into `.env` → `RESEND_API_KEY`.
   Dev sender `onboarding@resend.dev` works out of the box; for prod, verify your
   domain and set `EMAIL_FROM` accordingly.
3. **Secrets** — `openssl rand -base64 32` → `.env` → `BETTER_AUTH_SECRET`, and again for
   `DATA_ENCRYPTION_KEY` (must differ from `BETTER_AUTH_SECRET`; store it in a secret
   manager — if lost, all stored plan data is permanently unrecoverable).
4. **Contact mailbox** — set `.env` → `CONTACT_EMAIL_TO` (where the footer contact form
   delivers to).
5. **ExchangeRate-API** — free key at https://www.exchangerate-api.com/ → `.env` →
   `EXCHANGERATE_API_KEY` (equities need no key; Yahoo is used directly).
6. **Migrate** — `npm run db:migrate` (creates the tables on Neon).

## Local development

```bash
npm run dev:all      # Vite (5173) + API (8787), Vite proxies /api to the API
```

`BETTER_AUTH_URL` should be `http://localhost:5173` in dev (already the default in `.env`).

## Deployment (Vercel)

1. Push the repo to GitHub and import it in Vercel (framework preset: Vite).
2. Add the server env vars in Vercel Project Settings → Environment Variables:
   `DATABASE_URL`, `BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `BETTER_AUTH_URL`
   (= your prod URL, e.g. `https://your-app.vercel.app`), `RESEND_API_KEY`, `EMAIL_FROM`
   (verified domain), `CONTACT_EMAIL_TO`, `EXCHANGERATE_API_KEY`. Also add the existing
   `VITE_*` keys. Enable **Automatically expose System Environment Variables** so Preview
   deployments receive `VERCEL_URL`; Better Auth then trusts that deployment's exact origin
   without opening authentication to every `*.vercel.app` domain.
3. Deploy. The static SPA is served by Vercel; `api/[...route].ts` (Node.js function)
   handles `/api/*`. Migrations run automatically as part of the build: `vercel-build`
   runs `drizzle-kit migrate` before `tsc -b && vite build`, so every migration must be
   safe to apply against a running prod instance with no downtime (additive-first —
   see `CLAUDE.md`).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev:all` | SPA + API together (local) |
| `npm run dev:api` | API only (tsx watch) |
| `npm run db:generate` | Generate a migration from `server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:studio` | Drizzle Studio (browse the DB) |
| `npm run vercel-build` | Build hook: migrate → typecheck → build (Vercel runs this) |
