# Production Staged Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every normal production code-activation path with one exact-commit staged authority that prepares rollback evidence before cutover, performs bounded all-tenant smoke, rolls back when policy permits, and provides a separately approved empty-root source bootstrap for clean reinstall.

**Architecture:** `scripts/deploy-production-staged.sh` is the only public operator/GitHub entry point and owns local Git provenance plus strict SSH/SCP transport. `scripts/production-staged-release-remote.sh` owns the locked remote state machine, exact images, health/smoke, journaled publication, rollback and bounded cleanup; `scripts/production-release-records.sh` provides non-evaluating record/marker primitives shared with the clean installer. All automated coverage runs against temporary repositories, fake SSH/Docker/curl boundaries and temporary filesystem roots; implementation closure never contacts production.

**Tech Stack:** Bash 5.2, Git, OpenSSH client tools, GNU coreutils/tar/rsync/flock, Docker Engine with Compose v2.40+, curl, Python 3 JSON parsing, pnpm 10.33, Node.js 24, GitHub Actions YAML.

## Global Constraints

- Implement from the approved design in `docs/superpowers/specs/2026-07-16-production-staged-deployment-design.md`; do not widen this slice into `F-OPS-004`, `F-SUPPLY-001` or `F-SUPPLY-002`.
- No task may run real `prepare`, `activate`, `bootstrap`, rollback, SSH, SCP, Docker mutation or public smoke against production. A later real rehearsal needs fresh exact user approval.
- Before execution, merge the docs branch into local `main`, then use `superpowers:using-git-worktrees` to create `fix/ops-staged-production-deploy` from that updated `main`. Do not implement on the docs branch.
- The only production application root accepted by the public/remote production path is `/opt/chatwoot-client-portal-v2`; test overrides must be explicit, temporary-root-only and impossible to select accidentally.
- Candidate and bootstrap source must be a lowercase 40-character commit
  contained in freshly fetched `origin/main`, built with `git archive` from the
  commit object while local branch is clean `main`. Local `HEAD` must exactly
  equal fetched `origin/main`, so the deployed helper code is reviewed source;
  activate may use a newer reviewed `origin/main` tip only when the recorded
  prepare-time orchestrator commit remains in that history and both tools use
  the same deploy protocol version.
- Routine deployment remains two distinct commands: `prepare` cannot mutate the active runtime; `activate` cannot build or pull. `bootstrap` is local-operator-only, empty-root-only and cannot configure/start production.
- Every SSH/SCP call uses `BatchMode=yes`, `StrictHostKeyChecking=yes`, caller-provided `UserKnownHostsFile`, `IdentitiesOnly=yes`, explicit identity and explicit port. Never call `ssh-keyscan` or use trust-on-first-use.
- Prepared manifests and activation decisions are immutable mode-0600 records. Parse records as validated data; never `source`, `eval` or interpolate a record as shell code.
- Start the activation transaction journal before the first Compose mutation. An unresolved journal blocks later `prepare`/`activate`; success clears it only after durable outcome, and rollback clears it only after exact recovery is rechecked.
- Migration-sensitive paths are exactly `backend/drizzle/`, `backend/drizzle.config.ts` and `backend/src/db/migrate.ts`. A difference requires `backward-compatible` or `forward-only` plus a validated approval reference.
- Active-tenant discovery is one indexed `status='active'` query with `ORDER BY slug LIMIT 101`; accept `1..100` rows only. Public smoke uses at most five workers, five-second connect timeout, 15-second request timeout, three total attempts with three-second delay and a 10-minute bound per smoke pass.
- One candidate smoke pass is bounded to at most 600 HTTP attempts (`100 tenants × 2 endpoints × 3 attempts`); a rollback may perform one additional bounded pass. This work happens only during deployment, never per request/tab/message.
- Stable release storage is current plus previous; transient storage may add one candidate for at most 24 hours. Keep at most 20 small outcome records and at most 32 recorded external image references.
- Disk preflight is the larger of 8 GiB and twice the summed current backend/web/Telegram image size. Cleanup operates only on validated full-SHA release paths/tags and never runs global prune or deletes volumes/object storage/Chatwoot/portal data.
- Logs may show service names, tenant slugs, public origins, commits, checksums and image IDs, but never env values, tokens, cookies, database URLs, customer identifiers or arbitrary response bodies.
- Each task uses TDD, then a focused code review of its diff, fixes every in-scope finding, reruns its targeted checks and only then makes the checkpoint commit. Never commit with failing gates or unclear/unrelated files.
- For every checkpoint commit run the task-specific tests, `bash -n` for changed shell, `pnpm lint`, `pnpm build` and `git diff --check`. Run full `pnpm test` at the major prepare/activate checkpoints and final closure.

## File And Interface Map

**Create**

- `scripts/production-release-records.sh` — bounded `key=value` parsing, validation, atomic/immutable record writes and source-marker promotion; no network/Docker behavior.
- `scripts/test-production-release-records.sh` — focused marker/record and installer-bootstrap regression tests.
- `scripts/deploy-production-staged.sh` — sole public operator entry point for `prepare`, `activate` and exceptional `bootstrap`.
- `scripts/production-staged-release-remote.sh` — sole remote state-machine helper.
- `scripts/test-production-staged-deploy.sh` — fake-runtime behavioral harness using a real temporary Git origin and fake transport/runtime boundaries.
- `scripts/test-production-deploy-contracts.sh` — static authority/workflow/docs contract checks.
- `docs/findings/F-OPS-007-retire-legacy-deploy-marker-reader.md` — time-boxed removal trigger for the one-time pre-staged marker reader.

**Modify**

- `scripts/install-production.sh:4-18,53-100,1023-1039` — load record primitives, reject skipped public health while bootstrapping and promote the marker only after every install step succeeds.
- `scripts/test-production-env-upgrade.sh:4-10,86,115-119` — remove assertions that require the retired archive helper to mutate the real env; retain direct env-helper and ingress coverage.
- `package.json:8-23` — replace `deploy:archive`, register `deploy:staged` and include every focused ops test in `test:ops`.
- `.github/workflows/deploy-production.yml:3-98` — become a strict thin caller for `prepare|activate` only.
- `docs/operations/production-deployment.md:1-180` — canonical routine staged deploy runbook.
- `docs/operations/production-clean-reinstall.md:250-305,450-520,675-715,770-790` — empty-root bootstrap and removal of dirty/WIP production preview instructions.
- `docs/operations/mt-10-deployment-runbooks.md:1-115,213-255,650-715` — staged authority, all-tenant acceptance and state evidence.
- `docs/operations/continue-on-new-laptop.md:250-295` — strict local SSH materials and staged commands.
- `docs/operations/production-server-notes.md:200-225` — replace archive-deploy baseline.
- `docs/operations/telegram-bridge.md:45-70` — remove direct bridge-only code activation.
- `docs/operations/mt-10a-tenant-lifecycle-rehearsal.md:95-115,360-375` — new active marker format/readback.
- `docs/architecture/decisions.md` — add the stable single staged-authority decision only after closure.
- `docs/roadmap/implementation-plan.md:160-205` — replace the MT-10 archive baseline only after closure.
- `docs/roadmap/work-log.md:98-112` and final `Recommended Next Step` — record the stable staged baseline only after closure.

**Delete only after replacement tests/docs and independent high-risk review pass**

- `scripts/deploy-production-archive.sh` — unsafe working-tree/archive activation authority.
- `docs/findings/F-OPS-005-deploy-authority-completion.md` — close after its acceptance is proven.
- `docs/findings/F-OPS-006-ssh-host-authentication.md` — close after its acceptance is proven.

## Canonical Record Contracts

All records are UTF-8, at most 64 KiB, mode `0600`, one `key=value` per line, with no blank/unknown/duplicate keys or control characters. Values are read by exact key and revalidated; files are never executed.

The existing pre-staged `DEPLOY_SOURCE.txt` is the sole temporary format
exception. Its one-time reader requires the exact current legacy layout ending
in a blank line, `git_status_short:` and `(clean)`; no generic record writer
produces or accepts that format. It may retain the old readable mode, but must
be an owned regular non-symlink file with no group/world write bits; every new
marker/record is mode `0600`.

`BOOTSTRAP_SOURCE.txt`:

```text
protocol_version=1
record_kind=bootstrap_source
app=chatwoot-client-portal-v2
source_commit=<40-lowercase-hex>
archive_sha256=<64-lowercase-hex>
created_at_utc=<YYYY-MM-DDTHH:MM:SSZ>
approval_ref=<1..128 allowed characters>
```

`DEPLOY_SOURCE.txt` after bootstrap completion or staged activation:

```text
protocol_version=1
record_kind=active_source
app=chatwoot-client-portal-v2
source_commit=<40-lowercase-hex>
archive_sha256=<64-lowercase-hex>
activated_at_utc=<YYYY-MM-DDTHH:MM:SSZ>
```

The first-adoption current release uses an immutable `manifest.txt` with
`record_kind=imported_release`, `release_commit`, `archive_sha256`,
`imported_at_utc` and the exact backend/web/Telegram full-SHA tags and image
IDs. It contains no synthetic build claim: all three IDs come from the running
containers before candidate build. Later releases retain their prepared
manifest, whose candidate fields provide the same release evidence.

```text
protocol_version=1
record_kind=imported_release
release_commit=<sha>
archive_sha256=<sha256>
imported_at_utc=<timestamp>
backend_image_tag=chatwoot-client-portal-v2-portal-backend:<release-sha>
backend_image_id=<docker-image-id>
web_image_tag=chatwoot-client-portal-v2-portal-web:<release-sha>
web_image_id=<docker-image-id>
telegram_image_tag=chatwoot-client-portal-v2-telegram-bridge:<release-sha>
telegram_image_id=<docker-image-id>
```

Prepared release `manifest.txt` contains these fixed fields plus bounded indexed external image fields:

