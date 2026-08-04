#!/usr/bin/env bash
set -euo pipefail

# lefthook consumes the stdin git uses to report the refs being pushed, so the
# checked-out branch is the only signal available here. A detached HEAD has no
# branch name to validate, so it is skipped rather than rejected.
branch="$(git symbolic-ref --quiet --short HEAD || true)"

if [ -z "$branch" ] || [ "$branch" = "main" ]; then
  exit 0
fi

pattern='^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)/[a-z0-9]+(-[a-z0-9]+)*$'

if ! printf '%s' "$branch" | grep -qE "$pattern"; then
  echo "invalid branch name: $branch"
  echo "expected <type>/<kebab-case>, e.g. feat/button-ghost-variant"
  echo "types: build chore ci docs feat fix perf refactor revert style test"
  exit 1
fi
