#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$ROOT_DIR/.github/workflows/deploy-production.yml"
PACKAGE_JSON="$ROOT_DIR/package.json"
CANONICAL_DEPLOYMENT_GUIDE="$ROOT_DIR/docs/operations/production-deployment.md"
NEW_LAPTOP_GUIDE="$ROOT_DIR/docs/operations/continue-on-new-laptop.md"
ACTIVE_OPERATIONS_FILES=(
  "$CANONICAL_DEPLOYMENT_GUIDE"
  "$ROOT_DIR/docs/operations/production-clean-reinstall.md"
  "$ROOT_DIR/docs/operations/mt-10-deployment-runbooks.md"
  "$ROOT_DIR/docs/operations/continue-on-new-laptop.md"
  "$ROOT_DIR/docs/operations/production-server-notes.md"
  "$ROOT_DIR/docs/operations/telegram-bridge.md"
  "$ROOT_DIR/docs/operations/mt-10a-tenant-lifecycle-rehearsal.md"
)
failures=0

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

pass() {
  printf 'PASS: %s\n' "$*"
}

assert_file_missing() {
  local path="$1"

  if [[ -e "$ROOT_DIR/$path" ]]; then
    fail "expected $path to be removed"
  else
    pass "$path is removed"
  fi
}

assert_json_script() {
  local script_name="$1"
  local expected="$2"
  local actual

  actual="$(node -e 'const packageJson = require(process.argv[1]); const value = packageJson.scripts?.[process.argv[2]]; if (typeof value !== "string") process.exit(1); process.stdout.write(value)' "$PACKAGE_JSON" "$script_name" 2>/dev/null || true)"
  if [[ "$actual" != "$expected" ]]; then
    fail "package script $script_name must equal: $expected"
  else
    pass "package script $script_name has the staged entry point"
  fi
}

assert_json_script_missing() {
  local script_name="$1"

  if node -e 'const packageJson = require(process.argv[1]); process.exit(Object.hasOwn(packageJson.scripts ?? {}, process.argv[2]) ? 1 : 0)' "$PACKAGE_JSON" "$script_name"; then
    pass "package script $script_name is removed"
  else
    fail "package script $script_name must be removed"
  fi
}