```text
protocol_version=1
record_kind=prepared_release
orchestrator_commit=<sha>
orchestrator_protocol_version=1
candidate_commit=<sha>
candidate_archive_sha256=<sha256>
rollback_commit=<sha>
rollback_archive_sha256=<sha256>
prepared_at_utc=<timestamp>
prepared_at_epoch=<integer>
expires_at_utc=<timestamp>
expires_at_epoch=<integer>
observed_current_commit=<sha>
production_env_sha256=<sha256>
migration_classification=none|migration
backend_image_tag=chatwoot-client-portal-v2-portal-backend:<candidate-sha>
backend_image_id=<docker-image-id>
web_image_tag=chatwoot-client-portal-v2-portal-web:<candidate-sha>
web_image_id=<docker-image-id>
telegram_image_tag=chatwoot-client-portal-v2-telegram-bridge:<candidate-sha>
telegram_image_id=<docker-image-id>
rollback_backend_image_tag=chatwoot-client-portal-v2-portal-backend:<rollback-sha>
rollback_backend_image_id=<docker-image-id>
rollback_web_image_tag=chatwoot-client-portal-v2-portal-web:<rollback-sha>
rollback_web_image_id=<docker-image-id>
rollback_telegram_image_tag=chatwoot-client-portal-v2-telegram-bridge:<rollback-sha>
rollback_telegram_image_id=<docker-image-id>
tenant_count=<1..100>
tenant_matrix_sha256=<sha256>
external_image_count=<0..32>
external_image_001_ref=<compose-image-ref>
external_image_001_id=<docker-image-id>
```

Every built or external image ID must match
`sha256:[0-9a-f]{64}`. Each external image reference is at most 255 bytes,
contains no whitespace or control characters, does not begin with `-`, and is
passed only as one quoted argv value. Indexed external fields are present
exactly from `001` through the declared count; fields beyond that count are
forbidden.

The immutable activation decision is `.release-state/decisions/<candidate-sha>.txt`; the mutable atomic transaction is `.release-state/transaction`; bounded immutable outcomes live in `.release-state/history/`. Pointer files `adoption`, `current`, `previous` and `prepared` contain exactly one validated full SHA and newline. `adoption` is allowed only before the first successful staged activation, while `current` is absent and the root marker is the exact accepted legacy marker.

Every history outcome is a create-only record with this exact shape:

```text
protocol_version=1
record_kind=deployment_outcome
candidate_commit=<sha>
previous_commit=<sha-or-none>
status=<allowed-final-status>
failure_stage=<none|compose_wait|service_state|tenant_smoke|root_sync|marker_publish>
recorded_at_utc=<timestamp>
recorded_at_epoch=<integer>
```

The filename is `<recorded-at-epoch>-<candidate-sha>-<status>.txt`; an existing
name is never overwritten. `failure_stage=none` is required for successful
outcomes. No command output, HTTP body, environment value, exception text or
free-form status detail is persisted in this record.

After a phase is parsed, every public command emits exactly one final
machine-readable `status=<value>` line. Success/exit `0` is limited to
`prepared`, `activation_succeeded` and `bootstrap_completed`. All of
`prepare_failed`, `activation_refused_state_changed`,
`activation_refused_expired`, `activation_refused_migration_policy`,
`activation_failed_publication`, `candidate_failed_rollback_succeeded`,
`candidate_failed_rollback_failed`, `candidate_failed_forward_only`,
`bootstrap_refused_nonempty` and `bootstrap_failed` exit non-zero. Tests assert
both the final line and exit code; a recovered rollback is never success for
the requested candidate.

---

### Task 1: Safe Release Records And Clean-Installer Marker Boundary

**Files:**

- Create: `scripts/production-release-records.sh`
- Create: `scripts/test-production-release-records.sh`
- Create: `docs/findings/F-OPS-007-retire-legacy-deploy-marker-reader.md`
- Modify: `scripts/install-production.sh:4-18,53-100,1023-1039`

**Interfaces:**

- Produces: `release_record_get_unique <path> <key>`,
  `release_record_validate_keys <path> <allowed-key>...`,
  `release_record_write_atomic <replace|create> <path>` (record bytes on
  stdin), `release_marker_write_bootstrap <path> <commit> <archive_sha>
<timestamp> <approval_ref>`, `release_marker_validate_bootstrap <path>`,
  `release_marker_promote_bootstrap <bootstrap-path> <active-path>
<activated-at>`, and `release_marker_read_active_commit <path>
<allow-legacy:true|false>`.
- Produces: installer invariant that a valid bootstrap marker plus `--skip-public-health` exits before state/log/env/Docker work, while successful completion of all existing install steps promotes the marker exactly once.
- Consumes later: both deploy scripts source this library by an explicit trusted path; they do not duplicate or weaken its parser.

- [ ] **Step 1: Write failing record and installer-boundary tests**

Create `scripts/test-production-release-records.sh` with a temporary root, a `fail` helper and exact cases for:

```bash
run_case bootstrap_marker_is_mode_600_and_valid
run_case duplicate_or_unknown_key_is_rejected
run_case malformed_sha_checksum_timestamp_and_approval_are_rejected
run_case promotion_writes_active_marker_before_removing_bootstrap_marker
run_case failed_promotion_preserves_bootstrap_marker
run_case legacy_clean_marker_is_allowed_only_when_allow_legacy_is_true
run_case dirty_or_preview_legacy_marker_is_rejected
run_case installer_rejects_skip_public_health_before_creating_install_state
run_case installer_calls_promotion_after_maintenance_cleanup_step
```

Use a copied temporary installer tree for the skip test so the real repository never gets a marker:

```bash
mkdir -p "$TMP_DIR/install-root/scripts"
cp "$INSTALL_SCRIPT" "$TMP_DIR/install-root/scripts/install-production.sh"
cp "$RECORDS_SCRIPT" "$TMP_DIR/install-root/scripts/production-release-records.sh"
release_marker_write_bootstrap \
  "$TMP_DIR/install-root/BOOTSTRAP_SOURCE.txt" \
  "$(printf 'a%.0s' {1..40})" \
  "$(printf 'b%.0s' {1..64})" \
  '2026-07-16T12:00:00Z' \
  'clean-reinstall-approved'

if "$TMP_DIR/install-root/scripts/install-production.sh" \
  --install --skip-public-health >"$TMP_DIR/skip.log" 2>&1; then
  fail 'bootstrap install must reject --skip-public-health'
fi
[[ ! -e "$TMP_DIR/install-root/.install" ]] || \
  fail 'bootstrap guard must run before installer state creation'
```

For call ordering, compare line numbers for the final maintenance step, `finalize_bootstrap_source`, and `print_summary`; require strictly increasing order.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
bash scripts/test-production-release-records.sh
```

Expected: non-zero with the first missing-library/function assertion; no repository file outside the planned test file changes.

- [ ] **Step 3: Implement bounded, non-evaluating record primitives**

Create `scripts/production-release-records.sh` with `set -Eeuo pipefail` and no top-level side effects. Use exact validators:

```bash
readonly RELEASE_APP_NAME='chatwoot-client-portal-v2'
readonly RELEASE_PROTOCOL_VERSION='1'
readonly RELEASE_RECORD_MAX_BYTES='65536'

release_record_is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
release_record_is_checksum() { [[ "$1" =~ ^[0-9a-f]{64}$ ]]; }
release_record_is_timestamp() {
  [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]
}
release_record_is_approval_ref() {
  [[ "$1" =~ ^[A-Za-z0-9._:/-]{1,128}$ ]]
}
```

`release_record_get_unique` must count exact `key=` prefixes, require one match and print only `substr(line, length(key)+2)`. `release_record_validate_keys` must reject files larger than 64 KiB, non-regular files, symlinks, blank lines, keys outside `^[a-z][a-z0-9_]*$`, duplicates, unknown keys and tab/CR/control characters. Do not use `source`, `eval`, `declare` from file content or command substitution that interprets values.

Write records through a same-directory temporary file with `umask 077`, `chmod 600`, validation, then `mv -T`. `create` mode refuses an existing destination; `replace` mode is allowed only for the transaction/active marker caller.

- [ ] **Step 4: Implement source-marker write, validation, promotion and one-time legacy read**

Make `release_marker_write_bootstrap` write the canonical seven-field record. Make `release_marker_promote_bootstrap` validate and read it, create the six-field active marker atomically, verify the new active marker, then remove the bootstrap marker. A failure before verified active-marker publication must leave the bootstrap marker present.

The legacy reader accepts the current pre-staged shape only when all of these exact fields are unique and valid:

```text
app=chatwoot-client-portal-v2
created_at_utc=<valid-timestamp>
source_branch=main
source_commit=<40-lowercase-hex>
source_dirty=false
allow_dirty_preview=false
preview_label=

git_status_short:
(clean)
```

`allow-legacy=false` must reject that shape. Never accept `source_dirty=true`, a non-empty preview label, missing fields or a short/mixed-case SHA.

- [ ] **Step 5: Integrate the bootstrap guard and final promotion into the installer**

Source the records library immediately after `REPO_ROOT` is known:

```bash
RELEASE_RECORDS_LIB="$SCRIPT_DIR/production-release-records.sh"
if [[ ! -r "$RELEASE_RECORDS_LIB" ]]; then
  echo "Release records helper is missing: $RELEASE_RECORDS_LIB" >&2
  exit 1
fi
# shellcheck source=scripts/production-release-records.sh
source "$RELEASE_RECORDS_LIB"

BOOTSTRAP_SOURCE_FILE="$REPO_ROOT/BOOTSTRAP_SOURCE.txt"
ACTIVE_SOURCE_FILE="$REPO_ROOT/DEPLOY_SOURCE.txt"
```

After argument parsing but before `mkdir -p "$STATE_DIR" "$LOG_DIR"`, validate a present bootstrap marker for `ACTION=install` and reject skipped health:

```bash
if [[ "$ACTION" == 'install' && -e "$BOOTSTRAP_SOURCE_FILE" ]]; then
  release_marker_validate_bootstrap "$BOOTSTRAP_SOURCE_FILE"
  if [[ "$SKIP_PUBLIC_HEALTH" == 'true' ]]; then
    echo 'Bootstrap installation requires public health and tenant checks.' >&2
    exit 2
  fi
fi
```

Define `finalize_bootstrap_source` as a no-op without a marker and otherwise call `release_marker_promote_bootstrap` with `date -u +%Y-%m-%dT%H:%M:%SZ`. Invoke it after `run_step maintenance_cleanup_timer ...` and before `print_summary`. Do not promote after only `public_health`; every remaining installer step must have succeeded or been previously recorded successful.

- [ ] **Step 6: Record the time-boxed compatibility removal trigger**

Create `docs/findings/F-OPS-007-retire-legacy-deploy-marker-reader.md` with:

```markdown
# F-OPS-007: Retire legacy deploy marker reader

