# Auth & user data — setup and deployment

User accounts + per-user saved plans. Backend: Hono API + Better Auth + Drizzle + Neon
Postgres + Resend. The backend lives outside `src/` (never bundled into the client).

## Architecture

- **Client (`src/`)**: unchanged app + `src/features/auth/*` (sign in/up, reset, sync).
  Plans stay in the Zustand store; `PlanSyncManager` hydrates from the server on
  sign-in and pushes debounced changes. Guest mode keeps localStorage.
- **API (`server/`, `api/`)**: Hono app. `/api/auth/*` = Better Auth; `/api/plans` = CRUD
  (every route scoped to the session user). Vercel entry: `api/[[...route]].ts` (Edge).
- **DB**: Neon Postgres via Drizzle (`server/db/`). Plans stored as JSONB.

## One-time setup

1. **Neon** — create a project at https://neon.com, copy the **pooled** connection
   string into `.env` → `DATABASE_URL`.
2. **Resend** — create an API key at https://resend.com into `.env` → `RESEND_API_KEY`.
   Dev sender `onboarding@resend.dev` works out of the box; for prod, verify your
   domain and set `EMAIL_FROM` accordingly.
3. **Secret** — `openssl rand -base64 32` → `.env` → `BETTER_AUTH_SECRET`.
4. **Migrate** — `npm run db:migrate` (creates the tables on Neon).

## Local development

```bash
npm run dev:all      # Vite (5173) + API (8787), Vite proxies /api to the API
```

`BETTER_AUTH_URL` should be `http://localhost:5173` in dev (already the default in `.env`).

## Deployment (Vercel)

1. Push the repo to GitHub and import it in Vercel (framework preset: Vite).
2. Add the server env vars in Vercel Project Settings → Environment Variables:
   `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (= your prod URL, e.g.
   `https://your-app.vercel.app`), `RESEND_API_KEY`, `EMAIL_FROM` (verified domain).
   Also add the existing `VITE_*` keys.
3. Deploy. The static SPA is served by Vercel; `api/[[...route]].ts` handles `/api/*`.
4. Run migrations against the prod DB once: `DATABASE_URL=<prod> npm run db:migrate`
   (or use a Neon branch per environment).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev:all` | SPA + API together (local) |
| `npm run dev:api` | API only (tsx watch) |
| `npm run db:generate` | Generate a migration from `server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:studio` | Drizzle Studio (browse the DB) |
