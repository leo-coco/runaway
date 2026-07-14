---
name: commit
description: Commit staged/unstaged changes on a well-named branch with a message describing the change. Use when the user runs /commit.
---

Steps (be terse, minimal tokens, no exploration beyond what's needed):

1. `git status` and `git diff` (staged+unstaged) to see what changed.
2. If on `main`/`master`, create a new branch: `git checkout -b <type>/<short-kebab-desc>` (type: feat/fix/chore/refactor/docs, desc from the diff). Skip if already on a feature branch.
3. `git add` the changed files (not `-A`; name them).
4. Commit with a short message (1 line, imperative, why not what) via heredoc, e.g.:
   `git commit -m "$(cat <<'EOF'\n<message>\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nEOF\n)"`
5. Report branch name and commit message only. No further narration.

Do not push, do not open a PR, do not run tests/build unless already run. Do not use -A/--all or amend.
