# Testing strategy

Goal: guarantee that no critical regression reaches production. Every change is
gated by an automated suite before it can merge (and therefore before Vercel
deploys `main`), and a post-deploy smoke run verifies the live site afterwards.

## Layers

From fastest/most-isolated to slowest/most-integrated:

| Layer | Where | Runs on | What it proves |
| --- | --- | --- | --- |
| Domain / unit | `src/domain/**/*.test.ts` | CI + pre-push | Pure finance/tax math (brackets, RMD, growth fade, volatility) |
| Services | `src/services/**/*.test.ts` | CI + pre-push | Simulation engines: Monte Carlo, projections, drawdown/withdrawals, goal-seek, currency, search |
| Reference scenarios | `src/test/reference-scenarios.test.ts` | CI + pre-push | End-to-end numbers derived independently (closed-form / hand-worked), not self-checks |
| Store | `src/store/**/*.test.ts` | CI + pre-push | Plan creation, holdings/accounts, withdrawal order, persistence |
| Component smoke | `src/test/smoke.test.tsx`, `src/features/**/*.test.tsx` | CI + pre-push | Key pages render with seeded data |
| API routes | `server/**/*.test.ts` | CI + pre-push | Real Hono handlers vs an in-memory db that evaluates real `where` clauses (owner scoping, tiers, validation, rate limiting) |
| API smoke (in-process) | `server/test/smoke.api.test.ts` | CI + pre-push | The critical journey through the API: auth gate → create → reload → list → delete → entitlements |
| E2E smoke (browser) | `e2e/smoke.spec.ts` (Playwright) | Post-deploy | The real site: sign in → create plan → dashboard → run a simulation → save → reload → sections |

## What "critical" means (the gate)

A test is **critical** if its failure must block release. In practice the entire
Vitest suite is treated as critical: `npm test` is a required CI check and is
replayed by the husky `pre-push` hook. The suite covers the business-critical
paths the product depends on:

- Financial simulations & Monte Carlo — `src/services/monteCarlo.test.ts`, `src/services/planSuccess.test.ts`
- Projections & withdrawals — `src/services/retirementCalculator.test.ts`, `src/services/drawdownSimulator.test.ts`
- Tax optimisation / withdrawal ordering — `src/services/drawdownSimulator.test.ts` (`tax-optimized`, `preserve-growth`, `risk-on-first`), `src/services/goalSeek.test.ts`
- Taxes — `src/domain/tax.test.ts`, `taxAdvantaged.test.ts`, `taxMatrix.test.ts`, `accountTaxRate.test.ts`
- Asset import / instrument resolution — `src/services/searchService.test.ts`, `src/services/instrumentRef.test.ts`, `src/services/portfolioService.test.ts`, `src/store/plansSlice.test.ts` (`addHolding`)
- Plan creation & persistence — `src/store/plansSlice.test.ts` (`createPlan`), `src/store/planStorage.test.ts`, `server/routes/plans.test.ts`, `server/test/smoke.api.test.ts`
- Security — cross-user isolation (`server/routes/plans.test.ts`), the admin gate
  (`server/routes/admin.test.ts`), and contact-form abuse defences / rate limiting
  (`server/routes/contact.test.ts`). Kept as regression tests only: this repo is
  public, so a written audit naming specific gaps stays out of version control —
  ask internally for the current writeup.

## Commands

```bash
npm test           # full Vitest suite (unit + services + store + component + API)
npm run coverage   # same, with v8 coverage over services/hooks/domain
npm run test:e2e   # Playwright E2E smoke (needs a deployed URL + a test user)
```

Local E2E against the dev server:

```bash
npm run dev:all    # web on :4321, api on :8787
SMOKE_BASE_URL=http://localhost:4321 \
SMOKE_TEST_EMAIL=<verified user> \
SMOKE_TEST_PASSWORD=<password> \
npm run test:e2e
```

## Gating (pre- and post-deploy)

Deploys go out through Vercel's Git integration on merge to `main`, so the gate
is enforced at merge time and verified after deploy:

- **Pre-deploy (blocking).** `.github/workflows/ci.yml` runs `typecheck` + `lint`
  + `test` + `build` on every PR and push to `main`. Enable branch protection on
  `main` requiring the `check` and `build` jobs to pass. A failing critical test
  then blocks the merge, and Vercel never deploys code that didn't merge.
- **Post-deploy (verification).** `.github/workflows/smoke.yml` triggers on the
  GitHub `deployment_status` event that Vercel emits. When a deployment succeeds
  it runs the Playwright smoke against the deployed `target_url`. A failure turns
  the deployment's checks red so a bad release is caught immediately.

### One-time manual setup (repo owner)

1. GitHub → Settings → Branches → add a protection rule for `main`; require the
   CI status checks (`check`, `build`) before merging.
2. Create a dedicated, email-verified test user in the target environment and add
   repo secrets: `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`. `SMOKE_BASE_URL` is
   read from the deployment event; set it as a secret only for manual runs.

## The E2E test user

Sign-up requires email verification, so the E2E signs **in** a pre-provisioned
verified user rather than registering one. Keep that user scoped to test data
(its own plans) so the smoke can create/read/delete without touching real users.
