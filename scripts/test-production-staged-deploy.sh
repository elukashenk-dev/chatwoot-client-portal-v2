#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
PUBLIC_SCRIPT="$SOURCE_ROOT/scripts/deploy-production-staged.sh"
REMOTE_SCRIPT="$SOURCE_ROOT/scripts/production-staged-release-remote.sh"
RECORDS_SCRIPT="$SOURCE_ROOT/scripts/production-release-records.sh"
FILTER="${1:-all}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_fails() {
  if "$@" >/dev/null 2>&1; then
    fail "expected command to fail: $*"
  fi
}

for required in "$PUBLIC_SCRIPT" "$REMOTE_SCRIPT" "$RECORDS_SCRIPT"; do
  [[ -r "$required" ]] || fail "missing staged deploy implementation: $required"
done

# shellcheck source=scripts/deploy-production-staged.sh
source "$PUBLIC_SCRIPT"

CASE_ROOT=''
FIXTURE_REPO=''
FIXTURE_ORIGIN=''
FIXTURE_COMMIT=''
FAKE_BIN=''
FAKE_COMMAND_LOG=''
FAKE_REMOTE_DIR_LOG=''
REMOTE_TEST_ROOT=''
IDENTITY_FILE=''
KNOWN_HOSTS_FILE=''

