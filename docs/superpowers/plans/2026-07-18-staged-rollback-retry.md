# Staged Rollback Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator explicitly discard only a safely retained candidate after its automatic rollback succeeded, then prepare that exact SHA again.

**Architecture:** The local deployment wrapper accepts a retry acknowledgement only for `prepare` and forwards it unchanged to the remote authority. The remote authority verifies the retained terminal outcome and the still-healthy active runtime before deleting the exact candidate artifacts; the existing normal prepare flow then builds and publishes a fresh candidate. Compose-wait evidence gains a fixed Docker-state stop classification without retaining raw logs.

**Tech Stack:** Bash, Docker Compose, existing staged-release records, Bash integration harness (`scripts/test-production-staged-deploy.sh`).

## Global Constraints

- Work only in `chatwoot-client-portal-v2`; do not restore or call the legacy deployment script.
- The retry is manual and requires `prepare --retry-after-rollback=<full failed candidate SHA>`; it must equal `--commit`.
- Do not delete history, active release evidence, production data, volumes, external images, or arbitrary server paths.
- Preserve the durable `candidate_failed_rollback_succeeded` outcome as the permanent record.
- No arbitrary Docker log text may be persisted or printed; diagnostics stay fixed-format and secret-safe.
- A retry must remain blocked when outcome history is ambiguous, the active runtime changed, a transaction is unresolved, candidate evidence is invalid, or image-tag identity is not exact.
- Do not perform a real production deployment as part of implementation verification.

## File Structure

- `scripts/deploy-production-staged.sh` — validates the new local-only acknowledgement and appends it to the remote prepare invocation.
- `scripts/production-staged-release-remote.sh` — validates retryable rollback evidence, removes only exact candidate artifacts, then continues with normal preparation; writes and validates fixed stop classifications.
- `scripts/test-production-staged-deploy.sh` — creates a retained-candidate fixture, verifies both refusal and safe retry, and checks fixed diagnostic values.
- `docs/operations/production-deployment.md` — documents the one explicit recovery command and its safety boundaries.
- `docs/superpowers/specs/2026-07-18-staged-retry-after-rollback-design.md` — narrows the stop-classification vocabulary to values Docker state can prove.

---

### Task 1: Explicit Retry After a Successful Automatic Rollback

**Files:**
- Modify: `scripts/deploy-production-staged.sh:20-37, 250-430, 430-680`
- Modify: `scripts/production-staged-release-remote.sh:1573-1643, 1758-1915, 4160-4250`
- Modify: `scripts/test-production-staged-deploy.sh:980-1068, 2063-2155, 3991-4125, 4236-4327`
- Modify: `docs/operations/production-deployment.md:30-79`

**Interfaces:**
- Consumes: a full lowercase SHA supplied through both `--commit` and `--retry-after-rollback`.
- Produces: `remote_retry_after_rollback_candidate "$app_path" "$candidate" "$current_commit"`, which returns success only after it removes the exact retained candidate artifacts and fsyncs their parent directories.
- Produces: `remote_find_latest_retryable_rollback_outcome "$history_dir" "$candidate"`, which prints one validated latest outcome path only when its status is `candidate_failed_rollback_succeeded`.

- [x] **Step 1: Write the failing local and remote retry tests**

Add a test helper that creates the observed recoverable topology in the fake remote state: a valid `prepared` candidate, a valid history outcome with `status=candidate_failed_rollback_succeeded`, no transaction, and current runtime equal to the outcome's `previous_commit`. Add these test cases:

