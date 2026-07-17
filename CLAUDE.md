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

## Critical logic changes (Monte Carlo, fiscalité, calculs, hypothèses)
- Toute modification touchant la logique Monte Carlo, la fiscalité, les calculs de projection, ou les hypothèses/fonctionnalités critiques de l'application doit se refléter visuellement quelque part dans l'UI existante : mise à jour d'une bulle d'info existante, ajout d'une nouvelle bulle d'info, ou mise à jour de la page méthodologie.
- Ne pas se contenter d'un changement silencieux en arrière-plan : identifier l'endroit pertinent (tooltip existant, nouvelle bulle, ou page méthodologie) et proposer/appliquer la mise à jour dans le même changement.
- 

## Database migrations
- Migrations run automatically on deploy (`vercel-build` runs `drizzle-kit migrate` before the app build), so they must be safe to apply against a running prod instance with no downtime.
- Always additive-first: add new columns as nullable or with a default; never add a `NOT NULL` column without a default in the same migration as a deploy that depends on it. If a column must become `NOT NULL`, do it in a later migration after the backfill/rollout has landed.
- Never rename or drop a column/table in the same deploy that stops using it — the previous deployed instance (or a rollback) may still read/write the old shape during the rollout.
