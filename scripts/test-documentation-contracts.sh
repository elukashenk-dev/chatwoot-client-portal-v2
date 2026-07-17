#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_LOG="$ROOT_DIR/docs/roadmap/work-log.md"
ARCHITECTURE_OVERVIEW="$ROOT_DIR/docs/architecture/overview.md"
IMPLEMENTATION_PLAN="$ROOT_DIR/docs/roadmap/implementation-plan.md"
DOCS_INDEX="$ROOT_DIR/docs/README.md"
failures=0

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

pass() {
  printf 'PASS: %s\n' "$*"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if rg -Fq -- "$pattern" "$file"; then
    pass "$label"
  else
    fail "$label"
  fi
}

assert_absent() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if rg -Fq -- "$pattern" "$file"; then
    fail "$label"
  else
    pass "$label"
  fi
}

assert_exact_count() {
  local file="$1"
  local pattern="$2"
  local expected="$3"
  local label="$4"
  local actual

  actual="$(rg -c -- "$pattern" "$file" || true)"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label (expected $expected, got $actual)"
  fi
}

assert_contains "$ARCHITECTURE_OVERVIEW" \
  '### MT-9 Tenant Admin And Branding (Completed)' \
  'architecture overview records MT-9 as completed'
assert_absent "$ARCHITECTURE_OVERVIEW" \
  '## Next Architecture Work' \
  'architecture overview does not label completed MT-9 as next work'
assert_absent "$ARCHITECTURE_OVERVIEW" \
  'feature/auth-email-code-primary' \
  'architecture overview does not direct work to the absent auth branch'

assert_contains "$IMPLEMENTATION_PLAN" \
  '### MT-9. Tenant Admin And Branding Rebuild (Completed)' \
  'implementation plan records MT-9 as completed'
assert_absent "$IMPLEMENTATION_PLAN" \
  '## Active Roadmap' \
  'implementation plan does not label completed MT-9 as active roadmap work'
assert_absent "$IMPLEMENTATION_PLAN" \
  'feature/auth-email-code-primary' \
  'implementation plan does not direct work to the absent auth branch'

assert_exact_count "$WORK_LOG" '^## Recommended Next Step$' '1' \
  'work log has exactly one current recommended next step'
assert_contains "$WORK_LOG" \
  'first real staged `prepare` rehearsal' \
  'work log points to the current staged-deployment next step'

assert_contains "$DOCS_INDEX" \
  'operations/mt-10-deployment-runbooks.md' \
  'documentation index points to the current production-operations map'
assert_absent "$DOCS_INDEX" \
  'operations/chatwoot-4-13-upgrade-notes.md' \
  'documentation index does not point to retired upgrade notes'

if (( failures > 0 )); then
  printf 'Documentation contract test failed with %d failure(s).\n' "$failures" >&2
  exit 1
fi

printf 'Documentation contract test passed.\n'