```bash
prepare_retry_after_rollback_requires_exact_acknowledgement() {
  setup_retryable_rollback_fixture "$FUNCNAME"
  output="$CASE_ROOT/no-ack-output"
  if deploy_command prepare >"$output" 2>&1; then
    fail 'prepare accepted retained rollback evidence without acknowledgement'
  fi
  assert_status_once "$output" prepare_failed

  output="$CASE_ROOT/mismatched-ack-output"
  if deploy_command prepare "--retry-after-rollback=$CURRENT_COMMIT" >"$output" 2>&1; then
    fail 'prepare accepted a retry acknowledgement for another SHA'
  fi
  assert_status_once "$output" prepare_failed
  assert_no_transport "$output"
}

prepare_retry_after_rollback_rebuilds_only_exact_candidate() {
  setup_retryable_rollback_fixture "$FUNCNAME"
  outcome="$(retryable_rollback_outcome_path)"
  output="$CASE_ROOT/retry-output"
  deploy_command prepare "--retry-after-rollback=$PREPARED_COMMIT" >"$output" 2>&1 ||
    fail 'explicit rollback retry did not prepare the exact candidate'
  assert_status_once "$output" prepared
  [[ -f "$outcome" ]] || fail 'retry removed durable rollback outcome'
  [[ "$(<"$(task5_state_dir)/current")" == "$CURRENT_COMMIT" ]] ||
    fail 'retry changed active release pointer'
  task5_assert_runtime_release "$CURRENT_COMMIT"
  [[ "$(<"$(task5_state_dir)/prepared")" == "$PREPARED_COMMIT" ]] ||
    fail 'retry did not publish a fresh exact candidate'
}
```

Run: `bash scripts/test-production-staged-deploy.sh case:prepare_retry_after_rollback_requires_exact_acknowledgement && bash scripts/test-production-staged-deploy.sh case:prepare_retry_after_rollback_rebuilds_only_exact_candidate`

Expected: FAIL because the option is unknown and a retained candidate still blocks normal prepare.

- [x] **Step 2: Add local acknowledgement validation and forwarding**

In `staged_main`, parse `--retry-after-rollback` into `retry_after_rollback`. Require it to be empty for `activate` and `bootstrap`; for `prepare`, require a full lowercase SHA and exact equality with `commit`. Append the option only when non-empty:

```bash
local known_hosts_file='' migration_policy='' approval_ref='' retry_after_rollback=''

case "$name" in
  retry-after-rollback) retry_after_rollback="$value" ;;
esac

if [[ "$phase" != 'prepare' && -n "$retry_after_rollback" ]]; then
  staged_fail 'Only prepare accepts --retry-after-rollback.' 2
fi
if [[ -n "$retry_after_rollback" ]]; then
  [[ "$retry_after_rollback" =~ ^[0-9a-f]{40}$ && "$retry_after_rollback" == "$commit" ]] ||
    staged_fail 'Retry acknowledgement must be the same full SHA as --commit.' 2
fi

local -a prepare_arguments=(
  "$STAGED_REMOTE_TEMP/production-staged-release-remote.sh" prepare
  "--app-path=$app_path" "--candidate-archive-path=$STAGED_REMOTE_TEMP/candidate.tar.gz"
  "--candidate-sha256=$archive_sha" "--candidate-commit=$commit"
  "--current-archive-path=$STAGED_REMOTE_TEMP/current.tar.gz"
  "--current-sha256=$current_archive_sha" "--current-commit=$STAGED_INSPECTED_CURRENT"
  "--orchestrator-commit=$orchestrator_commit"
  "--orchestrator-protocol-version=$STAGED_PROTOCOL_VERSION"
)
[[ -z "$retry_after_rollback" ]] ||
  prepare_arguments+=("--retry-after-rollback=$retry_after_rollback")
staged_shell_join remote_command "${prepare_arguments[@]}"
```

Run the two tests from Step 1. Expected: the mismatched acknowledgement is rejected before transport; the matching acknowledgement still fails remotely because remote parsing does not yet accept it.

- [x] **Step 3: Implement exact remote recovery before normal prepare**

Extend `remote_parse_prepare_options` to accept an optional `retry-after-rollback`, validate it as a SHA equal to `candidate_commit`, and pass it through `remote_run_prepare_with_lock` to `remote_locked_prepare`. In `remote_locked_prepare`, immediately after current inspection and before expired-candidate handling, call the recovery only when acknowledged:

```bash
if [[ -n "$retry_after_rollback" ]]; then
  remote_retry_after_rollback_candidate \
    "$app_path" "$candidate_commit" "$current_commit" ||
    remote_prepare_abort 'Retained rollback candidate cannot be retried safely.'
fi
```