write_fake_tools() {
  mkdir -p "$FAKE_BIN"

  cat >"$FAKE_BIN/ssh-keygen" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
{
  printf 'ssh-keygen\0'
  printf '%s\0' "$@"
  printf '\0'
} >>"$FAKE_COMMAND_LOG"
[[ "${FAKE_SSH_KEYGEN_FAIL:-false}" != 'true' ]] || exit 1
printf '%s ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeVerifiedHostKey\n' "${2:-example.test}"
SH

  cat >"$FAKE_BIN/scp" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
{
  printf 'scp\0'
  printf '%s\0' "$@"
  printf '\0'
} >>"$FAKE_COMMAND_LOG"
[[ "${FAKE_SCP_FAIL:-false}" != 'true' ]] || exit 73

args=("$@")
destination="${args[${#args[@]} - 1]}"
remote_path="${destination#*:}"
[[ "$remote_path" == /tmp/chatwoot-client-portal-v2-staged.* ]] || exit 74
mkdir -p "$remote_path"

sources=()
index=0
while (( index < ${#args[@]} - 1 )); do
  current="${args[$index]}"
  case "$current" in
    -o|-i|-P)
      index=$((index + 2))
      ;;
    *)
      sources+=("$current")
      index=$((index + 1))
      ;;
  esac
done

for source_path in "${sources[@]}"; do
  cp -- "$source_path" "$remote_path/"
done
SH

  cat >"$FAKE_BIN/ssh" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
{
  printf 'ssh\0'
  printf '%s\0' "$@"
  printf '\0'
} >>"$FAKE_COMMAND_LOG"

args=("$@")
index=0
while (( index < ${#args[@]} )); do
  case "${args[$index]}" in
    -o|-i|-p)
      index=$((index + 2))
      ;;
    *)
      break
      ;;
  esac
done

(( index < ${#args[@]} )) || exit 75
target="${args[$index]}"
index=$((index + 1))
[[ "$target" == *@* ]] || exit 76
(( index < ${#args[@]} )) || exit 77
command_text="${args[$index]}"

if [[ "$command_text" == 'umask 077; mktemp -d /tmp/chatwoot-client-portal-v2-staged.XXXXXX' ]]; then
  remote_dir="$(mktemp -d /tmp/chatwoot-client-portal-v2-staged.XXXXXX)"
  printf '%s\n' "$remote_dir" >>"$FAKE_REMOTE_DIR_LOG"
  printf '%s\n' "$remote_dir"
  exit 0
fi

bash -c "$command_text"
SH

  cat >"$FAKE_BIN/docker" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
{
  printf 'docker\0'
  printf '%s\0' "$@"
  printf '\0'
} >>"$FAKE_COMMAND_LOG"

case "${1:-}" in
  info)
    exit 0
    ;;
  ps)
    printf '%s' "${FAKE_DOCKER_CONTAINERS:-}"
    exit 0
    ;;
  *)
    echo "unexpected fake docker invocation: $*" >&2
    exit 78
    ;;
esac
SH

  chmod +x "$FAKE_BIN/ssh-keygen" "$FAKE_BIN/scp" "$FAKE_BIN/ssh" "$FAKE_BIN/docker"
}

setup_fixture() {
  local name="$1"

  CASE_ROOT="$TMP_DIR/$name"
  FIXTURE_REPO="$CASE_ROOT/repo"
  FIXTURE_ORIGIN="$CASE_ROOT/origin.git"
  FAKE_BIN="$CASE_ROOT/fake-bin"
  FAKE_COMMAND_LOG="$CASE_ROOT/commands.bin"
  FAKE_REMOTE_DIR_LOG="$CASE_ROOT/remote-dirs.log"
  REMOTE_TEST_ROOT="$CASE_ROOT/remote-root"
  IDENTITY_FILE="$CASE_ROOT/identity"
  KNOWN_HOSTS_FILE="$CASE_ROOT/known-hosts"

  mkdir -p "$CASE_ROOT" "$REMOTE_TEST_ROOT" "$CASE_ROOT/home"
  : >"$FAKE_COMMAND_LOG"
  : >"$FAKE_REMOTE_DIR_LOG"
  printf '%s\n' 'fake-private-key' >"$IDENTITY_FILE"
  printf '%s\n' 'example.test ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeVerifiedHostKey' >"$KNOWN_HOSTS_FILE"
  chmod 0600 "$IDENTITY_FILE" "$KNOWN_HOSTS_FILE"

  git init --bare -q "$FIXTURE_ORIGIN"
  git init -q -b main "$FIXTURE_REPO"
  git -C "$FIXTURE_REPO" config user.name 'Staged Deploy Test'
  git -C "$FIXTURE_REPO" config user.email 'staged-deploy@example.test'
  mkdir -p "$FIXTURE_REPO/scripts" "$FIXTURE_REPO/infra/production"
  cp "$PUBLIC_SCRIPT" "$REMOTE_SCRIPT" "$RECORDS_SCRIPT" "$FIXTURE_REPO/scripts/"
  cp "$SOURCE_ROOT/scripts/install-production.sh" "$FIXTURE_REPO/scripts/install-production.sh"
  printf '%s\n' '{"name":"staged-fixture","private":true}' >"$FIXTURE_REPO/package.json"
  printf '%s\n' 'services: {}' >"$FIXTURE_REPO/infra/production/compose.yaml"
  printf '%s\n' 'committed-content' >"$FIXTURE_REPO/release-content.txt"
  chmod +x "$FIXTURE_REPO/scripts/"*.sh
  git -C "$FIXTURE_REPO" add .
  git -C "$FIXTURE_REPO" commit -q -m 'fixture release'
  git -C "$FIXTURE_REPO" remote add origin "$FIXTURE_ORIGIN"
  git -C "$FIXTURE_REPO" push -q -u origin main
  FIXTURE_COMMIT="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"

  write_fake_tools
}

deploy_command() {
  local phase="$1"
  shift

  STAGED_TEST_MODE=1 \
    STAGED_TEST_ROOT="$REMOTE_TEST_ROOT" \
    STAGED_SSH_BIN="$FAKE_BIN/ssh" \
    STAGED_SCP_BIN="$FAKE_BIN/scp" \
    STAGED_SSH_KEYGEN_BIN="$FAKE_BIN/ssh-keygen" \
    STAGED_DOCKER_BIN="$FAKE_BIN/docker" \
    FAKE_COMMAND_LOG="$FAKE_COMMAND_LOG" \
    FAKE_REMOTE_DIR_LOG="$FAKE_REMOTE_DIR_LOG" \
    HOME="$CASE_ROOT/home" \
    "$FIXTURE_REPO/scripts/deploy-production-staged.sh" \
    "$phase" \
    --host=deploy@example.test \
    --ssh-port=22 \
    --identity-file="$IDENTITY_FILE" \
    --app-path=/opt/chatwoot-client-portal-v2 \
    --commit="$FIXTURE_COMMIT" \
    --known-hosts-file="$KNOWN_HOSTS_FILE" \
    "$@"
}

assert_no_transport() {
  [[ ! -s "$FAKE_COMMAND_LOG" ]] || fail 'validation failure unexpectedly reached a transport/tool boundary'
}

assert_status_once() {
  local path="$1"
  local expected="$2"
  local count
  count="$(grep -Ec '^status=' "$path" || true)"
  if [[ "$count" != '1' ]]; then
    sed 's/^/  output: /' "$path" >&2
    fail "expected one status line in $path, got $count"
  fi
  if ! grep -Fxq "status=$expected" "$path"; then
    sed 's/^/  output: /' "$path" >&2
    fail "expected status=$expected in $path"
  fi
}

assert_remote_delivery_cleaned() {
  local path
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    [[ ! -e "$path" ]] || fail "remote delivery directory was not removed: $path"
  done <"$FAKE_REMOTE_DIR_LOG"
}

assert_strict_transport_records() {
  python3 - "$FAKE_COMMAND_LOG" "$IDENTITY_FILE" "$KNOWN_HOSTS_FILE" <<'PY'
import pathlib
import sys

path, identity, known_hosts = sys.argv[1:]
records = []
for raw in pathlib.Path(path).read_bytes().split(b"\0\0"):
    if not raw:
        continue
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if fields and fields[0] in {"ssh", "scp"}:
        records.append(fields)

if not records or {record[0] for record in records} != {"ssh", "scp"}:
    raise SystemExit("missing ssh/scp records")

for record in records:
    joined = "\n".join(record[1:])
    required = [
        "BatchMode=yes",
        "StrictHostKeyChecking=yes",
        f"UserKnownHostsFile={known_hosts}",
        "IdentitiesOnly=yes",
        identity,
    ]
    for value in required:
        if value not in joined:
            raise SystemExit(f"{record[0]} missing strict option {value}")
PY
}

assert_no_mutating_docker_records() {
  python3 - "$FAKE_COMMAND_LOG" <<'PY'
import pathlib
import sys

for raw in pathlib.Path(sys.argv[1]).read_bytes().split(b"\0\0"):
    if not raw:
        continue
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if not fields or fields[0] != "docker":
        continue
    arguments = fields[1:]
    forbidden = {"build", "pull", "volume", "prune"}
    if forbidden.intersection(arguments):
        raise SystemExit(f"forbidden docker invocation: {arguments}")
    if "compose" in arguments and "up" in arguments:
        raise SystemExit(f"forbidden compose activation: {arguments}")
PY
}

assert_no_docker_records() {
  if tr '\0' '\n' <"$FAKE_COMMAND_LOG" | grep -Fxq docker; then
    fail 'validation unexpectedly reached Docker'
  fi
}

rejects_dirty_tree_before_transport() {
  local output
  setup_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  printf '%s\n' 'dirty' >>"$FIXTURE_REPO/release-content.txt"
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  assert_no_transport
}

rejects_non_main_branch_before_transport() {
  setup_fixture "$FUNCNAME"
  git -C "$FIXTURE_REPO" checkout -q -b feature/test
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  assert_no_transport
}

rejects_short_uppercase_unknown_or_non_origin_commit() {
  local original
  setup_fixture "$FUNCNAME"
  original="$FIXTURE_COMMIT"

  FIXTURE_COMMIT='abc123'
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  FIXTURE_COMMIT="${original^^}"
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  FIXTURE_COMMIT="$(printf 'd%.0s' {1..40})"
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  assert_no_transport
}

rejects_local_main_head_that_differs_from_fetched_origin_main() {
  setup_fixture "$FUNCNAME"
  printf '%s\n' 'local-only' >"$FIXTURE_REPO/local-only.txt"
  git -C "$FIXTURE_REPO" add local-only.txt
  git -C "$FIXTURE_REPO" commit -q -m 'local only'
  FIXTURE_COMMIT="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  assert_no_transport
}

rejects_invalid_host_port_identity_known_hosts_and_app_path() {
  setup_fixture "$FUNCNAME"

  assert_fails env \
    STAGED_TEST_MODE=1 STAGED_TEST_ROOT="$REMOTE_TEST_ROOT" \
    "$FIXTURE_REPO/scripts/deploy-production-staged.sh" bootstrap \
    --host=-bad --ssh-port=22 --identity-file="$IDENTITY_FILE" \
    --app-path=/opt/chatwoot-client-portal-v2 --commit="$FIXTURE_COMMIT" \
    --known-hosts-file="$KNOWN_HOSTS_FILE" --approval-ref=test-approved
  chmod 0666 "$IDENTITY_FILE"
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  chmod 0600 "$IDENTITY_FILE"
  : >"$KNOWN_HOSTS_FILE"
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  assert_no_transport
}

archive_contains_committed_content_not_worktree_content() {
  local archive extract
  setup_fixture "$FUNCNAME"
  archive="$CASE_ROOT/source.tar.gz"
  extract="$CASE_ROOT/extract"
  printf '%s\n' 'uncommitted-content' >"$FIXTURE_REPO/release-content.txt"

  staged_create_archive "$FIXTURE_REPO" "$FIXTURE_COMMIT" "$archive"
  staged_validate_archive "$archive"
  mkdir -p "$extract"
  tar -xzf "$archive" -C "$extract"
  grep -Fxq 'committed-content' "$extract/release-content.txt" ||
    fail 'archive did not come from the immutable commit object'
}

archive_rejects_symlink_hardlink_device_fifo_and_traversal() {
  local kind archive
  setup_fixture "$FUNCNAME"

  for kind in symlink hardlink device fifo traversal; do
    archive="$CASE_ROOT/$kind.tar.gz"
    python3 - "$archive" "$kind" <<'PY'
import io
import sys
import tarfile

path, kind = sys.argv[1:]
with tarfile.open(path, "w:gz") as archive:
    member = tarfile.TarInfo("safe")
    if kind == "symlink":
        member.type = tarfile.SYMTYPE
        member.linkname = "/tmp/outside"
    elif kind == "hardlink":
        member.type = tarfile.LNKTYPE
        member.linkname = "/tmp/outside"
    elif kind == "device":
        member.type = tarfile.CHRTYPE
    elif kind == "fifo":
        member.type = tarfile.FIFOTYPE
    else:
        member.name = "../outside"
        member.size = 1
        archive.addfile(member, io.BytesIO(b"x"))
    if kind != "traversal":
        archive.addfile(member)
PY
    assert_fails staged_validate_archive "$archive"
  done
}

remote_rejects_traversing_delivery_path_before_docker() {
  local output checksum
  setup_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  checksum="$(printf 'a%.0s' {1..64})"

  if STAGED_TEST_MODE=1 \
    STAGED_TEST_ROOT="$REMOTE_TEST_ROOT" \
    STAGED_DOCKER_BIN="$FAKE_BIN/docker" \
    FAKE_COMMAND_LOG="$FAKE_COMMAND_LOG" \
    HOME="$CASE_ROOT/home" \
    "$REMOTE_SCRIPT" bootstrap \
    --app-path=/opt/chatwoot-client-portal-v2 \
    --archive-path=/tmp/chatwoot-client-portal-v2-staged.fake/../escape.tar.gz \
    --archive-sha256="$checksum" \
    --commit="$FIXTURE_COMMIT" \
    --approval-ref=test-approved >"$output" 2>&1; then
    fail 'remote helper accepted a traversing archive path'
  fi

  assert_status_once "$output" bootstrap_failed
  assert_no_docker_records
  [[ ! -e "$REMOTE_TEST_ROOT/app" ]] || fail 'unsafe archive path created an application root'
}

ssh_and_scp_always_use_strict_options() {
  local output
  setup_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  deploy_command bootstrap --approval-ref=test-approved >"$output" 2>&1
  assert_status_once "$output" bootstrap_completed
  assert_strict_transport_records
}

bootstrap_requires_approval_ref() {
  setup_fixture "$FUNCNAME"
  assert_fails deploy_command bootstrap
  assert_no_transport
}

bootstrap_accepts_absent_or_empty_inactive_root() {
  local output
  setup_fixture "$FUNCNAME-absent"
  output="$CASE_ROOT/output"
  deploy_command bootstrap --approval-ref=test-approved >"$output" 2>&1
  assert_status_once "$output" bootstrap_completed
  [[ -f "$REMOTE_TEST_ROOT/app/BOOTSTRAP_SOURCE.txt" ]] || fail 'bootstrap marker missing'
  [[ ! -e "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" ]] || fail 'bootstrap must not create active marker'

  setup_fixture "$FUNCNAME-empty"
  mkdir -p "$REMOTE_TEST_ROOT/app"
  output="$CASE_ROOT/output"
  deploy_command bootstrap --approval-ref=test-approved >"$output" 2>&1
  assert_status_once "$output" bootstrap_completed
  [[ -f "$REMOTE_TEST_ROOT/app/BOOTSTRAP_SOURCE.txt" ]] || fail 'empty-root bootstrap marker missing'
}

bootstrap_rejects_any_file_marker_symlink_or_portal_container() {
  local output
  setup_fixture "$FUNCNAME-file"
  mkdir -p "$REMOTE_TEST_ROOT/app"
  printf 'occupied\n' >"$REMOTE_TEST_ROOT/app/existing"
  output="$CASE_ROOT/output"
  if deploy_command bootstrap --approval-ref=test-approved >"$output" 2>&1; then
    fail 'bootstrap unexpectedly accepted an occupied root'
  fi
  assert_status_once "$output" bootstrap_refused_nonempty
  [[ -f "$REMOTE_TEST_ROOT/app/existing" ]] || fail 'bootstrap changed occupied root'

  setup_fixture "$FUNCNAME-symlink"
  mkdir -p "$REMOTE_TEST_ROOT/elsewhere"
  ln -s "$REMOTE_TEST_ROOT/elsewhere" "$REMOTE_TEST_ROOT/app"
  output="$CASE_ROOT/output"
  if deploy_command bootstrap --approval-ref=test-approved >"$output" 2>&1; then
    fail 'bootstrap unexpectedly accepted a symlink root'
  fi
  assert_status_once "$output" bootstrap_refused_nonempty
  [[ -L "$REMOTE_TEST_ROOT/app" ]] || fail 'bootstrap changed symlink root'

  setup_fixture "$FUNCNAME-container"
  export FAKE_DOCKER_CONTAINERS='container-id'
  output="$CASE_ROOT/output"
  if deploy_command bootstrap --approval-ref=test-approved >"$output" 2>&1; then
    fail 'bootstrap unexpectedly accepted an existing portal container'
  fi
  unset FAKE_DOCKER_CONTAINERS
  assert_status_once "$output" bootstrap_refused_nonempty
  [[ ! -e "$REMOTE_TEST_ROOT/app" ]] || fail 'bootstrap created root while portal container existed'
}

bootstrap_never_invokes_compose_or_writes_deploy_source() {
  local output
  setup_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  deploy_command bootstrap --approval-ref=test-approved >"$output" 2>&1
  assert_status_once "$output" bootstrap_completed
  [[ ! -e "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" ]] || fail 'bootstrap wrote active marker'
  assert_no_mutating_docker_records
}

bootstrap_partial_copy_cleanup_obeys_root_ownership() {
  setup_fixture "$FUNCNAME-created"
  export STAGED_TEST_FAIL_AFTER_ROOT_COPY=true
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  unset STAGED_TEST_FAIL_AFTER_ROOT_COPY
  [[ ! -e "$REMOTE_TEST_ROOT/app" ]] || fail 'bootstrap did not remove its newly created partial root'

  setup_fixture "$FUNCNAME-existing"
  mkdir -p "$REMOTE_TEST_ROOT/app"
  export STAGED_TEST_FAIL_AFTER_ROOT_COPY=true
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  unset STAGED_TEST_FAIL_AFTER_ROOT_COPY
  [[ -d "$REMOTE_TEST_ROOT/app" ]] || fail 'bootstrap removed a pre-existing root'
  [[ -e "$REMOTE_TEST_ROOT/app/package.json" ]] || fail 'bootstrap did not preserve partial evidence'
}

transport_temp_files_are_removed_on_success_and_failure() {
  setup_fixture "$FUNCNAME-success"
  deploy_command bootstrap --approval-ref=test-approved >/dev/null 2>&1
  assert_remote_delivery_cleaned

  setup_fixture "$FUNCNAME-failure"
  export FAKE_SCP_FAIL=true
  assert_fails deploy_command bootstrap --approval-ref=test-approved
  unset FAKE_SCP_FAIL
  assert_remote_delivery_cleaned
}

run_case() {
  local name="$1"
  "$name"
  printf 'PASS %s\n' "$name"
}

run_bootstrap_cases() {
  run_case rejects_dirty_tree_before_transport
  run_case rejects_non_main_branch_before_transport
  run_case rejects_short_uppercase_unknown_or_non_origin_commit
  run_case rejects_local_main_head_that_differs_from_fetched_origin_main
  run_case rejects_invalid_host_port_identity_known_hosts_and_app_path
  run_case archive_contains_committed_content_not_worktree_content
  run_case archive_rejects_symlink_hardlink_device_fifo_and_traversal
  run_case remote_rejects_traversing_delivery_path_before_docker
  run_case ssh_and_scp_always_use_strict_options
  run_case bootstrap_requires_approval_ref
  run_case bootstrap_accepts_absent_or_empty_inactive_root
  run_case bootstrap_rejects_any_file_marker_symlink_or_portal_container
  run_case bootstrap_never_invokes_compose_or_writes_deploy_source
  run_case bootstrap_partial_copy_cleanup_obeys_root_ownership
  run_case transport_temp_files_are_removed_on_success_and_failure
}

case "$FILTER" in
  all|bootstrap)
    run_bootstrap_cases
    ;;
  prepare|activate-success|rollback)
    echo "No $FILTER cases registered yet."
    ;;
  *)
    fail "unknown staged deploy test filter: $FILTER"
    ;;
esac

echo 'production staged deploy checks passed'
