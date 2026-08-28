#!/usr/bin/env bash
# Build the site exactly like the dev runtime (ruby:3.4 + nodejs, docker),
# per AGENTS.md — with the test fixtures (test/fixtures/posts) temporarily
# copied into _posts/ so the built _site includes them. The copies are
# removed again when this script exits (trap, incl. on failure).
# Used by `npm test` locally; CI builds with plain jekyll on a ruby 3.4
# runner and copies the fixtures itself.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found — install Docker, or run tests against a manually built _site with SKIP_BUILD=1" >&2
  exit 1
fi

node test/fixtures.mjs copy
trap 'node test/fixtures.mjs clean' EXIT

# JEKYLL_ENV=production mirrors CI/Pages; no difference today (goat_counter
# is unset) but keeps the environments honest.
docker compose run --rm -e JEKYLL_ENV=production web bundle exec jekyll build -d /app/test/.test-site