- status: deferred
- found_in: Production staged deployment transition 2026-07-16
- risk: low
- urgency: Remove immediately after the first successful real staged production activation establishes `.release-state/current`.
- area: Production deploy source marker transition
- evidence: `scripts/production-release-records.sh` temporarily reads the pre-staged `DEPLOY_SOURCE.txt` fields so the current exact clean runtime can be imported as the first rollback release.
- failure_path: Leaving the reader indefinitely would preserve an obsolete operational compatibility path after staged state is authoritative.
- counterevidence: The reader accepts only the exact clean full-SHA marker, is disabled whenever staged `current` exists, and cannot authorize activation by itself.
- load_impact: None; this is one record read during first staged adoption only.
- fix_short: After the first successful staged production activation, remove legacy marker parsing and its fixtures in a separately approved follow-up.
- acceptance: Production has a verified staged `current` release; the legacy parser, allow-legacy branch and legacy fixtures are removed; focused ops tests, lint/build and review gates pass.
```

- [ ] **Step 7: Run targeted verification and review the task diff**

Run:

```bash
bash -n scripts/production-release-records.sh scripts/test-production-release-records.sh scripts/install-production.sh
bash scripts/test-production-release-records.sh
bash scripts/test-production-env-upgrade.sh
pnpm lint
pnpm build
git diff --check
```

Expected: every command exits zero; the skip-health fixture proves no `.install` directory was created. Review for symlink replacement, duplicate-key acceptance, accidental record execution, marker removal before active write and any installer path that can bypass the guard. Fix findings and rerun the same commands.

- [ ] **Step 8: Commit the closed task**

```bash
git add \
  scripts/production-release-records.sh \
  scripts/test-production-release-records.sh \
  scripts/install-production.sh \
  docs/findings/F-OPS-007-retire-legacy-deploy-marker-reader.md