Implement the recovery with all of these checks in order:

```bash
remote_find_latest_retryable_rollback_outcome "$state_dir/history" "$candidate" || return 1
[[ "$(remote_pointer_read "$state_dir/prepared")" == "$candidate" ]] || return 1
[[ ! -e "$state_dir/transaction" && ! -L "$state_dir/transaction" ]] || return 1
remote_validate_state_layout "$app_path" || return 1
remote_inspect_current "$app_path" || return 1
[[ "$REMOTE_INSPECT_CURRENT" == "$current_commit" && "$outcome_previous" == "$current_commit" ]] || return 1
remote_validate_prepared_manifest "$manifest" "$candidate" || return 1
remote_validate_exact_candidate_tags "$manifest" || return 1
```

`remote_validate_exact_candidate_tags` must read each manifest tag and image ID, require `remote_image_id "$tag"` to equal that ID, and pass only those three pairs to `remote_remove_exact_tag`. After all three removals, remove only `releases/$candidate`, `prepared`, and the optional matching activation decision; fsync `.releases` and `.release-state`. It must not unlink any history outcome. Reuse the same exact-tag proof in expired cleanup instead of creating a weaker parallel deletion path.

Run the two tests from Step 1. Expected: PASS.

- [x] **Step 4: Document only the explicit recovery command**

Add this recovery paragraph after the normal prepare result explanation in `docs/operations/production-deployment.md`:

~~~~markdown
If `activate` returns `candidate_failed_rollback_succeeded`, production is
already back on the previous release. Do not edit server files. After checking
the printed outcome, deliberately prepare the same full SHA again with:

```bash
scripts/deploy-production-staged.sh prepare ... \
  --commit=<FULL_SHA> --retry-after-rollback=<THE_SAME_FULL_SHA>
```

The acknowledgement removes only that retained candidate after the script has
rechecked the active release and exact image identities. It keeps the failure
outcome in history. Any changed runtime, unresolved transaction, different
SHA, invalid evidence or ambiguous history remains blocked.
~~~~

Run: `git diff --check`

Expected: no output.

- [x] **Step 5: Focused review and commit Task 1**

Review only the retry input path, remote evidence validation and exact deletion path. Correct every Critical or Important observation in this scope, rerun the two tests and `git diff --check`, then commit only Task 1 files:

```bash
git add scripts/deploy-production-staged.sh \
  scripts/production-staged-release-remote.sh \
  scripts/test-production-staged-deploy.sh \
  docs/operations/production-deployment.md
git commit -m "fix(ops): allow explicit retry after safe rollback"
```

### Task 2: Fixed Stop Classification for Compose-Wait Failures

**Files:**
- Modify: `scripts/production-staged-release-remote.sh:2860-2960, 3149-3161, 3366-3377, 3398-3535`
- Modify: `scripts/test-production-staged-deploy.sh:3839-3919, 4304-4321`
- Modify: `docs/superpowers/specs/2026-07-18-staged-retry-after-rollback-design.md:42-45`

**Interfaces:**
- Consumes: `.State.ExitCode` and `.State.OOMKilled` from the already resolved candidate container.
- Produces: `REMOTE_COMPOSE_WAIT_<SERVICE>_STOP_CLASSIFICATION` with exactly `clean_exit`, `nonzero_exit`, or `unavailable`.
- Produces: three immutable outcome keys named `compose_wait_<service>_stop_classification` for `portal_backend`, `portal_web`, and `telegram_bridge`.

- [x] **Step 1: Write the failing classification tests**

Extend the existing safe-diagnostic test to prove that an exit code of `42` is retained as `nonzero_exit`, an exit code of `0` as `clean_exit`, and diagnostic capture failure as `unavailable`:

```bash
grep -Fxq 'compose_wait_portal_backend_stop_classification=nonzero_exit' "$outcome" ||
  fail 'nonzero candidate exit did not receive a fixed classification'
grep -Fxq 'compose_wait_portal_web_stop_classification=clean_exit' "$outcome" ||
  fail 'zero candidate exit did not receive a fixed classification'
grep -Fxq 'compose_wait_portal_backend_stop_classification=unavailable' "$outcome" ||
  fail 'failed diagnostic capture did not mark classification unavailable'
```

Run: `bash scripts/test-production-staged-deploy.sh case:compose_wait_failure_records_safe_container_failure_signals && bash scripts/test-production-staged-deploy.sh case:compose_wait_diagnostic_capture_failure_still_rolls_back`

Expected: FAIL because the three fields do not exist.

- [x] **Step 2: Persist and validate fixed Docker-state classifications**

Add a validator and derivation function; do not infer Unix signals from an exit code or save raw logs:

```bash
remote_compose_wait_stop_classification_is_safe() {
  case "${1:-}" in clean_exit|nonzero_exit|unavailable) return 0 ;; *) return 1 ;; esac
}

remote_compose_wait_stop_classification() {
  local exit_code="$1"
  [[ "$exit_code" == 'unavailable' ]] && { printf 'unavailable\n'; return 0; }
  [[ "$exit_code" =~ ^0$ ]] && { printf 'clean_exit\n'; return 0; }
  [[ "$exit_code" =~ ^[1-9][0-9]*$ ]] && { printf 'nonzero_exit\n'; return 0; }
  return 1
}
```

Set each service global during capture and reset it to `unavailable` with the other compose-wait evidence. Add the three keys to `remote_write_failure_outcome`, `remote_print_candidate_evidence`, and `remote_validate_outcome`. Keep old outcome records valid by treating the new three-key group as either absent (old record) or complete (new record), just as the prior extended evidence group is handled.

Run the two tests from Step 1. Expected: PASS, with no fixture secret in output or history.

- [x] **Step 3: Align the approved design with provable evidence**

Replace the failure-evidence vocabulary in `docs/superpowers/specs/2026-07-18-staged-retry-after-rollback-design.md` with the exact values that Docker state proves:

```markdown
For a failed `compose_wait`, retain only fixed safe classifications derived
from Docker state: exit code, OOM state and one of `clean_exit`,
`nonzero_exit` or `unavailable`. Docker state alone does not prove a Unix
signal, so the process must not label one.
```

Run: `git diff --check`

Expected: no output.

- [x] **Step 4: Focused review, required gates and commit Task 2**

Review only compose-wait evidence capture, outcome compatibility and retry cleanup boundaries. Fix every Critical or Important observation within this scope. Run the mandatory gates once after the final fixes:

```bash
bash -n scripts/deploy-production-staged.sh scripts/production-staged-release-remote.sh scripts/test-production-staged-deploy.sh
bash scripts/test-production-staged-deploy.sh
pnpm lint
pnpm build
git diff --check
```

Expected: every command exits `0` and `git diff --check` prints nothing.

Commit Task 2 and the already-approved plan/spec documents if they are still uncommitted on this branch:

```bash
git add scripts/production-staged-release-remote.sh \
  scripts/test-production-staged-deploy.sh \
  docs/superpowers/specs/2026-07-18-staged-retry-after-rollback-design.md \
  docs/superpowers/plans/2026-07-18-staged-rollback-retry.md
git commit -m "fix(ops): classify staged container stops safely"
```

## Plan Self-Review

- **Spec coverage:** Task 1 implements the explicit acknowledgement, exact SHA equality, retained outcome preservation, active-runtime revalidation, exact-only cleanup and fresh normal prepare. Task 2 implements fixed secret-safe Docker-state evidence and preserves compatibility with earlier outcomes.
- **Placeholder scan:** Each implementation step names functions, files, expected results and commands; none defer work or use vague test language.
- **Type consistency:** The local option is `retry-after-rollback`; remote Bash functions consistently use `retry_after_rollback`, `remote_find_latest_retryable_rollback_outcome`, and `remote_retry_after_rollback_candidate`. The new evidence keys consistently use `compose_wait_<service>_stop_classification`.