assert_workflow_input() {
  local input="$1"

  if awk -v input="$input" '
    /^  workflow_dispatch:/ { in_dispatch = 1; next }
    in_dispatch && /^  [^[:space:]]/ { exit }
    in_dispatch && $0 == "      " input ":" { found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$WORKFLOW"; then
    pass "workflow exposes $input input"
  else
    fail "workflow must expose $input input"
  fi
}

assert_workflow_phase_options() {
  local phase_block

  phase_block="$(awk '
    /^      phase:/ { in_phase = 1 }
    in_phase { print }
    in_phase && /^      [A-Za-z_][A-Za-z_]*:$/ && $0 !~ /^      phase:$/ { exit }
  ' "$WORKFLOW")"
  if [[ "$phase_block" == *"type: choice"* && "$phase_block" == *"- prepare"* && "$phase_block" == *"- activate"* ]]; then
    pass "workflow phase is restricted to prepare and activate"
  else
    fail "workflow phase must be a prepare/activate choice"
  fi
}

assert_workflow_delegates_only_to() {
  local script_path="$1"
  local script_references

  script_references="$(rg -o 'scripts/[A-Za-z0-9._/-]+' "$WORKFLOW" | sort -u || true)"
  if [[ "$script_references" == "$script_path" ]]; then
    pass "workflow delegates only to $script_path"
  else
    fail "workflow must delegate only to $script_path"
  fi
}

assert_repo_absent() {
  local pattern="$1"
  local matches
  local -a active_authority_paths=(
    "$WORKFLOW"
    "$ROOT_DIR/scripts/deploy-production-staged.sh"
    "$ROOT_DIR/scripts/production-staged-release-remote.sh"
  )

  matches="$(rg -n "$pattern" "${active_authority_paths[@]}" 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    fail "active workflow/scripts must not contain $pattern: $matches"
  else
    pass "active workflow/scripts do not contain $pattern"
  fi
}

assert_workflow_absent() {
  local pattern

  for pattern in "$@"; do
    if rg -Fq -- "$pattern" "$WORKFLOW"; then
      fail "workflow must not contain $pattern"
    else
      pass "workflow does not contain $pattern"
    fi
  done
}

assert_workflow_contains() {
  local pattern

  for pattern in "$@"; do
    if rg -Fq -- "$pattern" "$WORKFLOW"; then
      pass "workflow contains $pattern"
    else
      fail "workflow must contain $pattern"
    fi
  done
}

assert_workflow_secret_guards_before_staged_call() {
  local staged_line
  local guard_line
  local variable

  staged_line="$(rg -n -m1 'scripts/deploy-production-staged\.sh' "$WORKFLOW" | cut -d: -f1 || true)"
  if [[ -z "$staged_line" ]]; then
    fail "workflow must call the staged deploy script"
    return
  fi

  for variable in SSH_HOST SSH_USER SSH_PRIVATE_KEY SSH_KNOWN_HOSTS; do
    guard_line="$(rg -n -m1 "require_nonempty $variable" "$WORKFLOW" | cut -d: -f1 || true)"
    if [[ -z "$guard_line" || "$guard_line" -ge "$staged_line" ]]; then
      fail "workflow must reject missing $variable before staged deployment"
    else
      pass "workflow rejects missing $variable before staged deployment"
    fi
  done
}

assert_active_operations_absent() {
  local pattern="$1"
  local matches

  matches="$(rg -n -F -- "$pattern" "${ACTIVE_OPERATIONS_FILES[@]}" 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    fail "active operations guidance must not contain $pattern: $matches"
  else
    pass "active operations guidance does not contain $pattern"
  fi
}

assert_active_operations_have_no_executable_ssh_keyscan() {
  local matches

  matches="$(awk '
    /^[[:space:]]*(```|~~~)/ {
      in_code_fence = !in_code_fence
      next
    }
    /^[[:space:]]*(\$[[:space:]]+)?ssh-keyscan([^[:alnum:]_]|$)/ {
      line = tolower($0)
      if (in_code_fence || line !~ /forbidden/) {
        printf "%s:%d:%s\\n", FILENAME, FNR, $0
      }
    }
  ' "${ACTIVE_OPERATIONS_FILES[@]}")"
  if [[ -n "$matches" ]]; then
    fail "active operations guidance must not execute ssh-keyscan: $matches"
  else
    pass "active operations guidance has no executable ssh-keyscan command"
  fi
}

assert_ssh_keyscan_guard_rejects_fenced_forbidden_command() {
  local fixture
  local output

  fixture="$(mktemp)"
  printf '%s\n' '```bash' 'ssh-keyscan host # forbidden' '```' >"$fixture"
  output="$(
    ACTIVE_OPERATIONS_FILES=("$fixture")
    assert_active_operations_have_no_executable_ssh_keyscan 2>&1
  )"
  rm -f "$fixture"

  if [[ "$output" == *'FAIL: active operations guidance must not execute ssh-keyscan:'* ]]; then
    pass 'ssh-keyscan guard rejects a fenced command with a forbidden comment'
  else
    fail 'ssh-keyscan guard must reject a fenced command with a forbidden comment'
  fi
}

assert_file_contains() {
  local path="$1"
  local pattern="$2"

  if rg -Fq -- "$pattern" "$path"; then
    pass "$(basename "$path") contains $pattern"
  else
    fail "$(basename "$path") must contain $pattern"
  fi
}

assert_file_missing scripts/deploy-production-archive.sh
assert_json_script deploy:staged 'bash ./scripts/deploy-production-staged.sh'
assert_json_script_missing deploy:archive
assert_json_script test:ops 'bash ./scripts/test-production-env-upgrade.sh && bash ./scripts/test-production-release-records.sh && bash ./scripts/test-production-staged-deploy.sh && bash ./scripts/test-production-deploy-contracts.sh'
assert_workflow_input commit
assert_workflow_input migration_policy
assert_workflow_input approval_ref
assert_workflow_phase_options
assert_workflow_delegates_only_to scripts/deploy-production-staged.sh
assert_repo_absent ssh-keyscan
assert_workflow_absent 'git checkout' 'git fetch' 'docker compose' 'up -d' 'bootstrap'
assert_workflow_contains 'actions/checkout@v4' 'fetch-depth: 0' 'ref: main' 'runs-on: ubuntu-24.04' 'environment: production' 'group: production' 'cancel-in-progress: false' 'PRODUCTION_SSH_KNOWN_HOSTS'
assert_workflow_secret_guards_before_staged_call
assert_active_operations_absent scripts/deploy-production-archive.sh
assert_active_operations_absent --allow-dirty-preview
assert_active_operations_absent --preview-label
assert_active_operations_absent 'docker compose --env-file .env.production -f infra/production/compose.yaml up -d --build'
assert_active_operations_have_no_executable_ssh_keyscan
assert_ssh_keyscan_guard_rejects_fenced_forbidden_command
assert_file_contains "$NEW_LAPTOP_GUIDE" 'Fail closed: env drift fails `prepare`; use separate approved remediation.'
for required_pattern in prepare activate --no-build '--pull never' PRODUCTION_SSH_KNOWN_HOSTS backward-compatible forward-only candidate_failed_rollback_succeeded '100 active tenants' 'five-worker'; do
  assert_file_contains "$CANONICAL_DEPLOYMENT_GUIDE" "$required_pattern"
done
for required_pattern in bootstrap BOOTSTRAP_SOURCE.txt 'empty root' 'portal-project container' 'does not start production'; do
  assert_file_contains "$ROOT_DIR/docs/operations/production-clean-reinstall.md" "$required_pattern"
done

if (( failures > 0 )); then
  printf 'Production deploy contract test failed with %s assertion(s).\n' "$failures" >&2
  exit 1
fi

printf 'Production deploy contract test passed.\n'