git commit -m "fix(ops): guard clean-install source promotion"
```

### Task 2: Exact-Commit Orchestrator, Strict Transport And Empty-Root Bootstrap

**Files:**

- Create: `scripts/deploy-production-staged.sh`
- Create: `scripts/production-staged-release-remote.sh`
- Create: `scripts/test-production-staged-deploy.sh`
- Modify: `package.json:8-23`

**Interfaces:**

- Consumes: Task 1 record validators and bootstrap marker writer.
- Produces public CLI: `scripts/deploy-production-staged.sh <prepare|activate|bootstrap> --host=user@host --ssh-port=N --identity-file=PATH --app-path=/opt/chatwoot-client-portal-v2 --commit=SHA --known-hosts-file=PATH [--migration-policy=...] [--approval-ref=...]`.
- Produces remote internal CLI: `production-staged-release-remote.sh <inspect|bootstrap|prepare|activate|__locked-bootstrap|__locked-prepare|__locked-activate|__smoke-one> ...`; only the public orchestrator is documented/supported for operators.
- Produces test injection contract: each `STAGED_*_BIN` is one executable path, never a command string; `STAGED_TEST_ROOT` is honored only with `STAGED_TEST_MODE=1` and must resolve beneath `/tmp`.

- [ ] **Step 1: Build the fake-runtime harness and write failing provenance/transport/bootstrap cases**

Create a real temporary Git repository with two commits and a local bare `origin`, then create fake `ssh`, `scp`, `ssh-keygen` and `docker` executables that append NUL-safe arguments to a command log. Do not fake Git/archive/checksum/filesystem primitives.

Register these exact initial cases:

```bash
run_case rejects_dirty_tree_before_transport
run_case rejects_non_main_branch_before_transport
run_case rejects_short_uppercase_unknown_or_non_origin_commit
run_case rejects_local_main_head_that_differs_from_fetched_origin_main
run_case rejects_invalid_host_port_identity_known_hosts_and_app_path
run_case archive_contains_committed_content_not_worktree_content
run_case archive_rejects_symlink_hardlink_device_fifo_and_traversal
run_case ssh_and_scp_always_use_strict_options
run_case bootstrap_requires_approval_ref
run_case bootstrap_accepts_absent_or_empty_inactive_root
run_case bootstrap_rejects_any_file_marker_symlink_or_portal_container
run_case bootstrap_never_invokes_compose_or_writes_deploy_source
run_case bootstrap_partial_copy_cleanup_obeys_root_ownership
run_case transport_temp_files_are_removed_on_success_and_failure
```

The fake Docker must answer only `info` and `ps -aq --filter label=com.docker.compose.project=chatwoot-client-portal-v2` for bootstrap. It must fail the test if any argument contains `compose up`, `build`, `pull`, `volume`, `system prune` or a broad `rm` operation.

- [ ] **Step 2: Run the new harness and verify red state**

Run:

```bash
bash scripts/test-production-staged-deploy.sh bootstrap
```

Expected: non-zero because the public and remote scripts do not exist; the harness itself cleans its temporary Git/remote roots.

- [ ] **Step 3: Implement CLI validation and exact Git provenance before SSH/SCP**

In `scripts/deploy-production-staged.sh`, parse the phase separately and every option only as `--name=value`. Reject duplicates and phase-incompatible options. Use exact validation before any production transport:

```bash
[[ "$REMOTE_APP_PATH" == '/opt/chatwoot-client-portal-v2' ]]
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] && (( SSH_PORT >= 1 && SSH_PORT <= 65535 ))
[[ "$SSH_TARGET" =~ ^[A-Za-z_][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*$ ]]
[[ -z "$APPROVAL_REF" || "$APPROVAL_REF" =~ ^[A-Za-z0-9._:/-]{1,128}$ ]]
[[ "$(git -C "$REPO_ROOT" branch --show-current)" == 'main' ]]
[[ -z "$(git -C "$REPO_ROOT" status --short)" ]]
git -C "$REPO_ROOT" cat-file -e "${COMMIT}^{commit}"
git -C "$REPO_ROOT" fetch --prune origin main
[[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" == \
  "$(git -C "$REPO_ROOT" rev-parse origin/main)" ]]
git -C "$REPO_ROOT" merge-base --is-ancestor "$COMMIT" origin/main
```

Validate the identity as a non-empty regular non-symlink file with no group/world permission bits; validate known-hosts as a non-empty regular non-symlink file with no group/world write bits. Use `ssh-keygen -F "$host" -f "$known_hosts"` for port 22 and `ssh-keygen -F "[$host]:$port" -f ...` otherwise. Invalid local input must fail before archive creation or SSH/SCP; only the required `git fetch` may contact Git origin.

- [ ] **Step 4: Implement deterministic commit archive and strict transport arrays**

Create each source archive from the Git object, not the worktree:

```bash
git -C "$REPO_ROOT" archive \
  --format=tar.gz \
  --output="$archive_path" \
  "$commit"
archive_sha256="$(sha256sum "$archive_path" | awk '{print $1}')"
```

Before upload, inspect every member with Python `tarfile`: require a relative
POSIX path with no `..` component and allow only regular files or directories.
Reject symlinks, hardlinks, devices, FIFOs and every other member type. Repeat
the same inspection after checksum verification on the remote side, before any
extraction. The fixture must include each rejected member type and prove that
no file was created outside the temporary extraction directory.

Build arrays once and reuse them for every call:

```bash
SSH_OPTIONS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$KNOWN_HOSTS_FILE"
  -o IdentitiesOnly=yes
  -i "$IDENTITY_FILE"
  -p "$SSH_PORT"
)
SCP_OPTIONS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$KNOWN_HOSTS_FILE"
  -o IdentitiesOnly=yes
  -i "$IDENTITY_FILE"
  -P "$SSH_PORT"
)
```

Create the remote delivery directory with a constant remote command using `umask 077; mktemp -d /tmp/chatwoot-client-portal-v2-staged.XXXXXX`, validate its returned prefix, upload archive + remote helper + records library, and remove only that validated directory in an EXIT trap. Remote command arguments use separately validated scalars and one `%q` encoding step; never concatenate unvalidated record/env content.

- [ ] **Step 5: Implement the remote helper shell, command selection and non-blocking locks**

The remote helper must:

- select direct `docker` when `docker info` works, otherwise select `sudo docker` only when its `docker info` works;
- require `tar`, `rsync`, `flock`, `sha256sum`, `df`, `stat`, `cmp`, `diff`, `timeout`, `xargs`, `curl` and `python3` only for phases that need them;
- reject a symlinked app root and use the exact production root unless the guarded `/tmp` test override is active;
- re-exec locked phases without leaking the lock FD to Docker/curl children:

```bash
flock --nonblock --close "$lock_path" \
  "$SELF_PATH" "__locked-${phase}" "$@"
```

Use `$HOME/.chatwoot-client-portal-v2-bootstrap.lock` for bootstrap before the
app root exists, after requiring `HOME` to be an owned, non-symlink directory
and the lock to be absent or an owned regular non-symlink mode-0600 file. Use
`<app>/.release-state/deploy.lock` for staged phases with the same file checks.
Refuse overlap with a stable non-zero status; do not wait indefinitely.

- [ ] **Step 6: Implement fail-closed empty-root bootstrap**

Before extraction, bootstrap must prove:

```bash
[[ ! -e "$APP_PATH" || ( -d "$APP_PATH" && ! -L "$APP_PATH" ) ]]
[[ ! -d "$APP_PATH" || -z "$(find "$APP_PATH" -mindepth 1 -maxdepth 1 -print -quit)" ]]
[[ -z "$("${DOCKER[@]}" ps -aq \
  --filter label=com.docker.compose.project=chatwoot-client-portal-v2)" ]]
```

Verify the uploaded checksum before extraction, repeat the strict archive-member
inspection, extract into a mode-0700 temporary directory and require the
expected project files (`package.json`, `scripts/install-production.sh`,
`infra/production/compose.yaml`). Track whether this process created the app
root. Copy exact source, then write `BOOTSTRAP_SOURCE.txt` last through
`release_marker_write_bootstrap`.

If the exact root is absent and the deploy user cannot create it directly,
require non-interactive `sudo` and create only that root with
`sudo install -d -m 0755 -o "$(id -un)" -g "$(id -gn)"`. An existing empty
root must already be writable by the deploy user; never recursively `chown` an
existing path.

The error trap may remove the whole partial root only when `created_app_root=true`, the root was absent at preflight and the portal-container query is still empty. For a pre-existing empty directory or uncertain state, preserve partial evidence and print `bootstrap_failed`; never remove volumes or another path. Success prints `bootstrap_completed` plus commit/checksum and explicitly says production was not activated.

- [ ] **Step 7: Wire the bootstrap phase and ops test entry**

`bootstrap` requires `--approval-ref`, rejects migration policy, uploads only
the candidate archive and invokes only the remote bootstrap phase. At this
checkpoint, `prepare` and `activate` must fail closed before transport with
stable non-zero `prepare_failed` / `activation_refused_state_changed` statuses;
Tasks 3-5 replace those guards only when each phase's complete invariant set is
covered.

Change `package.json` to start the new contract without removing the old helper yet:

```json
"deploy:staged": "bash ./scripts/deploy-production-staged.sh",
"test:ops": "bash ./scripts/test-production-env-upgrade.sh && bash ./scripts/test-production-release-records.sh && bash ./scripts/test-production-staged-deploy.sh"
```

- [ ] **Step 8: Run the bootstrap/provenance gates and independent focused review**

Run:

```bash
bash -n \
  scripts/production-release-records.sh \
  scripts/deploy-production-staged.sh \
  scripts/production-staged-release-remote.sh \
  scripts/test-production-staged-deploy.sh
bash scripts/test-production-staged-deploy.sh bootstrap
pnpm test:ops
pnpm lint
pnpm build
git diff --check
```

Expected: all zero; fake logs prove strict options on every SSH/SCP call and zero Compose mutation. Have a fresh reviewer inspect argument quoting, test-only override gating, symlink/path checks, archive traversal, trap ownership and every `rm`. Fix all findings and rerun the commands.

- [ ] **Step 9: Commit the closed bootstrap/transport slice**

```bash
git add \
  scripts/deploy-production-staged.sh \
  scripts/production-staged-release-remote.sh \
  scripts/test-production-staged-deploy.sh \
  package.json
git commit -m "feat(ops): add exact-source staged deployment entry"
```

### Task 3: Complete Non-Cutover Prepare With Exact Rollback Evidence

**Files:**

- Modify: `scripts/deploy-production-staged.sh`
- Modify: `scripts/production-staged-release-remote.sh`
- Modify: `scripts/test-production-staged-deploy.sh`

**Interfaces:**

- Consumes: exact archive/strict transport from Task 2 and record primitives from Task 1.
- Produces: successful `prepare` with immutable `.releases/<candidate>/manifest.txt`, retained `source.tar.gz`, extracted `source/`, release override, sorted `tenants.tsv`, exact current/candidate image evidence and `.release-state/prepared` pointer.
- Produces: read-only remote `inspect` output containing only protocol, active commit and staged-state presence; the public orchestrator validates every returned field before use.
- Guarantees: no `docker compose up`, container restart, active-root source/marker write, portal DB write or public HTTP call in prepare.

- [ ] **Step 1: Add failing prepare-state, env, image, disk, migration and tenant cases**

Extend the stateful fake Docker to support `compose config/build/ps/exec`, `inspect`, `image inspect/tag/rm` and `pull`. It must keep service→container→image IDs and tag→image IDs in temporary files so tests can prove exactness.

Add exact cases:

```bash
run_case prepare_imports_clean_legacy_current_once
run_case first_prepare_uses_adoption_pointer_without_publishing_current
run_case prepare_rejects_dirty_preview_or_post_staged_legacy_marker
run_case prepare_rejects_missing_running_image_id_before_candidate_build
run_case prepare_does_not_mutate_real_env_when_upgrade_copy_changes
run_case prepare_reports_missing_env_key_names_without_values
run_case prepare_rejects_compose_config_error_and_low_disk
run_case prepare_rejects_compose_without_required_activation_flags
run_case prepare_classifies_each_migration_sensitive_path
run_case prepare_builds_three_full_sha_tags_and_records_exact_ids
run_case prepare_resolves_and_records_bounded_external_images
run_case prepare_rejects_zero_duplicate_invalid_or_more_than_100_tenants
run_case prepare_writes_sorted_matrix_and_immutable_manifest
run_case prepare_rejects_second_candidate_and_safely_replaces_expired_candidate
run_case prepare_never_calls_compose_up_or_changes_active_source
run_case prepare_lock_rejects_overlap
run_case prepare_artifacts_and_logs_contain_no_fixture_secret
```

Seed a fixture env with `PORTAL_V2_POSTGRES_PASSWORD=do-not-leak-prepare-secret`; after every case recursively search the command log, release state and captured output and fail if that sentinel appears.

- [ ] **Step 2: Run the prepare subset and verify red state**

Run:

```bash
bash scripts/test-production-staged-deploy.sh prepare
```

Expected: non-zero at the first prepare implementation assertion; bootstrap cases remain green.

- [ ] **Step 3: Add read-only current inspection and exact current archive upload**

The remote `inspect` phase reads `<app>/.release-state/current` when present;
otherwise it reads the legacy `DEPLOY_SOURCE.txt` and verifies any existing
`adoption` pointer/imported manifest agree. It must not create state. Return
this fixed record to stdout and nothing else:

```text
protocol_version=1
record_kind=current_inspection
current_commit=<sha>
staged_current=true|false
```

When `staged_current=false`, call `release_marker_read_active_commit ... true`; when true, require the new marker and pointer agree and call the reader with `allow-legacy=false`. The public orchestrator validates the record, requires the current commit exists locally and is contained in fetched `origin/main`, creates its exact `git archive`, then uploads both current and candidate archives/checksums. Never accept a commit printed by arbitrary remote text.

- [ ] **Step 4: Implement release layout, immutable pointer/record helpers and first adoption**

Under the non-blocking release lock create only:

```text
.release-state/{adoption,current,previous,prepared,transaction,decisions/,history/}
.releases/<validated-sha>/{source/,source.tar.gz,compose.release.yaml,manifest.txt,tenants.tsv}
```

Before work, reject an unresolved transaction, unknown state entry, symlink anywhere in state/release ancestry, invalid pointer or more than current+previous+one candidate. Pointer writes use mode-0600 temp+rename.

For first adoption:

1. verify current archive checksum and extract it under `.releases/<current>/source`;
2. inspect the running container for each built service with Compose `ps -q`, then `docker inspect --format '{{.Image}}'`;
3. require each image ID still exists;
4. tag exactly those IDs with the three full-current-SHA tags;
5. write the current release override and current-release evidence;
6. atomically write `adoption=<current-sha>` while leaving `current` absent;
7. do not change root source, root marker or containers.

Once `.release-state/current` exists, legacy marker parsing is forbidden and
`adoption` must be absent. If any running image evidence is unavailable, emit
`prepare_failed` and preserve the active runtime unchanged.

- [ ] **Step 5: Generate exact per-release Compose overrides**

Write only the three built services:

```yaml
services:
  portal-backend:
    image: chatwoot-client-portal-v2-portal-backend:<full-sha>
  portal-web:
    image: chatwoot-client-portal-v2-portal-web:<full-sha>
  telegram-bridge:
    image: chatwoot-client-portal-v2-telegram-bridge:<full-sha>
```

Every Compose call uses an array equivalent to:

```bash
"${DOCKER[@]}" compose \
  --project-name chatwoot-client-portal-v2 \
  --env-file "$APP_PATH/.env.production" \
  -f "$release/source/infra/production/compose.yaml" \
  -f "$release/compose.release.yaml"
```

Run `config --quiet`, never print expanded config, and capture `config --images` only for validated image-reference processing.
During prepare, inspect `docker compose up --help` without mutation and require
support for `--no-build`, `--pull`, `--wait` and `--wait-timeout`; activation
must never discover a missing CLI capability after cutover begins.

- [ ] **Step 6: Validate env drift, migration class and disk before build**

Copy `.env.production` into a mode-0600 temporary directory. Run the candidate `scripts/ensure-production-object-storage-env.sh --env-file=<copy>` with stdout captured. If `cmp -s` differs, print only the helper's appended/removed key names, delete the entire temp directory including its backup and fail prepare. Always record only `sha256sum` of the real env.

Compare all three migration-sensitive paths between current/candidate extracted sources. Treat `diff` exit `0` as `none`, `1` as `migration`, and any other code as prepare failure. Missing on one side counts as a difference.

Calculate bytes from exact current backend/web/Telegram image IDs and available bytes from `df -Pk`; require:

```bash
required_bytes=$((8 * 1024 * 1024 * 1024))
double_current_bytes=$((2 * current_image_bytes))
(( double_current_bytes > required_bytes )) && required_bytes="$double_current_bytes"
(( available_bytes >= required_bytes ))
```

All three checks precede candidate build.

- [ ] **Step 7: Build and prove candidate/rollback/external image identities**

Run `compose build portal-backend portal-web telegram-bridge` against candidate source/override during prepare only. Inspect each full-SHA tag and store its ID. Re-inspect every rollback tag and require it still maps to the imported current ID.

Normalize `compose config --images` with `LC_ALL=C sort -u`; reject more than 32. For every non-built reference, use local `docker image inspect`; if missing, `docker pull` is allowed only during prepare. Record reference+resolved ID, then revalidate all IDs immediately before manifest publication. Never pull or rebuild a rollback portal image.

- [ ] **Step 8: Query and validate the bounded active-tenant matrix**

Use one `portal-db` exec whose SQL is constant and whose credentials stay inside the container:

```sql
SELECT slug, public_base_url
FROM portal_tenants
WHERE status = 'active'
ORDER BY slug
LIMIT 101;
```

Run `psql` inside the DB container using its `POSTGRES_USER`/`POSTGRES_DB`; output tab-separated rows only. Validate `1..100` rows, unique slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`, and URL as an HTTPS origin with no userinfo/query/fragment/non-root path. Use Python `urllib.parse` for URL structure, then write sorted `tenants.tsv` and its checksum. This is one indexed deployment-time DB read and no write.

- [ ] **Step 9: Publish one immutable prepared manifest and bounded pointer**

Write the canonical prepared manifest, including the validated local
`orchestrator_commit`, into a temp file, validate every field/count/index,
`chmod 600`, then use create-only publication. Set expiry to
`prepared_at_epoch + 86400`. Write `.release-state/prepared` only after
archive/source/override/images/matrix/manifest are all durable.

If `prepared` already points to a non-expired candidate, reject. If expired and not associated with a critical failure/transaction/current/previous, remove only that candidate's validated full-SHA directory and its three tags after verifying each tag still maps to its manifest ID. Then prepare the new candidate; never accumulate a fourth release.

Print `prepared`, candidate/current SHAs, migration classification, UTC expiry, exact portal image IDs and the complete separate activation command. Do not invoke it.

A prepare failure before immutable manifest/pointer publication removes only
the partial candidate directory and candidate full-SHA tags whose IDs were
created by that attempt. A successfully verified first-adoption release and
`adoption` pointer may remain because they exactly describe the still running
unchanged runtime; partial/unverified adoption is removed. Every failure ends
with `status=prepare_failed` and leaves no second candidate slot.

- [ ] **Step 10: Run prepare verification and high-risk focused review**

Run:

```bash
bash -n scripts/deploy-production-staged.sh scripts/production-staged-release-remote.sh scripts/test-production-staged-deploy.sh
bash scripts/test-production-staged-deploy.sh prepare
pnpm test:ops
pnpm test
pnpm lint
pnpm build
git diff --check
```

Expected: all zero; fake Docker proves no `up`/restart and root marker checksum is unchanged. Review immutable record creation, first-adoption boundary, image-ID/tag checks, env redaction, `diff` status handling, integer overflow/units, SQL output validation, retention ownership and every failure trap. Fix findings and repeat all commands.

- [ ] **Step 11: Commit the closed prepare slice**

```bash
git add \
  scripts/deploy-production-staged.sh \
  scripts/production-staged-release-remote.sh \
  scripts/test-production-staged-deploy.sh
git commit -m "feat(ops): prepare exact production releases"
```

### Task 4: Health-Gated Activation, Bounded Tenant Smoke And Journaled Publication

**Files:**

- Modify: `scripts/deploy-production-staged.sh`
- Modify: `scripts/production-staged-release-remote.sh`
- Modify: `scripts/test-production-staged-deploy.sh`

**Interfaces:**

- Consumes: Task 3 immutable prepared manifest, exact images, matrix, release sources and pointers.
- Produces: successful `activate` with no build/pull, pre-cutover transaction journal, exact Compose wait, bounded all-tenant public smoke, recoverable root-source publication, new active marker/current/previous pointers and `activation_succeeded` outcome.
- Produces internal smoke interface: `__smoke-one <expected-slug> <https-origin> <result-dir>`; callers pass NUL-delimited validated data only.
- Defers to Task 5: candidate failure rollback/migration failure handling. Until Task 5, failure after journal creation must preserve evidence and exit non-zero; it must never claim success or clear the journal.

- [ ] **Step 1: Add failing activation validation, smoke, journal and publication cases**

Extend the harness with a fake curl that writes responses to `-o`, implements configured failures/delays, and maintains a `flock`-protected current/max concurrency counter.

Add cases:

```bash
run_case activate_rejects_missing_expired_mismatched_or_incomplete_prepare
run_case activate_rejects_active_env_image_or_tenant_matrix_drift
run_case activate_accepts_newer_compatible_origin_main_orchestrator
run_case activate_rejects_prepare_orchestrator_missing_from_origin_main
run_case activate_rejects_incompatible_orchestrator_protocol
run_case first_activation_requires_matching_adoption_and_legacy_marker
run_case activate_rejects_unresolved_transaction_before_compose
run_case activate_writes_cutover_journal_before_compose_up
run_case activate_uses_no_build_pull_never_wait_120_exactly
run_case activate_checks_built_service_running_health_and_restart_state
run_case smoke_checks_health_and_exact_tenant_slug_for_every_active_tenant
run_case smoke_never_exceeds_five_workers_or_three_attempts
run_case smoke_uses_connect_5_total_15_delay_3_and_timeout_600
run_case activation_does_not_publish_source_or_markers_before_all_smoke_passes
run_case successful_publication_advances_journal_and_writes_markers_last
run_case successful_activation_records_outcome_then_clears_journal
run_case root_sync_preserves_runtime_owned_paths
run_case root_sync_or_marker_failure_never_reports_success
```

The fake runtime must timestamp journal writes, Compose up, each curl, root sync, each marker rename, outcome write and journal removal so ordering is asserted rather than inferred from source text.

- [ ] **Step 2: Run activation subset and verify red state**

Run:

```bash
bash scripts/test-production-staged-deploy.sh activate-success
```

Expected: non-zero at the first activation assertion; prepare/bootstrap subsets remain green.

- [ ] **Step 3: Revalidate every prepared invariant before cutover**

Activation must acquire the same release lock and, before transaction creation:

1. require `.release-state/prepared` equals requested candidate;
2. validate the immutable manifest protocol, all required keys/counts and
   `expires_at_epoch > now`; require prepared `orchestrator_commit` to remain an
   ancestor of freshly fetched `origin/main`, and require current
   `orchestrator_protocol_version` to equal the prepared value;
3. require active marker plus `current` still equal
   `observed_current_commit`; for first adoption only, require `current` absent
   and legacy marker + `adoption` + imported manifest all equal that commit;
4. recompute candidate and rollback archive checksums;
5. recompute real `.env.production` checksum;
6. rerun Compose `config --quiet`;
7. require every candidate/rollback/external tag still maps to its recorded ID;
8. rerun the one bounded tenant query and require byte-identical sorted matrix/checksum;
9. reject migration options on `migration_classification=none`; leave migration decision handling for Task 5.

Any mismatch exits with a specific `activation_refused_*` status before Compose and leaves the prepared candidate for a fresh inspection or new prepare decision. It must not rewrite the immutable manifest.

- [ ] **Step 4: Persist the activation transaction before container mutation**

Create `.release-state/transaction` atomically with:

```text
protocol_version=1
record_kind=activation_transaction
candidate_commit=<sha>
previous_commit=<current-sha>
migration_policy=automatic
phase=cutover_started
started_at_utc=<timestamp>
updated_at_utc=<timestamp>
```

The journal is the one mutable record: every phase update rewrites a fully validated temp record and renames it. The initial journal must be durable before the fake/real command log can show Compose `up`.

- [ ] **Step 5: Activate only already-proven images and check built services**

Invoke exactly:

```bash
"${compose[@]}" up -d \
  --no-build \
  --pull never \
  --wait \
  --wait-timeout 120
```

Do not call `build`, `pull` or plain `up` anywhere in activate. For each of `portal-backend`, `portal-web`, `telegram-bridge`, resolve exactly one container and inspect state. Require `running`; require `healthy` where a healthcheck exists; require no restart after the recorded candidate container start. Do not require stable DB/storage restart count to be zero.

- [ ] **Step 6: Implement one bounded all-tenant smoke pass**

For each sorted TSV row, `__smoke-one` performs:

```bash
curl --fail --silent --show-error \
  --connect-timeout 5 \
  --max-time 15 \
  --retry 2 \
  --retry-delay 3 \
  --retry-all-errors \
  --output "$health_body" \
  "$origin/api/health"

curl --fail --silent --show-error \
  --connect-timeout 5 \
  --max-time 15 \
  --retry 2 \
  --retry-delay 3 \
  --retry-all-errors \
  --output "$tenant_body" \
  "$origin/api/tenant"
```

Discard the health body without logging. Parse the tenant JSON with Python, require an object whose `tenant.slug` exactly equals expected slug, then delete both bodies. Never print a response body.

Feed NUL-delimited `(slug, origin)` arguments to `timeout 600 xargs -0 -n 2 -P 5 ... __smoke-one`. Any worker failure fails the pass. Record only per-slug pass/fail and summary; no runtime polling/job is created.

- [ ] **Step 7: Journal and publish root source plus markers in recoverable order**

After every tenant passes:

1. update journal to `phase=candidate_healthy`;
2. update to `phase=root_sync_started`;
3. `rsync -a --delete` candidate source into root while excluding root-level
   `.env`, `.env.production`, `.env.production.backup.*`, `.git`, `.codex`,
   `.install`, `.release-state`, `.releases`, `logs`, `backups`,
   `BOOTSTRAP_SOURCE.txt` and `DEPLOY_SOURCE.txt`; tracked env example files
   remain part of active source and are updated;
4. update to `phase=root_sync_completed`;
5. create the new active source marker and new `current`/`previous` pointer temp files;
6. rename `DEPLOY_SOURCE.txt`, `previous`, then `current`, with `current` last;
   on first activation set `previous` from `adoption` and remove `adoption`
   only after `current` is durable;
7. update journal to `phase=markers_published`;
8. write immutable history outcome `activation_succeeded`;
9. remove `.release-state/prepared` and then the transaction journal;
10. run bounded cleanup.

Root sync is explicitly not called atomic. Runtime-owned exclusions are asserted by fixture files whose checksums must remain unchanged. A failure in steps 3-7 preserves the journal and returns `activation_failed_publication`; Task 5 will add policy-aware automatic restoration.

- [ ] **Step 8: Implement success cleanup bounds**

After candidate becomes current, the old current becomes previous. If an older previous exists, validate its full SHA and manifest ownership, remove only its release directory and its three full-SHA tags whose current IDs still equal the recorded IDs. Never remove current/previous tags, external images, untagged images, volumes or BuildKit cache. Sort history records by embedded epoch/name and keep the newest 20.

- [ ] **Step 9: Run success-path verification and focused review**

Run:

```bash
bash -n scripts/deploy-production-staged.sh scripts/production-staged-release-remote.sh scripts/test-production-staged-deploy.sh
bash scripts/test-production-staged-deploy.sh activate-success
pnpm test:ops
pnpm lint
pnpm build
git diff --check
```

Expected: all zero; max fake curl concurrency `<=5`; no source/pointer change precedes the last successful tenant; current pointer is the last authority marker rename. Review stale-state checks, journal-before-cutover ordering, curl retry math, JSON parsing, xargs argument safety, source exclusions, marker order and cleanup ownership. Fix findings and repeat.

- [ ] **Step 10: Commit the closed success path**

```bash
git add \
  scripts/deploy-production-staged.sh \
  scripts/production-staged-release-remote.sh \
  scripts/test-production-staged-deploy.sh
git commit -m "feat(ops): activate releases behind tenant smoke"
```

### Task 5: Migration Decisions, Automatic Rollback And Critical Failure Preservation

**Files:**

- Modify: `scripts/deploy-production-staged.sh`
- Modify: `scripts/production-staged-release-remote.sh`
- Modify: `scripts/test-production-staged-deploy.sh`

**Interfaces:**

- Consumes: Task 4 journal phases, activation validation, exact previous release and bounded smoke function.
- Produces: immutable migration decision, effective policies `automatic|backward-compatible|forward-only`, exact rollback/restore, critical evidence blocking and stable final statuses.
- Guarantees: candidate failure always exits non-zero, including successful service recovery; down migration/database restore/volume deletion are never attempted.

- [ ] **Step 1: Add failing migration and rollback state-machine cases**

Add exact cases with failure injection before Compose completion, during service checks, during tenant smoke, during root sync and between every marker rename:

```bash
run_case migration_prepare_requires_policy_and_approval_pair
run_case nonmigration_rejects_explicit_migration_policy
run_case migration_decision_is_immutable_and_precedes_cutover
run_case repeated_decision_must_match_existing_policy_and_approval
run_case nonmigration_failure_rolls_back_exact_previous_and_exits_nonzero
run_case backward_compatible_failure_rolls_back_and_exits_nonzero
run_case first_adoption_rollback_promotes_adopted_release_to_current
run_case publication_failure_restores_previous_root_source_and_markers
run_case rollback_repeats_all_tenant_smoke_before_clearing_journal
run_case successful_rollback_records_candidate_failed_rollback_succeeded
run_case rollback_failure_preserves_current_previous_candidate_and_journal
run_case forward_only_failure_never_starts_previous_code
run_case forward_only_failure_preserves_decision_candidate_runtime_and_journal
run_case critical_state_blocks_later_prepare_and_activate
run_case recovered_candidate_is_removed_only_by_exact_owned_ids
run_case no_failure_path_runs_down_migration_restore_prune_or_volume_delete
```

For every case, assert requested-candidate exit status independently from recovered runtime state. A recovered previous release still requires non-zero command exit.

- [ ] **Step 2: Run rollback subset and verify red state**

Run:

```bash
bash scripts/test-production-staged-deploy.sh rollback
```

Expected: non-zero at missing policy/rollback behavior; activation-success remains green.

- [ ] **Step 3: Validate policy arguments and create immutable activation decision**

Public CLI rules:

```text
prepare: migration_policy and approval_ref both forbidden
bootstrap: migration_policy forbidden; approval_ref required
activate nonmigration: both migration fields forbidden
activate migration: policy is backward-compatible|forward-only and approval_ref is required
```

For a migration candidate, create `.release-state/decisions/<candidate>.txt` before transaction/cutover:

```text
protocol_version=1
record_kind=activation_decision
candidate_commit=<sha>
migration_policy=backward-compatible|forward-only
approval_ref=<validated-ref>
recorded_at_utc=<timestamp>
```

Use create-only publication. A retry may reuse an existing decision only when every field except timestamp matches the requested candidate/policy/ref; it must never overwrite a decision to change policy after a failed cutover.

- [ ] **Step 4: Route every candidate/publication failure through one policy-aware handler**

Implement `handle_candidate_failure <failure-stage>` where `failure-stage` is
validated against exactly `compose_wait|service_state|tenant_smoke|root_sync|marker_publish`.
Reject any other value and never accept or persist free-form error text. Use
these exact branches:

- effective `automatic` or `backward-compatible`: call exact rollback, return non-zero regardless of recovery result;
- effective `forward-only`: never call previous Compose, preserve candidate/previous/current/decision/prepared/journal, record `candidate_failed_forward_only`, print exact release IDs/container states without response/env bodies, return non-zero;
- any malformed/missing policy state: fail closed before mutation or preserve evidence if already mutated.

Do not use a broad EXIT trap to guess rollback. Call the handler only after the transaction proves cutover began; ordinary pre-cutover validation failures leave runtime untouched.

- [ ] **Step 5: Implement exact previous-runtime rollback and root restoration**

Rollback must revalidate previous archive/source/override and recorded tags/IDs, then run previous Compose with:

```bash
"${previous_compose[@]}" up -d \
  --no-build \
  --pull never \
  --wait \
  --wait-timeout 120
```

Check the three built services and rerun the same bounded all-tenant matrix smoke. If candidate publication began, rsync previous source into root with the same runtime exclusions, regenerate the exact previous active marker, restore previous pointer state with `current` renamed last, and verify marker/pointer/root source agree.

For first adoption, a successful exact rollback publishes a new active marker
for the adopted commit, writes `current=<adopted-sha>`, removes `adoption` and
leaves `previous` absent. This only converts already rechecked current runtime
to the new state protocol; requested candidate status remains failure.

Only after runtime + all tenants + source + markers pass:

1. write immutable `candidate_failed_rollback_succeeded` outcome;
2. remove failed candidate pointer/artifacts and its three tags only when IDs match;
3. remove the transaction journal;
4. exit non-zero for requested candidate failure.

- [ ] **Step 6: Preserve and block on rollback/forward-only failure**

When rollback health/smoke/source restoration fails, write
`candidate_failed_rollback_failed`, preserve all three releases, all exact image
tags, decision, prepared pointer and transaction, then exit non-zero. When
forward-only activation fails, write `candidate_failed_forward_only` and
preserve the same evidence without starting previous code.

At the start of `prepare` and `activate`, any transaction or critical outcome
linked to the prepared candidate is a hard block. The tool prints the status,
candidate/current/previous SHAs and exact manual evidence paths; this slice does
not invent an automatic recovery command.

- [ ] **Step 7: Complete expiry/failure cleanup and history cap**

Classify cleanup eligibility from validated state, not directory age alone:

- ordinary `prepared` candidate past 24 hours and no transaction/critical outcome: removable;
- candidate with successful rollback outcome: removable after exact tag-ID checks;
- adopted release: retained while `adoption` is valid and `current` is absent;
  removed only by successful first candidate publication or converted to
  `current` by successful exact rollback;
- current, previous, active transaction, rollback failure or forward-only evidence: never removable automatically;
- history: retain latest 20 immutable non-secret records;
- hard transient release count: three, including preserved critical evidence; reject a fourth.

Every removal path must take a validated 40-character SHA and require path prefix `<app>/.releases/`. Never pass user/record text directly to `rm -rf` or `docker image rm`.

- [ ] **Step 8: Run full state-machine verification and independent high-risk review**

Run:

```bash
bash -n scripts/deploy-production-staged.sh scripts/production-staged-release-remote.sh scripts/test-production-staged-deploy.sh
bash scripts/test-production-staged-deploy.sh rollback
pnpm test:ops
pnpm test
pnpm lint
pnpm build
git diff --check
```

Expected: all zero; recovered candidate cases exit non-zero internally while harness proves previous service recovery; critical cases preserve exactly three releases and block a fourth. Request a fresh high-risk reviewer for migration decision immutability, journal lifecycle, rollback correctness, forward-only behavior, failure-stage coverage, evidence retention and destructive commands. Fix every Critical/Important in-scope finding and repeat all gates.

- [ ] **Step 9: Commit the closed rollback state machine**

```bash
git add \
  scripts/deploy-production-staged.sh \
  scripts/production-staged-release-remote.sh \
  scripts/test-production-staged-deploy.sh
git commit -m "feat(ops): add policy-aware deployment rollback"
```

### Task 6: Converge GitHub And Local Operations On One Authority

**Files:**

- Create: `scripts/test-production-deploy-contracts.sh`
- Modify: `.github/workflows/deploy-production.yml:3-98`
- Modify: `package.json:8-23`
- Modify: `scripts/test-production-env-upgrade.sh:4-10,86,115-119`
- Modify: `scripts/test-production-staged-deploy.sh`
- Delete: `scripts/deploy-production-archive.sh`

**Interfaces:**

- Consumes: complete staged public CLI from Tasks 2-5.
- Produces: GitHub `workflow_dispatch` contract with full `commit`, `phase=prepare|activate`, optional paired migration inputs and the same public script.
- Produces: `pnpm deploy:staged -- <phase> ...` and a single `test:ops` chain covering env, records, staged behavior and static authority contracts.
- Removes: all executable/archive/WIP/direct-Compose behavior from the old helper; no compatibility shim remains.

- [ ] **Step 1: Write failing static authority/workflow tests before deleting the old path**

Create `scripts/test-production-deploy-contracts.sh` with exact assertions:

```bash
assert_file_missing scripts/deploy-production-archive.sh
assert_json_script deploy:staged 'bash ./scripts/deploy-production-staged.sh'
assert_json_script_missing deploy:archive
assert_workflow_input commit
assert_workflow_phase_options prepare activate
assert_workflow_delegates_only_to scripts/deploy-production-staged.sh
assert_repo_absent 'ssh-keyscan'
assert_workflow_absent 'git checkout' 'git fetch' 'docker compose' 'up -d' 'bootstrap'
assert_workflow_contains 'fetch-depth: 0' 'ref: main' 'PRODUCTION_SSH_KNOWN_HOSTS'
```

Scope the `ssh-keyscan` assertion to active workflow/scripts changed by this
slice, not historical audit evidence/spec text. Task 7 adds the corresponding
active-operations-doc assertion after replacing those runbooks. Add a workflow
shell-block assertion that missing private key/known-hosts/host/user fails
before calling the staged script.

- [ ] **Step 2: Run the contract test and verify red state**

Run:

```bash
bash scripts/test-production-deploy-contracts.sh
```

Expected: non-zero because the old helper and alternate workflow still exist.

- [ ] **Step 3: Replace the GitHub workflow with a thin staged caller**

Define inputs:

```yaml
inputs:
  commit:
    description: Full lowercase 40-character origin/main commit SHA.
    required: true
    type: string
  phase:
    description: Prepare without cutover, or activate an existing preparation.
    required: true
    type: choice
    options:
      - prepare
      - activate
  migration_policy:
    description: Empty unless the prepared release is migration-sensitive.
    required: false
    type: string
  approval_ref:
    description: Required with a migration policy; never a secret.
    required: false
    type: string
```

Keep `concurrency.group=production`, `cancel-in-progress=false`, Ubuntu 24.04 and the production environment. Add `actions/checkout@v4` with `ref: main` and `fetch-depth: 0`; leaving the action tag open is intentional under `F-SUPPLY-002`.

In one strict shell step, require non-empty SSH host/user/private key/known-hosts, write key and known-hosts to mode 0600, validate the full SHA and phase/policy pairing, then call:

```bash
args=(
  "scripts/deploy-production-staged.sh"
  "$PHASE"
  "--host=$SSH_USER@$SSH_HOST"
  "--ssh-port=$SSH_PORT"
  "--identity-file=$RUNNER_TEMP/production_deploy_key"
  "--app-path=/opt/chatwoot-client-portal-v2"
  "--commit=$COMMIT"
  "--known-hosts-file=$RUNNER_TEMP/production_known_hosts"
)
[[ -n "$MIGRATION_POLICY" ]] && args+=("--migration-policy=$MIGRATION_POLICY")
[[ -n "$APPROVAL_REF" ]] && args+=("--approval-ref=$APPROVAL_REF")
"${args[@]}"
```

There is no remote heredoc, mutable ref, host-key discovery, Git/Docker/Compose command or bootstrap workflow input.

- [ ] **Step 4: Retire the archive helper and update package/ops test wiring**

Delete `scripts/deploy-production-archive.sh` completely. In `package.json`, remove `deploy:archive`, retain `deploy:staged`, and set:

```json
"test:ops": "bash ./scripts/test-production-env-upgrade.sh && bash ./scripts/test-production-release-records.sh && bash ./scripts/test-production-staged-deploy.sh && bash ./scripts/test-production-deploy-contracts.sh"
```

In `scripts/test-production-env-upgrade.sh`, remove `DEPLOY_SCRIPT`, the assertion that the old helper invokes the env upgrader, and the line-order check around `cd "$app_path"`. Keep testing `ensure-production-object-storage-env.sh` directly and keep all Compose/ingress contracts. The staged harness now proves env validation happens only on a temporary copy.

- [ ] **Step 5: Add GitHub/public-CLI equivalence cases to the behavioral harness**

Assert prepare/activate accept the exact argument shape emitted by the workflow, strict options are identical to local use, migration inputs are rejected/accepted identically, and a candidate SHA cannot be replaced by a workflow branch/tag. Also assert every old flag (`--activate`, `--sync-webhook-secret`, `--allow-dirty-preview`, `--preview-label`, `--keep-remote-archive`) is unknown to the new CLI and cannot trigger network work.

- [ ] **Step 6: Run convergence gates and review for alternate authorities**

Run:

```bash
bash -n \
  scripts/production-release-records.sh \
  scripts/deploy-production-staged.sh \
  scripts/production-staged-release-remote.sh \
  scripts/test-production-env-upgrade.sh \
  scripts/test-production-release-records.sh \
  scripts/test-production-staged-deploy.sh \
  scripts/test-production-deploy-contracts.sh
bash scripts/test-production-deploy-contracts.sh
pnpm test:ops
pnpm test
pnpm lint
pnpm build
git diff --check
```

Expected: all zero. Run `rg -n "deploy-production-archive|ssh-keyscan|up -d --build|allow-dirty-preview" .github scripts package.json` and require no active authority match except negative test fixtures. Review workflow secret failure ordering, shell-array quoting, phase/policy pairing, environment protection, concurrency and any leftover source-delivery command. Fix and repeat.

- [ ] **Step 7: Commit the authority convergence slice**

```bash
git add \
  .github/workflows/deploy-production.yml \
  package.json \
  scripts/test-production-env-upgrade.sh \
  scripts/test-production-staged-deploy.sh \
  scripts/test-production-deploy-contracts.sh \
  scripts/deploy-production-archive.sh
git commit -m "fix(ops): converge production deployment authority"
```

### Task 7: Replace Active Operations Guidance And Add Fail-Closed SSH Setup

**Files:**

- Modify: `docs/operations/production-deployment.md:1-180`
- Modify: `docs/operations/production-clean-reinstall.md:250-305,450-520,675-715,770-790`
- Modify: `docs/operations/mt-10-deployment-runbooks.md:1-115,213-255,650-715`
- Modify: `docs/operations/continue-on-new-laptop.md:250-295`
- Modify: `docs/operations/production-server-notes.md:200-225`
- Modify: `docs/operations/telegram-bridge.md:45-70`
- Modify: `docs/operations/mt-10a-tenant-lifecycle-rehearsal.md:95-115,360-375`
- Modify: `scripts/test-production-deploy-contracts.sh`

**Interfaces:**

- Consumes: final CLI/status/retention/policy behavior from Tasks 1-6.
- Produces: one canonical routine runbook plus linked concise references; clean reinstall uses only exceptional bootstrap and retains its separate approval boundary.
- Does not yet close findings or change the stable work log; Task 8 does that only after independent review and all gates.

- [ ] **Step 1: Extend static contracts so stale active runbooks fail**

Add an explicit array of active operations files to `scripts/test-production-deploy-contracts.sh`. Fail if any contains:

```text
scripts/deploy-production-archive.sh
--allow-dirty-preview
--preview-label
docker compose --env-file .env.production -f infra/production/compose.yaml up -d --build
```

Separately reject an executable command line matching
`^[[:space:]]*(\$[[:space:]]+)?ssh-keyscan\b`; allow prose that explicitly
states the command is forbidden.

Also require `production-deployment.md` to contain `prepare`, `activate`, `--no-build`, `--pull never`, `PRODUCTION_SSH_KNOWN_HOSTS`, `backward-compatible`, `forward-only`, `candidate_failed_rollback_succeeded` and the 100-tenant/five-worker bounds. Require `production-clean-reinstall.md` to contain `bootstrap`, `BOOTSTRAP_SOURCE.txt`, empty-root/container refusal and the statement that bootstrap does not start production.

- [ ] **Step 2: Run the contract test and verify stale docs fail**

Run:

```bash
bash scripts/test-production-deploy-contracts.sh
```

Expected: non-zero listing the old helper/preview/direct-build runbook references.

- [ ] **Step 3: Rewrite the canonical routine deployment guide**

In `docs/operations/production-deployment.md`, make these the only normal commands:

```bash
commit="$(git rev-parse HEAD)"

scripts/deploy-production-staged.sh prepare \
  --host=ubuntu@93.77.166.238 \
  --ssh-port=22 \
  --identity-file="$HOME/.ssh/production_deploy_key" \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit="$commit" \
  --known-hosts-file="$HOME/.ssh/production_known_hosts"

scripts/deploy-production-staged.sh activate \
  --host=ubuntu@93.77.166.238 \
  --ssh-port=22 \
  --identity-file="$HOME/.ssh/production_deploy_key" \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit="$commit" \
  --known-hosts-file="$HOME/.ssh/production_known_hosts"
```

State plainly that `prepare` keeps current containers serving; after it reports classification, activation is a separate approval/mutation. Document migration flags, expiry, state paths, exact statuses, all-tenant smoke bounds, automatic rollback/non-zero result, forward-only evidence block, storage/disk limits and the fact that real env drift is remediated separately rather than silently changed.

Remove WIP production previews and bridge-only deploy. Local/device review must use local development or a separately designed non-production environment, not production authority bypass.

- [ ] **Step 4: Document out-of-band host-key verification without TOFU**

Document that an operator obtains the server host public key/fingerprint through the hosting-provider console or another already trusted administrative channel, for example on the server console:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
sudo sed -n '1p' /etc/ssh/ssh_host_ed25519_key.pub
```

After independently comparing the fingerprint, construct the exact host/port known-hosts entry offline and store it mode 0600. For port 22 use `host keytype base64`; for a non-default port use `[host]:port keytype base64`. Never tell the operator to populate trust with `ssh-keyscan` from the same untrusted connection.

Document GitHub secrets `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USER`, `PRODUCTION_SSH_PORT`, `PRODUCTION_SSH_PRIVATE_KEY`, `PRODUCTION_SSH_KNOWN_HOSTS`; `PRODUCTION_APP_PATH` is no longer variable because the script allowlists the exact root.

- [ ] **Step 5: Replace clean reinstall source delivery with bounded bootstrap**

In `docs/operations/production-clean-reinstall.md`, keep the destructive/backup/restore approvals already present, but replace every archive/dirty preview delivery command with:

```bash
scripts/deploy-production-staged.sh bootstrap \
  --host=ubuntu@93.77.166.238 \
  --ssh-port=22 \
  --identity-file="$HOME/.ssh/production_deploy_key" \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --commit="$(git rev-parse HEAD)" \
  --known-hosts-file="$HOME/.ssh/production_known_hosts" \
  --approval-ref=clean-reinstall-2026-07-16-user-approved
```

Explain in order:

1. separate clean-reinstall approval and backups happen first;
2. app root must be absent/empty and no stopped/running portal-project container may exist;
3. bootstrap copies exact source and writes only `BOOTSTRAP_SOURCE.txt`;
4. it never writes env, runs installer/Compose or starts containers;
5. operator separately runs the existing clean installer;
6. with a bootstrap marker, `--skip-public-health` is forbidden;
7. only complete installer success promotes `DEPLOY_SOURCE.txt`;
8. routine future releases use `prepare` then `activate`, never bootstrap.

- [ ] **Step 6: Align all linked operations references**

Update the MT-10 index/checklist, laptop continuation guide and server notes to link to the canonical guide instead of duplicating unsafe commands. Update Telegram bridge guidance: any bridge code release is part of the same three-service staged candidate; webhook configuration remains its separate operator operation, not an activation flag. Update MT-10A evidence to read the new `key=value` active marker (`source_commit=`) and require staged `current` agreement.

Where a document discusses direct Compose commands, keep them only for read-only status/logs or a separately approved clean installer/recovery step. No active routine code-release instruction may use direct `up -d --build`.

- [ ] **Step 7: Run documentation/contract gates and focused docs review**

Run:

```bash
bash scripts/test-production-deploy-contracts.sh
pnpm exec prettier --check \
  docs/operations/production-deployment.md \
  docs/operations/production-clean-reinstall.md \
  docs/operations/mt-10-deployment-runbooks.md \
  docs/operations/continue-on-new-laptop.md \
  docs/operations/production-server-notes.md \
  docs/operations/telegram-bridge.md \
  docs/operations/mt-10a-tenant-lifecycle-rehearsal.md
pnpm test:ops
pnpm lint
pnpm build
git diff --check
```

Expected: all zero. Review every copied command against `--help`, ensure no command implies `prepare` authorizes activation, ensure bootstrap cannot be mistaken for a deploy, and verify host-key setup has an independent trust source. Fix and repeat.

- [ ] **Step 8: Commit the operations-guidance replacement**

```bash
git add \
  docs/operations/production-deployment.md \
  docs/operations/production-clean-reinstall.md \
  docs/operations/mt-10-deployment-runbooks.md \
  docs/operations/continue-on-new-laptop.md \
  docs/operations/production-server-notes.md \
  docs/operations/telegram-bridge.md \
  docs/operations/mt-10a-tenant-lifecycle-rehearsal.md \
  scripts/test-production-deploy-contracts.sh
git commit -m "docs(ops): adopt staged production runbooks"
```

### Task 8: Independent High-Risk Closure, Finding Retirement And Stable Baseline

**Files:**

- Modify as review requires: only files already in Tasks 1-7
- Modify: `docs/architecture/decisions.md`
- Modify: `docs/roadmap/implementation-plan.md:160-205`
- Modify: `docs/roadmap/work-log.md:98-112` and final `Recommended Next Step`
- Delete after preservation audit: `docs/findings/F-OPS-005-deploy-authority-completion.md`
- Delete after preservation audit: `docs/findings/F-OPS-006-ssh-host-authentication.md`
- Preserve: `docs/findings/F-OPS-004-production-env-propagation.md`
- Preserve: `docs/findings/F-SUPPLY-001-production-advisory-gate.md`
- Preserve: `docs/findings/F-SUPPLY-002-immutable-build-inputs.md`
- Preserve: `docs/findings/F-OPS-007-retire-legacy-deploy-marker-reader.md`

**Interfaces:**

- Consumes: complete implementation and task-level reviews from Tasks 1-7.
- Produces: evidence-backed closure of F-OPS-005/006, stable MT-10 staged-tooling baseline and a clean implementation branch ready for user-approved local merge.
- Does not produce: a production rehearsal, deploy, clean reinstall, migration decision or F-OPS-007 removal.

- [ ] **Step 1: Request one fresh independent high-risk implementation review**

Give the reviewer the approved spec, this plan, branch diff from implementation base and these exact review questions:

```text
1. Can any local/workflow path bypass clean full-SHA origin/main provenance?
2. Can any SSH/SCP path omit strict preverified host authentication?
3. Can prepare mutate containers, root source, env or portal data?
4. Can activate build/pull, proceed from stale evidence or report candidate failure as success?
5. Can interruption occur before a durable journal or can a later command ignore one?
6. Can migration policy be changed after cutover begins?
7. Can rollback use anything except exact previous source/tags/IDs?
8. Can cleanup escape validated owned release paths/tags or touch volumes/data?
9. Can tenant smoke exceed row/concurrency/retry/deadline bounds or leak bodies/secrets?
10. Can bootstrap write a non-empty/active root or start/configure production?
```

Require findings with file/line, impact and proof. Do not accept a summary-only “looks good”.

- [ ] **Step 2: Fix every in-scope review finding with a failing regression first**

For each Critical/Important finding, add a harness/contract test that fails on current code, run it to prove red, make the minimum scoped fix and run the focused subset to green. Minor findings that affect runtime/security/destructive behavior get the same treatment; purely editorial issues may use direct docs correction plus formatter/diff check.

Any adjacent issue outside approved scope becomes one new `docs/findings/F-<AREA>-<NNN>-...md` file following `docs/findings/README.md`; do not silently expand into env propagation, dependency advisories or upstream digest pinning.

- [ ] **Step 3: Run the complete implementation verification matrix**

Run from the implementation worktree with no production credentials/env exported:

```bash
bash -n \
  scripts/production-release-records.sh \
  scripts/deploy-production-staged.sh \
  scripts/production-staged-release-remote.sh \
  scripts/install-production.sh \
  scripts/test-production-env-upgrade.sh \
  scripts/test-production-release-records.sh \
  scripts/test-production-staged-deploy.sh \
  scripts/test-production-deploy-contracts.sh
bash scripts/test-production-release-records.sh
bash scripts/test-production-staged-deploy.sh bootstrap
bash scripts/test-production-staged-deploy.sh prepare
bash scripts/test-production-staged-deploy.sh activate-success
bash scripts/test-production-staged-deploy.sh rollback
bash scripts/test-production-deploy-contracts.sh
pnpm test:ops
pnpm test
pnpm lint
pnpm build
pnpm exec prettier --check \
  .github/workflows/deploy-production.yml \
  package.json \
  docs/operations/production-deployment.md \
  docs/operations/mt-10-deployment-runbooks.md \
  docs/operations/continue-on-new-laptop.md \
  docs/operations/production-server-notes.md \
  docs/operations/telegram-bridge.md \
  docs/operations/production-clean-reinstall.md \
  docs/findings/F-OPS-007-retire-legacy-deploy-marker-reader.md \
  docs/superpowers/specs/2026-07-16-production-staged-deployment-design.md \
  docs/superpowers/plans/2026-07-16-production-staged-deployment.md \
  docs/architecture/decisions.md \
  docs/roadmap/implementation-plan.md \
  docs/roadmap/work-log.md
git diff --check
```

Expected: every command exits zero. The harness summary must show all required cases, fake maximum smoke concurrency `<=5`, zero real network/Docker socket use, and no secret sentinel in output/artifacts.

- [ ] **Step 4: Perform the mandatory docs-preservation audit before finding deletion**

Run and inspect:

```bash
git status --short --branch
git log --all -- docs/findings/F-OPS-005-deploy-authority-completion.md
git log --all -- docs/findings/F-OPS-006-ssh-host-authentication.md
rg -n "F-OPS-005|F-OPS-006" .
```

Expected: only owned implementation changes; both findings have preserved Git history; spec/plan remain; references to close are understood. Do not delete if any F-OPS-005/006 acceptance criterion or reviewer finding remains open.

- [ ] **Step 5: Retire F-OPS-005 and F-OPS-006 only after evidence is green**

Delete exactly:

```text
docs/findings/F-OPS-005-deploy-authority-completion.md
docs/findings/F-OPS-006-ssh-host-authentication.md
```

Keep F-OPS-004, F-SUPPLY-001/002 and F-OPS-007. Rerun `rg` to ensure no stable doc incorrectly calls a closed finding open; historical spec/plan references are allowed as closure evidence.

- [ ] **Step 6: Record the stable operations decision and MT-10 status**

Append this decision to `docs/architecture/decisions.md` with the next available number:

```markdown
## D-030. Production code deploy uses one staged authority

- дата: `2026-07-16`
- решение:
  Local operators and GitHub Actions use one exact-commit staged orchestrator.
  Routine releases are prepared without cutover, then activated separately
  from already-built images with bounded all-tenant smoke, a pre-cutover
  transaction journal and policy-aware exact rollback. Clean reinstall source
  delivery is a separately approved empty-root bootstrap that cannot start the
  portal.
- граница:
  This decision does not authorize a real production rehearsal or deploy. The
  temporary pre-staged source-marker reader remains tracked by `F-OPS-007`;
  dependency/image digest and env-propagation findings remain separate.
- причина:
  The previous archive helper and independent workflow could replace/build the
  active runtime without one immutable provenance, completion and rollback
  contract.
```

Update MT-10 current status in `docs/roadmap/implementation-plan.md`: replace “routine clean archive deploy flow exists” with the implemented staged authority, all-tenant smoke, bounded retention/rollback and an explicit sentence that the first real staged rehearsal is still pending separate approval.

- [ ] **Step 7: Update the work log last and retain one next step**

Replace the obsolete archive-deploy production bullets with concise stable baseline only:

```markdown
- Production code deployment tooling now has one exact-commit staged authority
  for local operators and GitHub Actions: prepare is non-cutover, activate uses
  prebuilt images, bounded all-tenant smoke, a pre-cutover journal and
  policy-aware exact rollback.
- Clean reinstall source delivery uses a separately approved empty-root
  bootstrap that cannot configure or start production. The staged tooling is
  locally verified with fake runtime coverage; no real staged production
  rehearsal has yet been performed.
```

Replace the sole final `Recommended Next Step` with:

```markdown
## Recommended Next Step

- Obtain explicit user approval for the first real staged `prepare` rehearsal
  from an exact clean `main` commit. Do not run `activate` automatically; the
  deferred Deep security audit also remains behind separate explicit approval.
```

Do not add command lists, test counts or review minutiae to the work log.

- [ ] **Step 8: Re-run post-closure docs and full gates**

Run:

```bash
pnpm exec prettier --check \
  docs/architecture/decisions.md \
  docs/roadmap/implementation-plan.md \
  docs/roadmap/work-log.md \
  docs/findings/F-OPS-007-retire-legacy-deploy-marker-reader.md
bash scripts/test-production-deploy-contracts.sh
pnpm test:ops
pnpm test
pnpm lint
pnpm build
pnpm exec prettier --check \
  .github/workflows/deploy-production.yml \
  package.json \
  docs/operations/production-deployment.md \
  docs/operations/mt-10-deployment-runbooks.md \
  docs/operations/continue-on-new-laptop.md \
  docs/operations/production-server-notes.md \
  docs/operations/telegram-bridge.md \
  docs/operations/production-clean-reinstall.md \
  docs/findings/F-OPS-007-retire-legacy-deploy-marker-reader.md \
  docs/superpowers/specs/2026-07-16-production-staged-deployment-design.md \
  docs/superpowers/plans/2026-07-16-production-staged-deployment.md \
  docs/architecture/decisions.md \
  docs/roadmap/implementation-plan.md \
  docs/roadmap/work-log.md
git diff --check
git status --short --branch
```

Expected: all zero; only the intended final docs/finding changes remain unstaged. Confirm again that no command contacted production and no `.env`, key, runtime artifact, test result or generated report is present.

- [ ] **Step 9: Commit closure evidence and stop before merge/production**

```bash
git add \
  docs/architecture/decisions.md \
  docs/roadmap/implementation-plan.md \
  docs/roadmap/work-log.md \
  docs/findings/F-OPS-005-deploy-authority-completion.md \
  docs/findings/F-OPS-006-ssh-host-authentication.md
git commit -m "docs(ops): close staged deployment authority findings"
```

Run `git status --short --branch` and require a clean worktree. Report the branch commits, exact test gates and remaining open F-OPS-004/F-SUPPLY-001/F-SUPPLY-002/F-OPS-007. Offer local merge separately. Do not run a real `prepare`, `activate`, bootstrap or production SSH command without new explicit user approval.
