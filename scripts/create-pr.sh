#!/bin/bash
# Usage: ./scripts/create-pr.sh "Branch name" "PR title" "PR description"

BRANCH_NAME="${1:-feature/update}"
PR_TITLE="${2:-Update}"
PR_DESCRIPTION="${3:-}"

# Create and push branch
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
git add .
git commit -m "$PR_TITLE" -q 2>/dev/null || echo "No changes to commit"
git push -u origin "$BRANCH_NAME" -q

# Create PR
gh pr create --title "$PR_TITLE" --body "$PR_DESCRIPTION" --fill
