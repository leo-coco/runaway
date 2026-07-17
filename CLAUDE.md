## Approach
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.
- Default to no comments in code. Only add one when the WHY is non-obvious (a hidden constraint, a subtle invariant, a workaround for a specific bug). Never write a comment that just restates what the code already says.

## Git workflow
- When making the first commit for a feature branch, open the PR automatically right after the commit (no need to ask).

## Premium features in local dev
- If a task needs to render/exercise a feature gated behind the `premium` tier (see `src/domain/entitlements.ts`), don't touch real accounts or `tier_config`. Instead, temporarily patch `src/hooks/useEntitlements.ts` so sandbox mode (`useAppMode().sandbox`) resolves to premium, e.g.:
  ```ts
  // TEMP(<task-name>): unlock premium in sandbox to render Pro surfaces. REMOVE.
  const SANDBOX_PREMIUM: Entitlements = resolveEntitlements('premium', null, DEFAULT_TIER_CONFIG);
  ```
  and swap it in for the sandbox branch of `useEntitlements`/`useEntitlementsReady` (currently `sandbox ? GUEST_FALLBACK : ...`).
- Tag the override with a `TEMP(<task-name>): ... REMOVE.` comment so it's greppable and clearly not meant to ship.
- Before wrapping up the task, remove the override entirely (`git diff` on `useEntitlements.ts` should come back empty relative to the base branch) and re-verify sandbox mode renders the free tier again.

## Database migrations
- Migrations run automatically on deploy (`vercel-build` runs `drizzle-kit migrate` before the app build), so they must be safe to apply against a running prod instance with no downtime.
- Always additive-first: add new columns as nullable or with a default; never add a `NOT NULL` column without a default in the same migration as a deploy that depends on it. If a column must become `NOT NULL`, do it in a later migration after the backfill/rollout has landed.
- Never rename or drop a column/table in the same deploy that stops using it — the previous deployed instance (or a rollback) may still read/write the old shape during the rollout.
