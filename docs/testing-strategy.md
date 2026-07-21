# Testing strategy

Goal: guarantee that no critical regression reaches production. Every change is
gated by an automated suite before it can merge (and therefore before Vercel
deploys `main`), and a post-deploy smoke run verifies the live site afterwards.

## Layers

From fastest/most-isolated to slowest/most-integrated:

| Layer | Where | Runs on | What it proves |
| --- | --- | --- | --- |
| Domain / unit | `src/domain/**/*.test.ts` | CI + pre-push | Pure finance/tax math (brackets, RMD, growth fade, volatility) |
| Services | `src/services/**/*.test.ts` | CI + pre-push | Simulation engines: Monte Carlo, projections, drawdown/withdrawals, goal-seek, currency, search; and the DTO → domain mapping in `priceService` against fake clients |
| Chart data | `src/features/projections/chartData.test.ts` | CI + pre-push | The projection → chart series transforms: composition gaps, scenario zipping, real-estate equity joined by year |
| Reference scenarios | `src/test/reference-scenarios.test.ts` | CI + pre-push | End-to-end numbers derived independently (closed-form / hand-worked), not self-checks |
| Network boundary | `src/infrastructure/**/*.test.ts` | CI + pre-push | Clients + `getJson` + `src/schemas/api/**` against msw-served payloads: DTO contracts, malformed/partial responses, the `AppError` taxonomy |
| Data hooks | `src/hooks/**/*.test.tsx` | CI + pre-push | Hook → service → client → schema against msw, via `src/test/harness.tsx`: request batching, cache dedup, per-item error states, partial provider failure |
| Worker boundary | `src/workers/*.test.ts`, `src/hooks/use{MonteCarlo,GoalSeekWorker}.test.tsx` | CI + pre-push | The simulation worker's message protocol, and both hook paths: the synchronous fallback and the async channel (supersede, terminate, error propagation) |
| Store | `src/store/**/*.test.ts` | CI + pre-push | Plan creation, holdings/accounts, withdrawal order, persistence |
| Component smoke | `src/test/smoke.test.tsx`, `src/features/**/*.test.tsx` | CI + pre-push | Key pages render with seeded data |
| API routes | `server/**/*.test.ts` | CI + pre-push | Real Hono handlers vs an in-memory db that evaluates real `where` clauses (owner scoping, tiers, validation, rate limiting) |
| API smoke (in-process) | `server/test/smoke.api.test.ts` | CI + pre-push | The critical journey through the API: auth gate → create → reload → list → delete → entitlements |
| E2E smoke (browser) | `e2e/smoke.spec.ts` (Playwright) | Post-deploy | The real site: sign in → plan → dashboard → projection stats → portfolio breakdown → Monte Carlo verdict → reload |

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
npm run coverage   # same, plus v8 coverage over src/** and server/**, gated by thresholds
npm run test:e2e   # Playwright E2E smoke (needs a deployed URL + a test user)
```

### Coverage ratchet

`vite.config.ts` measures coverage over all of `src/**` and `server/**` (minus
tests, i18n resources, bootstrap entrypoints and the Drizzle table declarations)
and fails the run below the configured thresholds. They are set to the measured
baseline, not to an aspiration: raise them as gaps close, never lower them to
make CI green. CI and the `pre-push` hook both run `npm run coverage`, so a drop
is caught before the push rather than in review.

### Faking the network

Tests that cross the network boundary use [msw](https://mswjs.io). The shared
server lives in `src/test/msw/server.ts` and its lifecycle is wired in
`src/test/setup.ts` with `onUnhandledRequest: 'error'`, so a request no handler
matches fails the test instead of escaping to the real network. Handlers are
declared per-test via `server.use(...)`; captured upstream payload shapes live in
`src/test/fixtures/upstream.ts`. Tests that replace `globalThis.fetch` outright
(`vi.stubGlobal`) bypass msw — do that stubbing in `beforeEach`, not at module
scope, so it runs after msw's `beforeAll`.

`src/test/harness.tsx` renders a hook against the **real** service container, so
one test covers hook → service → infrastructure client → Zod schema with only
HTTP faked. Prefer it over mocking `useServices`: mocking the service layer hides
exactly the mapping bugs these tests exist to catch. Tests that touch the
persisted store must `import '@/test/installLocalStorage'` before anything that
pulls in `@/store` — jsdom ships no `Storage`, and `persist` throws on first write
without it.

### Faking the worker

jsdom has no `Worker`, which is why `useMonteCarlo` and `useGoalSeekWorker` each
carry a synchronous fallback. Left alone, tests only ever cover that fallback, so
the worker tests install a `FakeWorker` via `vi.stubGlobal('Worker', …)` whose
`respond()` / `fail()` drive `onmessage` / `onerror` by hand. The worker module
itself is tested by stubbing `self.postMessage` **before** importing it and
dispatching `MessageEvent`s: in jsdom `self` is the window, so the real
`postMessage` would re-dispatch straight back into the listener under test.

Pass a **stable** plan reference into `useMonteCarlo` from a test. Seed plans carry
random ids, so building one inside the render callback changes `inputKey` on every
render and restarts the effect forever.

### Iteration counts in tests

Simulation iteration counts are a test-runtime budget, not a fidelity setting.
v8 coverage roughly triples a hot numeric loop and a CI runner is ~3x slower
again, so a test that costs 300ms bare can pass vitest's **5s default
`testTimeout`** locally and fail on CI. Pick the count from what the test
asserts:

- **Determinism or a range** (same seed → same number, result in `[0,1]`): the
  count is irrelevant. Use a few hundred.
- **A solver** (`balanceToTarget` runs a full simulation per candidate, so the
  cost multiplies): only high enough to keep the search on the right side of the
  target.
- **A calibrated statistic** (`monteCarlo.test.ts` asserting a median within 1.5
  points of the stated CAGR): the count is load-bearing. Keep it, and give the
  test an explicit `}, 30_000)` rather than trimming the iterations.

When lowering a count, re-run the mutation check — a cheaper test that no longer
detects a broken engine has bought nothing. Also confirm the assertion isn't
already vacuous: `balanceToTarget`'s tests targeted 60% success on a fixture that
succeeds 94.5% at zero effort, so the solver "reached" the target with $30 of
capital and the tests passed on rounding dust.

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

`SMOKE_TEST_EMAIL` / `SMOKE_TEST_PASSWORD` are **required under `CI=true`**: the
smoke throws rather than skipping when they are missing, because a skipped run
reports green for a deploy nobody verified. Locally they stay optional and the
spec skips.

### What the smoke asserts

Each section checks its own characteristic content, not just that no error
boundary tripped — a section rendering blank is a regression that "nothing threw"
misses. Projection asserts three stat values carrying digits; portfolio asserts
the holdings breakdown, and a numeric total when the plan has assets; Monte Carlo
waits on `verdict.or(upsell)` and, when the plan is premium, asserts the success
rate matches `/^\d{1,3}\s*%$/`. Branch on `.or()` and `isVisible()`, never on an
immediate `count()`: the simulation runs in a worker, so a count races it and can
see neither state.

Two assertions stay conditional because the smoke opens whichever plan the test
user already has, which may be empty: the portfolio total, and the Monte Carlo
verdict (free tier renders the upsell instead). Seeding the test user with a
plan that carries holdings, on a premium tier, would let both become
unconditional.
