#!/usr/bin/env bash
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"

if [ "$branch" = "main" ]; then
  exit 0
fi

pattern='^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)/[a-z0-9]+(-[a-z0-9]+)*$'

if ! printf '%s' "$branch" | grep -qE "$pattern"; then
  echo "invalid branch name: $branch"
  echo "expected <type>/<kebab-case>, e.g. feat/button-ghost-variant"
  echo "types: build chore ci docs feat fix perf refactor revert style test"
  exit 1
fi
