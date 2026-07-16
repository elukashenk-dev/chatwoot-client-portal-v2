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
# shellcheck source=scripts/production-release-records.sh
source "$RECORDS_SCRIPT"

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
CURRENT_COMMIT=''
FAKE_DOCKER_STATE_DIR=''
FAKE_TENANTS_FILE=''
FAKE_TENANTS_QUERY_COUNT_FILE=''
FAKE_NOW_EPOCH='1784203200'

readonly CURRENT_BACKEND_ID="sha256:$(printf '1%.0s' {1..64})"
readonly CURRENT_WEB_ID="sha256:$(printf '2%.0s' {1..64})"
readonly CURRENT_TELEGRAM_ID="sha256:$(printf '3%.0s' {1..64})"
readonly CANDIDATE_BACKEND_ID="sha256:$(printf '4%.0s' {1..64})"
readonly CANDIDATE_WEB_ID="sha256:$(printf '5%.0s' {1..64})"
readonly CANDIDATE_TELEGRAM_ID="sha256:$(printf '6%.0s' {1..64})"
readonly EXTERNAL_POSTGRES_ID="sha256:$(printf '7%.0s' {1..64})"
export CURRENT_BACKEND_ID CURRENT_WEB_ID CURRENT_TELEGRAM_ID
export CANDIDATE_BACKEND_ID CANDIDATE_WEB_ID CANDIDATE_TELEGRAM_ID EXTERNAL_POSTGRES_ID

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

mkdir -p "$FAKE_DOCKER_STATE_DIR"
tag_file="$FAKE_DOCKER_STATE_DIR/tags.tsv"
touch "$tag_file"

tag_set() {
  local reference="$1"
  local image_id="$2"
  awk -F '\t' -v ref="$reference" '$1 != ref' "$tag_file" >"$tag_file.tmp"
  printf '%s\t%s\n' "$reference" "$image_id" >>"$tag_file.tmp"
  mv "$tag_file.tmp" "$tag_file"
}

tag_lookup() {
  local reference="$1"
  local value

  case "$reference" in
    "$CURRENT_BACKEND_ID"|"$CURRENT_WEB_ID"|"$CURRENT_TELEGRAM_ID"|\
      "$CANDIDATE_BACKEND_ID"|"$CANDIDATE_WEB_ID"|"$CANDIDATE_TELEGRAM_ID"|\
      "$EXTERNAL_POSTGRES_ID")
      printf '%s\n' "$reference"
      return
      ;;
    postgres:16-alpine)
      printf '%s\n' "$EXTERNAL_POSTGRES_ID"
      return
      ;;
  esac

  value="$(awk -F '\t' -v ref="$reference" '$1 == ref { print $2 }' "$tag_file" | tail -n1)"
  [[ -n "$value" ]] || return 1
  printf '%s\n' "$value"
}

container_image() {
  case "$1" in
    container-backend) printf '%s\n' "$CURRENT_BACKEND_ID" ;;
    container-web) printf '%s\n' "$CURRENT_WEB_ID" ;;
    container-telegram) printf '%s\n' "$CURRENT_TELEGRAM_ID" ;;
    *) return 1 ;;
  esac
}

case "${1:-}" in
  info)
    exit 0
    ;;
  ps)
    printf '%s' "${FAKE_DOCKER_CONTAINERS:-}"
    exit 0
    ;;
  inspect)
    [[ "${2:-}" == '--format' && "${3:-}" == '{{.Image}}' && $# == 4 ]] || exit 78
    target="${@: -1}"
    container_image "$target"
    ;;
  tag)
    tag_set "${3:-}" "${2:-}"
    ;;
  pull)
    [[ "${FAKE_DOCKER_PULL_FAIL:-false}" != 'true' ]] || exit 79
    tag_set "${2:-}" "$EXTERNAL_POSTGRES_ID"
    ;;
  image)
    subcommand="${2:-}"
    target="${@: -1}"
    case "$subcommand" in
      inspect)
        [[ "${3:-}" == '--format' && $# == 5 ]] || exit 78
        [[ "${4:-}" == '{{.Id}}' || "${4:-}" == '{{.Size}}' ]] || exit 78
        [[ "${FAKE_MISSING_IMAGE_REF:-}" != "$target" ]] || exit 1
        image_id="$(tag_lookup "$target")" || exit 1
        if [[ "$*" == *'.Size'* ]]; then
          printf '%s\n' '1073741824'
        else
          printf '%s\n' "$image_id"
        fi
        ;;
      rm)
        reference="${3:-}"
        awk -F '\t' -v ref="$reference" '$1 != ref' "$tag_file" >"$tag_file.tmp"
        mv "$tag_file.tmp" "$tag_file"
        exit 0
        ;;
      *) exit 78 ;;
    esac
    ;;
  compose)
    shift
    [[ "${1:-}" == '--project-name' && "${2:-}" == 'chatwoot-client-portal-v2' ]] || exit 78
    [[ "${3:-}" == '--env-file' && "${4:-}" == */app/.env.production ]] || exit 78
    [[ "${5:-}" == '-f' && "${6:-}" == */source/infra/production/compose.yaml ]] || exit 78
    [[ "${7:-}" == '-f' && "${8:-}" == */compose.release.yaml ]] || exit 78
    shift 8
    compose_command="${1:-}"
    shift || true
    case "$compose_command" in
      config)
        if [[ "${1:-}" == '--quiet' ]]; then
          [[ "${FAKE_COMPOSE_CONFIG_FAIL:-false}" != 'true' ]] || exit 80
          exit 0
        fi
        if [[ "${1:-}" == '--images' ]]; then
          printf '%s\n' \
            "chatwoot-client-portal-v2-portal-backend:$FAKE_CANDIDATE_COMMIT" \
            "chatwoot-client-portal-v2-portal-web:$FAKE_CANDIDATE_COMMIT" \
            "chatwoot-client-portal-v2-telegram-bridge:$FAKE_CANDIDATE_COMMIT"
          if [[ -n "${FAKE_EXTERNAL_IMAGES:-}" ]]; then
            printf '%s\n' "$FAKE_EXTERNAL_IMAGES"
          fi
          exit 0
        fi
        exit 78
        ;;
      build)
        [[ "$*" == 'portal-backend portal-web telegram-bridge' ]] || exit 78
        [[ "${FAKE_COMPOSE_BUILD_FAIL:-false}" != 'true' ]] || exit 81
        tag_set "chatwoot-client-portal-v2-portal-backend:$FAKE_CANDIDATE_COMMIT" "$CANDIDATE_BACKEND_ID"
        [[ "${FAKE_COMPOSE_BUILD_FAIL_AFTER_BACKEND:-false}" != 'true' ]] || exit 81
        tag_set "chatwoot-client-portal-v2-portal-web:$FAKE_CANDIDATE_COMMIT" "$CANDIDATE_WEB_ID"
        tag_set "chatwoot-client-portal-v2-telegram-bridge:$FAKE_CANDIDATE_COMMIT" "$CANDIDATE_TELEGRAM_ID"
        ;;
      ps)
        [[ "${1:-}" == '-q' ]] || exit 78
        service="${2:-}"
        [[ "$service" != "${FAKE_MISSING_RUNNING_SERVICE:-}" ]] || exit 0
        case "$service" in
          portal-backend) printf '%s\n' 'container-backend' ;;
          portal-web) printf '%s\n' 'container-web' ;;
          telegram-bridge) printf '%s\n' 'container-telegram' ;;
          *) exit 1 ;;
        esac
        ;;
      exec)
        [[ $# == 7 && "${1:-}" == '-T' && "${2:-}" == 'portal-db' && "${3:-}" == 'sh' &&
          "${4:-}" == '-ceu' && "${6:-}" == 'sh' ]] || exit 78
        [[ "${7:-}" == $'SELECT slug, public_base_url\nFROM portal_tenants\nWHERE status = \'active\'\nORDER BY slug\nLIMIT 101;' ]] || exit 78
        count=0
        [[ ! -f "$FAKE_TENANTS_QUERY_COUNT_FILE" ]] || count="$(<"$FAKE_TENANTS_QUERY_COUNT_FILE")"
        printf '%s\n' "$((count + 1))" >"$FAKE_TENANTS_QUERY_COUNT_FILE"
        cat "$FAKE_TENANTS_FILE"
        ;;
      up)
        if [[ "${1:-}" == '--help' ]]; then
          if [[ "${FAKE_COMPOSE_HELP_INCOMPLETE:-false}" == 'true' ]]; then
            printf '%s\n' 'Usage: docker compose up'
          else
            for flag in --no-build --pull --wait --wait-timeout; do
              [[ "$flag" == "${FAKE_COMPOSE_MISSING_HELP_FLAG:-}" ]] || printf '%s ' "$flag"
            done
            printf '\n'
          fi
          exit 0
        fi
        echo 'compose up mutation is forbidden in prepare/bootstrap tests' >&2
        exit 82
        ;;
      *)
        echo "unexpected fake compose invocation: $compose_command $*" >&2
        exit 78
        ;;
    esac
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
  FAKE_DOCKER_STATE_DIR="$CASE_ROOT/docker-state"
  FAKE_TENANTS_FILE="$CASE_ROOT/tenants.tsv"
  FAKE_TENANTS_QUERY_COUNT_FILE="$CASE_ROOT/tenant-query-count"
  IDENTITY_FILE="$CASE_ROOT/identity"
  KNOWN_HOSTS_FILE="$CASE_ROOT/known-hosts"
  FAKE_NOW_EPOCH='1784203200'

  mkdir -p "$CASE_ROOT" "$REMOTE_TEST_ROOT" "$CASE_ROOT/home" "$FAKE_DOCKER_STATE_DIR"
  : >"$FAKE_COMMAND_LOG"
  : >"$FAKE_REMOTE_DIR_LOG"
  printf '%s\n' 'fake-private-key' >"$IDENTITY_FILE"
  printf '%s\n' 'example.test ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeVerifiedHostKey' >"$KNOWN_HOSTS_FILE"
  chmod 0600 "$IDENTITY_FILE" "$KNOWN_HOSTS_FILE"

  git init --bare -q "$FIXTURE_ORIGIN"
  git init -q -b main "$FIXTURE_REPO"
  git -C "$FIXTURE_REPO" config user.name 'Staged Deploy Test'
  git -C "$FIXTURE_REPO" config user.email 'staged-deploy@example.test'
  mkdir -p \
    "$FIXTURE_REPO/scripts" \
    "$FIXTURE_REPO/infra/production" \
    "$FIXTURE_REPO/backend/drizzle" \
    "$FIXTURE_REPO/backend/src/db"
  cp "$PUBLIC_SCRIPT" "$REMOTE_SCRIPT" "$RECORDS_SCRIPT" "$FIXTURE_REPO/scripts/"
  cp "$SOURCE_ROOT/scripts/install-production.sh" "$FIXTURE_REPO/scripts/install-production.sh"
  cp "$SOURCE_ROOT/scripts/ensure-production-object-storage-env.sh" "$FIXTURE_REPO/scripts/ensure-production-object-storage-env.sh"
  printf '%s\n' '{"name":"staged-fixture","private":true}' >"$FIXTURE_REPO/package.json"
  printf '%s\n' 'services: {}' >"$FIXTURE_REPO/infra/production/compose.yaml"
  printf '%s\n' 'committed-content' >"$FIXTURE_REPO/release-content.txt"
  printf '%s\n' 'base migration' >"$FIXTURE_REPO/backend/drizzle/0000_base.sql"
  printf '%s\n' 'base drizzle config' >"$FIXTURE_REPO/backend/drizzle.config.ts"
  printf '%s\n' 'base migrate runner' >"$FIXTURE_REPO/backend/src/db/migrate.ts"
  chmod +x "$FIXTURE_REPO/scripts/"*.sh
  git -C "$FIXTURE_REPO" add .
  git -C "$FIXTURE_REPO" commit -q -m 'fixture release'
  git -C "$FIXTURE_REPO" remote add origin "$FIXTURE_ORIGIN"
  git -C "$FIXTURE_REPO" push -q -u origin main
  FIXTURE_COMMIT="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"
  CURRENT_COMMIT="$FIXTURE_COMMIT"
  printf '%s\t%s\n' 'alpha' 'https://alpha.example.test' >"$FAKE_TENANTS_FILE"

  write_fake_tools
}

setup_prepare_fixture() {
  local name="$1"
  local migration_path="${2:-}"
  local app_root

  setup_fixture "$name"
  CURRENT_COMMIT="$FIXTURE_COMMIT"

  if [[ -n "$migration_path" ]]; then
    mkdir -p "$FIXTURE_REPO/$(dirname -- "$migration_path")"
    printf '%s\n' "candidate migration change for $migration_path" >"$FIXTURE_REPO/$migration_path"
  else
    printf '%s\n' 'candidate-content' >"$FIXTURE_REPO/release-content.txt"
  fi
  git -C "$FIXTURE_REPO" add .
  git -C "$FIXTURE_REPO" commit -q -m 'candidate release'
  git -C "$FIXTURE_REPO" push -q origin main
  FIXTURE_COMMIT="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"

  app_root="$REMOTE_TEST_ROOT/app"
  mkdir -p "$app_root"
  git -C "$FIXTURE_REPO" archive "$CURRENT_COMMIT" | tar -x -C "$app_root"
  cat >"$app_root/.env.production" <<'ENV'
PORTAL_V2_POSTGRES_PASSWORD=do-not-leak-prepare-secret
PORTAL_OBJECT_STORAGE_IMAGE=minio:test
PORTAL_OBJECT_STORAGE_MC_IMAGE=mc:test
PORTAL_OBJECT_STORAGE_ROOT_USER=root-user
PORTAL_OBJECT_STORAGE_ROOT_PASSWORD=root-secret
BRANDING_ASSET_STORAGE_ENDPOINT=http://portal-object-storage:9000
BRANDING_ASSET_STORAGE_REGION=us-east-1
BRANDING_ASSET_STORAGE_BUCKET=portal-branding-assets
BRANDING_ASSET_STORAGE_ACCESS_KEY_ID=branding-user
BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY=branding-secret
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE=true
TELEGRAM_BRIDGE_PORT=3401
TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS=10000
TELEGRAM_BRIDGE_MAX_BODY_BYTES=1048576
TELEGRAM_BRIDGE_PROCESSING_STALE_MS=600000
TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT=prompt
TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT=not-found
TELEGRAM_BRIDGE_PHONE_LINKED_TEXT=linked
ENV
  chmod 0600 "$app_root/.env.production"
  printf '%s\n' \
    'app=chatwoot-client-portal-v2' \
    'created_at_utc=2026-07-16T12:00:00Z' \
    'source_branch=main' \
    "source_commit=$CURRENT_COMMIT" \
    'source_dirty=false' \
    'allow_dirty_preview=false' \
    'preview_label=' \
    '' \
    'git_status_short:' \
    '(clean)' >"$app_root/DEPLOY_SOURCE.txt"
  chmod 0644 "$app_root/DEPLOY_SOURCE.txt"
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
    FAKE_DOCKER_STATE_DIR="$FAKE_DOCKER_STATE_DIR" \
    FAKE_TENANTS_FILE="$FAKE_TENANTS_FILE" \
    FAKE_TENANTS_QUERY_COUNT_FILE="$FAKE_TENANTS_QUERY_COUNT_FILE" \
    FAKE_CANDIDATE_COMMIT="$FIXTURE_COMMIT" \
    FAKE_EXTERNAL_IMAGES="${FAKE_EXTERNAL_IMAGES:-postgres:16-alpine}" \
    STAGED_TEST_NOW_EPOCH="$FAKE_NOW_EPOCH" \
    STAGED_TEST_AVAILABLE_BYTES="${STAGED_TEST_AVAILABLE_BYTES:-17179869184}" \
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
  if ! deploy_command bootstrap --approval-ref=test-approved >"$output" 2>&1; then
    sed 's/^/  output: /' "$output" >&2
    fail 'bootstrap transport fixture failed'
  fi
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

prepare_imports_clean_legacy_current_once() {
  local output state release manifest
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  release="$REMOTE_TEST_ROOT/app/.releases/$CURRENT_COMMIT"
  manifest="$release/manifest.txt"
  printf '%s\n' 'tampered-active-root-copy' >"$REMOTE_TEST_ROOT/app/release-content.txt"

  if ! deploy_command prepare >"$output" 2>&1; then
    sed 's/^/  output: /' "$output" >&2
    fail 'prepare did not complete'
  fi
  assert_status_once "$output" prepared
  [[ "$(<"$state/adoption")" == "$CURRENT_COMMIT" ]] || fail 'first prepare did not record adoption pointer'
  [[ ! -e "$state/current" ]] || fail 'first prepare published current before activation'
  [[ -f "$release/source.tar.gz" && -d "$release/source" ]] || fail 'imported current source evidence is incomplete'
  grep -Fxq 'committed-content' "$release/source/release-content.txt" ||
    fail 'imported release source came from the mutable active root instead of the uploaded Git archive'
  grep -Fxq 'record_kind=imported_release' "$manifest" || fail 'imported release manifest is missing'
  grep -Fxq "backend_image_id=$CURRENT_BACKEND_ID" "$manifest" || fail 'imported backend image ID mismatch'
  grep -Fxq "web_image_id=$CURRENT_WEB_ID" "$manifest" || fail 'imported web image ID mismatch'
  grep -Fxq "telegram_image_id=$CURRENT_TELEGRAM_ID" "$manifest" || fail 'imported Telegram image ID mismatch'
  grep -Fxq 'Activation command:' "$output" || fail 'prepare did not print a separate activation command'
  grep -Fq -- "--commit=$FIXTURE_COMMIT" "$output" || fail 'activation command does not identify the prepared commit'
  assert_remote_delivery_cleaned
}

assert_prepare_failure() {
  local output="$1"

  if deploy_command prepare >"$output" 2>&1; then
    sed 's/^/  output: /' "$output" >&2
    fail 'prepare unexpectedly succeeded'
  fi
  assert_status_once "$output" prepare_failed
}

assert_prepare_secret_absent() {
  local output="$1"

  python3 - \
    "$output" \
    "$FAKE_COMMAND_LOG" \
    "$REMOTE_TEST_ROOT/app/.release-state" \
    "$REMOTE_TEST_ROOT/app/.releases" <<'PY'
import pathlib
import sys

needle = b"do-not-leak-prepare-secret"
for raw_path in sys.argv[1:]:
    path = pathlib.Path(raw_path)
    if not path.exists():
        continue
    paths = [path] if path.is_file() else [item for item in path.rglob("*") if item.is_file()]
    for item in paths:
        if needle in item.read_bytes():
            raise SystemExit(f"prepare secret leaked into {item}")
PY
}

advance_candidate_commit() {
  local label="$1"

  printf '%s\n' "$label" >"$FIXTURE_REPO/release-content.txt"
  git -C "$FIXTURE_REPO" add release-content.txt
  git -C "$FIXTURE_REPO" commit -q -m "$label"
  git -C "$FIXTURE_REPO" push -q origin main
  FIXTURE_COMMIT="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"
}

prepare_manifest_path() {
  printf '%s/.releases/%s/manifest.txt\n' "$REMOTE_TEST_ROOT/app" "$FIXTURE_COMMIT"
}

first_prepare_uses_adoption_pointer_without_publishing_current() {
  local output marker_before marker_after
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  marker_before="$(sha256sum "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" | awk '{print $1}')"

  deploy_command prepare >"$output" 2>&1
  assert_status_once "$output" prepared
  [[ "$(<"$REMOTE_TEST_ROOT/app/.release-state/adoption")" == "$CURRENT_COMMIT" ]] ||
    fail 'adoption pointer does not identify the observed current release'
  [[ ! -e "$REMOTE_TEST_ROOT/app/.release-state/current" ]] ||
    fail 'prepare published a staged current pointer'
  marker_after="$(sha256sum "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" | awk '{print $1}')"
  [[ "$marker_before" == "$marker_after" ]] || fail 'prepare changed the active source marker'
}

prepare_rejects_dirty_preview_or_post_staged_legacy_marker() {
  local output state first_candidate wrong_checksum

  setup_prepare_fixture "$FUNCNAME-dirty"
  output="$CASE_ROOT/output"
  sed -i 's/source_dirty=false/source_dirty=true/' "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt"
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-preview"
  output="$CASE_ROOT/output"
  sed -i 's/allow_dirty_preview=false/allow_dirty_preview=true/' "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt"
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-post-staged"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  mkdir -p "$state"
  printf '%s\n' "$CURRENT_COMMIT" >"$state/current"
  chmod 0600 "$state/current"
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-symlink"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  mkdir -p "$state"
  ln -s /tmp "$state/prepared"
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-transaction"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  mkdir -p "$state"
  printf '%s\n' 'unresolved' >"$state/transaction"
  chmod 0600 "$state/transaction"
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-unknown"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  mkdir -p "$state"
  printf '%s\n' 'unexpected' >"$state/unknown-entry"
  chmod 0600 "$state/unknown-entry"
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-public-state"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  mkdir -p "$state"
  chmod 0777 "$state"
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-marker-checksum"
  deploy_command prepare >"$CASE_ROOT/first-output" 2>&1
  first_candidate="$FIXTURE_COMMIT"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  rm -f -- "$state/adoption" "$state/prepared"
  printf '%s\n' "$first_candidate" >"$state/current"
  printf '%s\n' "$CURRENT_COMMIT" >"$state/previous"
  chmod 0600 "$state/current" "$state/previous"
  wrong_checksum="$(printf '0%.0s' {1..64})"
  printf '%s\n' \
    'protocol_version=1' \
    'record_kind=active_source' \
    'app=chatwoot-client-portal-v2' \
    "source_commit=$first_candidate" \
    "archive_sha256=$wrong_checksum" \
    'activated_at_utc=2026-07-16T12:00:00Z' >"$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt"
  chmod 0600 "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt"
  advance_candidate_commit 'candidate after marker checksum drift'
  output="$CASE_ROOT/output"
  assert_prepare_failure "$output"
}

prepare_rejects_missing_running_image_id_before_candidate_build() {
  local output
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  export FAKE_MISSING_RUNNING_SERVICE='portal-web'
  assert_prepare_failure "$output"
  unset FAKE_MISSING_RUNNING_SERVICE
  if tr '\0' '\n' <"$FAKE_COMMAND_LOG" | grep -Fxq build; then
    fail 'candidate build ran before rollback image evidence was complete'
  fi
  [[ ! -e "$REMOTE_TEST_ROOT/app/.release-state/adoption" ]] ||
    fail 'unverified first adoption was published'

  setup_prepare_fixture "$FUNCNAME-image-object"
  output="$CASE_ROOT/output"
  export FAKE_MISSING_IMAGE_REF="$CURRENT_WEB_ID"
  assert_prepare_failure "$output"
  unset FAKE_MISSING_IMAGE_REF
  [[ ! -e "$REMOTE_TEST_ROOT/app/.release-state/adoption" ]] ||
    fail 'adoption was published while a running image object was unavailable'
}

prepare_does_not_mutate_real_env_when_upgrade_copy_changes() {
  local output env_file checksum_before checksum_after
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  env_file="$REMOTE_TEST_ROOT/app/.env.production"
  sed -i '/^TELEGRAM_BRIDGE_MAX_BODY_BYTES=/d' "$env_file"
  checksum_before="$(sha256sum "$env_file" | awk '{print $1}')"

  assert_prepare_failure "$output"
  checksum_after="$(sha256sum "$env_file" | awk '{print $1}')"
  [[ "$checksum_before" == "$checksum_after" ]] || fail 'prepare changed the real production env file'
  grep -Fxq 'Missing production env keys: TELEGRAM_BRIDGE_MAX_BODY_BYTES' "$output" ||
    fail 'prepare did not report the missing env key name'
  assert_prepare_secret_absent "$output"
}

prepare_reports_missing_env_key_names_without_values() {
  local output env_file
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  env_file="$REMOTE_TEST_ROOT/app/.env.production"
  sed -i '/^PORTAL_OBJECT_STORAGE_ROOT_PASSWORD=/d' "$env_file"

  assert_prepare_failure "$output"
  grep -Fxq 'Missing production env keys: PORTAL_OBJECT_STORAGE_ROOT_PASSWORD' "$output" ||
    fail 'missing secret key name was not reported'
  ! grep -q 'root-secret\|branding-secret\|do-not-leak-prepare-secret' "$output" ||
    fail 'prepare printed an env value while reporting drift'
  assert_prepare_secret_absent "$output"
}

prepare_rejects_compose_config_error_and_low_disk() {
  local output

  setup_prepare_fixture "$FUNCNAME-config"
  output="$CASE_ROOT/output"
  export FAKE_COMPOSE_CONFIG_FAIL=true
  assert_prepare_failure "$output"
  unset FAKE_COMPOSE_CONFIG_FAIL
  if tr '\0' '\n' <"$FAKE_COMMAND_LOG" | grep -Fxq build; then
    fail 'candidate build ran after Compose config validation failed'
  fi

  setup_prepare_fixture "$FUNCNAME-disk"
  output="$CASE_ROOT/output"
  export STAGED_TEST_AVAILABLE_BYTES=1
  assert_prepare_failure "$output"
  unset STAGED_TEST_AVAILABLE_BYTES
  if tr '\0' '\n' <"$FAKE_COMMAND_LOG" | grep -Fxq build; then
    fail 'candidate build ran after disk preflight failed'
  fi
}

prepare_rejects_compose_without_required_activation_flags() {
  local output flag
  for flag in --no-build --pull --wait --wait-timeout; do
    setup_prepare_fixture "$FUNCNAME-${flag#--}"
    output="$CASE_ROOT/output"
    export FAKE_COMPOSE_MISSING_HELP_FLAG="$flag"
    assert_prepare_failure "$output"
    unset FAKE_COMPOSE_MISSING_HELP_FLAG
    if tr '\0' '\n' <"$FAKE_COMMAND_LOG" | grep -Fxq build; then
      fail "candidate build ran without required Compose flag $flag"
    fi
  done
}

prepare_classifies_each_migration_sensitive_path() {
  local output manifest path

  setup_prepare_fixture "$FUNCNAME-none"
  output="$CASE_ROOT/output"
  deploy_command prepare >"$output" 2>&1
  manifest="$(prepare_manifest_path)"
  grep -Fxq 'migration_classification=none' "$manifest" ||
    fail 'non-migration candidate was misclassified'

  for path in backend/drizzle/0001_test.sql backend/drizzle.config.ts backend/src/db/migrate.ts; do
    setup_prepare_fixture "$FUNCNAME-$(basename -- "$path")" "$path"
    output="$CASE_ROOT/output"
    deploy_command prepare >"$output" 2>&1
    manifest="$(prepare_manifest_path)"
    grep -Fxq 'migration_classification=migration' "$manifest" ||
      fail "migration-sensitive change was missed: $path"
  done
}

prepare_builds_three_full_sha_tags_and_records_exact_ids() {
  local output manifest tags
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  deploy_command prepare >"$output" 2>&1
  manifest="$(prepare_manifest_path)"
  tags="$FAKE_DOCKER_STATE_DIR/tags.tsv"

  grep -Fxq "backend_image_tag=chatwoot-client-portal-v2-portal-backend:$FIXTURE_COMMIT" "$manifest" ||
    fail 'candidate backend full-SHA tag is missing'
  grep -Fxq "backend_image_id=$CANDIDATE_BACKEND_ID" "$manifest" || fail 'candidate backend ID mismatch'
  grep -Fxq "web_image_id=$CANDIDATE_WEB_ID" "$manifest" || fail 'candidate web ID mismatch'
  grep -Fxq "telegram_image_id=$CANDIDATE_TELEGRAM_ID" "$manifest" || fail 'candidate Telegram ID mismatch'
  grep -Fqx "chatwoot-client-portal-v2-portal-backend:$CURRENT_COMMIT"$'\t'"$CURRENT_BACKEND_ID" "$tags" ||
    fail 'rollback backend tag does not map to the running image ID'
  grep -Fqx "chatwoot-client-portal-v2-portal-backend:$FIXTURE_COMMIT"$'\t'"$CANDIDATE_BACKEND_ID" "$tags" ||
    fail 'candidate backend tag does not map to the built image ID'

  setup_prepare_fixture "$FUNCNAME-conflict"
  output="$CASE_ROOT/output"
  tags="$FAKE_DOCKER_STATE_DIR/tags.tsv"
  printf '%s\t%s\n' \
    "chatwoot-client-portal-v2-portal-backend:$FIXTURE_COMMIT" \
    "$CURRENT_BACKEND_ID" >"$tags"
  assert_prepare_failure "$output"
  grep -Fqx "chatwoot-client-portal-v2-portal-backend:$FIXTURE_COMMIT"$'\t'"$CURRENT_BACKEND_ID" "$tags" ||
    fail 'prepare removed or overwrote a pre-existing conflicting SHA tag'

  setup_prepare_fixture "$FUNCNAME-partial-build"
  output="$CASE_ROOT/output"
  tags="$FAKE_DOCKER_STATE_DIR/tags.tsv"
  export FAKE_COMPOSE_BUILD_FAIL_AFTER_BACKEND=true
  assert_prepare_failure "$output"
  unset FAKE_COMPOSE_BUILD_FAIL_AFTER_BACKEND
  ! grep -Fq "chatwoot-client-portal-v2-portal-backend:$FIXTURE_COMMIT" "$tags" ||
    fail 'partial candidate build left a full-SHA tag behind'
}

prepare_resolves_and_records_bounded_external_images() {
  local output manifest refs index invalid_ref
  setup_prepare_fixture "$FUNCNAME-records"
  output="$CASE_ROOT/output"
  export FAKE_EXTERNAL_IMAGES=$'postgres:16-alpine\nredis:7-alpine'
  deploy_command prepare >"$output" 2>&1
  unset FAKE_EXTERNAL_IMAGES
  manifest="$(prepare_manifest_path)"
  grep -Fxq 'external_image_count=2' "$manifest" || fail 'external image count mismatch'
  grep -Fxq 'external_image_001_ref=postgres:16-alpine' "$manifest" || fail 'first external ref mismatch'
  grep -Fxq "external_image_001_id=$EXTERNAL_POSTGRES_ID" "$manifest" || fail 'first external ID mismatch'
  grep -Fxq 'external_image_002_ref=redis:7-alpine' "$manifest" || fail 'second external ref mismatch'

  setup_prepare_fixture "$FUNCNAME-bounded"
  output="$CASE_ROOT/output"
  refs=''
  for index in $(seq 1 33); do
    refs+="external.example.test/image-$index:1"$'\n'
  done
  export FAKE_EXTERNAL_IMAGES="${refs%$'\n'}"
  assert_prepare_failure "$output"
  unset FAKE_EXTERNAL_IMAGES

  for invalid_ref in '-option-like:1' 'invalid image:1' $'invalid\timage:1' "$(printf 'x%.0s' {1..256})"; do
    setup_prepare_fixture "$FUNCNAME-invalid-$RANDOM"
    output="$CASE_ROOT/output"
    export FAKE_EXTERNAL_IMAGES="$invalid_ref"
    assert_prepare_failure "$output"
    unset FAKE_EXTERNAL_IMAGES
  done
}

prepare_rejects_zero_duplicate_invalid_or_more_than_100_tenants() {
  local output index invalid_url

  setup_prepare_fixture "$FUNCNAME-zero"
  output="$CASE_ROOT/output"
  : >"$FAKE_TENANTS_FILE"
  assert_prepare_failure "$output"
  [[ ! -e "$REMOTE_TEST_ROOT/app/.releases/$FIXTURE_COMMIT" ]] ||
    fail 'failed prepare retained a partial candidate release directory'
  ! grep -Fq "chatwoot-client-portal-v2-portal-backend:$FIXTURE_COMMIT" "$FAKE_DOCKER_STATE_DIR/tags.tsv" ||
    fail 'failed prepare retained a candidate image tag created by that attempt'
  assert_remote_delivery_cleaned

  setup_prepare_fixture "$FUNCNAME-duplicate"
  output="$CASE_ROOT/output"
  printf '%s\t%s\n' alpha https://alpha.example.test alpha https://alpha-2.example.test >"$FAKE_TENANTS_FILE"
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-slug"
  output="$CASE_ROOT/output"
  printf '%s\t%s\n' 'Bad_Slug' https://alpha.example.test >"$FAKE_TENANTS_FILE"
  assert_prepare_failure "$output"

  for invalid_url in \
    http://alpha.example.test \
    https://user@alpha.example.test \
    https://alpha.example.test/path \
    'https://alpha.example.test?query=1' \
    'https://alpha.example.test#fragment'; do
    setup_prepare_fixture "$FUNCNAME-url-$RANDOM"
    output="$CASE_ROOT/output"
    printf '%s\t%s\n' alpha "$invalid_url" >"$FAKE_TENANTS_FILE"
    assert_prepare_failure "$output"
  done

  setup_prepare_fixture "$FUNCNAME-over-100"
  output="$CASE_ROOT/output"
  : >"$FAKE_TENANTS_FILE"
  for index in $(seq -w 0 100); do
    printf 'tenant-%s\thttps://tenant-%s.example.test\n' "$index" "$index" >>"$FAKE_TENANTS_FILE"
  done
  assert_prepare_failure "$output"
}

prepare_writes_sorted_matrix_and_immutable_manifest() {
  local output manifest manifest_checksum mode
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  printf '%s\t%s\n' zulu https://zulu.example.test alpha https://alpha.example.test >"$FAKE_TENANTS_FILE"
  deploy_command prepare >"$output" 2>&1
  manifest="$(prepare_manifest_path)"

  diff -u <(printf '%s\t%s\n' alpha https://alpha.example.test zulu https://zulu.example.test) \
    "$REMOTE_TEST_ROOT/app/.releases/$FIXTURE_COMMIT/tenants.tsv" ||
    fail 'tenant matrix is not canonical and sorted'
  [[ "$(<"$FAKE_TENANTS_QUERY_COUNT_FILE")" == '1' ]] || fail 'prepare did not use exactly one tenant query'
  mode="$(stat -c '%a' "$manifest")"
  [[ "$mode" == '600' ]] || fail "prepared manifest mode is $mode, expected 600"
  manifest_checksum="$(sha256sum "$manifest" | awk '{print $1}')"
  assert_prepare_failure "$CASE_ROOT/second-output"
  [[ "$(sha256sum "$manifest" | awk '{print $1}')" == "$manifest_checksum" ]] ||
    fail 'second prepare mutated an immutable manifest'
}

prepare_rejects_second_candidate_and_safely_replaces_expired_candidate() {
  local output first_candidate second_candidate manifest

  setup_prepare_fixture "$FUNCNAME-unexpired"
  deploy_command prepare >"$CASE_ROOT/first-output" 2>&1
  first_candidate="$FIXTURE_COMMIT"
  advance_candidate_commit 'second unexpired candidate'
  second_candidate="$FIXTURE_COMMIT"
  output="$CASE_ROOT/second-output"
  assert_prepare_failure "$output"
  [[ -d "$REMOTE_TEST_ROOT/app/.releases/$first_candidate" ]] || fail 'unexpired candidate was removed'
  [[ ! -e "$REMOTE_TEST_ROOT/app/.releases/$second_candidate" ]] || fail 'second candidate was accumulated'

  setup_prepare_fixture "$FUNCNAME-expired"
  deploy_command prepare >"$CASE_ROOT/first-output" 2>&1
  first_candidate="$FIXTURE_COMMIT"
  manifest="$REMOTE_TEST_ROOT/app/.releases/$first_candidate/manifest.txt"
  [[ -f "$manifest" ]] || fail 'first prepared manifest is missing'
  FAKE_NOW_EPOCH="$((FAKE_NOW_EPOCH + 86400))"
  advance_candidate_commit 'replacement after expiry'
  second_candidate="$FIXTURE_COMMIT"
  deploy_command prepare >"$CASE_ROOT/second-output" 2>&1
  assert_status_once "$CASE_ROOT/second-output" prepared
  [[ ! -e "$REMOTE_TEST_ROOT/app/.releases/$first_candidate" ]] || fail 'expired candidate was retained'
  [[ -d "$REMOTE_TEST_ROOT/app/.releases/$second_candidate" ]] || fail 'replacement candidate is missing'
  ! grep -Fq "chatwoot-client-portal-v2-portal-backend:$first_candidate" "$FAKE_DOCKER_STATE_DIR/tags.tsv" ||
    fail 'expired candidate backend tag was retained'
  grep -Fq "chatwoot-client-portal-v2-portal-backend:$second_candidate" "$FAKE_DOCKER_STATE_DIR/tags.tsv" ||
    fail 'replacement candidate backend tag is missing'
}

prepare_never_calls_compose_up_or_changes_active_source() {
  local output marker_before marker_after source_before source_after
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  marker_before="$(sha256sum "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" | awk '{print $1}')"
  source_before="$(sha256sum "$REMOTE_TEST_ROOT/app/release-content.txt" | awk '{print $1}')"
  deploy_command prepare >"$output" 2>&1
  marker_after="$(sha256sum "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" | awk '{print $1}')"
  source_after="$(sha256sum "$REMOTE_TEST_ROOT/app/release-content.txt" | awk '{print $1}')"
  [[ "$marker_before" == "$marker_after" && "$source_before" == "$source_after" ]] ||
    fail 'prepare changed active root source or marker'
  python3 - "$FAKE_COMMAND_LOG" <<'PY'
import pathlib
import sys

for raw in pathlib.Path(sys.argv[1]).read_bytes().split(b"\0\0"):
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if fields and fields[0] == "docker" and "compose" in fields and "up" in fields and "--help" not in fields:
        raise SystemExit(f"prepare invoked compose up: {fields}")
PY
}

prepare_lock_rejects_overlap() {
  local output lock lock_fd
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  mkdir -p "$REMOTE_TEST_ROOT/app/.release-state"
  lock="$REMOTE_TEST_ROOT/app/.release-state/deploy.lock"
  : >"$lock"
  chmod 0600 "$lock"
  exec {lock_fd}>"$lock"
  flock --nonblock "$lock_fd"
  assert_prepare_failure "$output"
  flock --unlock "$lock_fd"
  exec {lock_fd}>&-
}

prepare_artifacts_and_logs_contain_no_fixture_secret() {
  local output temp_path
  setup_prepare_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  deploy_command prepare >"$output" 2>&1
  assert_prepare_secret_absent "$output"

  setup_prepare_fixture "$FUNCNAME-interrupt"
  output="$CASE_ROOT/output"
  export STAGED_TEST_INTERRUPT_AFTER_ENV_COPY=true
  export STAGED_TEST_ENV_TEMP_MARKER="$REMOTE_TEST_ROOT/env-temp-path"
  assert_prepare_failure "$output"
  unset STAGED_TEST_INTERRUPT_AFTER_ENV_COPY STAGED_TEST_ENV_TEMP_MARKER
  [[ -f "$REMOTE_TEST_ROOT/env-temp-path" ]] || fail 'interrupt fixture did not observe the temporary env directory'
  temp_path="$(<"$REMOTE_TEST_ROOT/env-temp-path")"
  [[ "$temp_path" == /tmp/chatwoot-client-portal-v2-env-check.* ]] || fail 'interrupt fixture recorded an unsafe temp path'
  [[ ! -e "$temp_path" ]] || fail 'interrupted prepare retained a secret env temporary directory'
  [[ ! -e "$REMOTE_TEST_ROOT/app/.releases/$FIXTURE_COMMIT" ]] ||
    fail 'interrupted prepare retained a partial candidate directory'
}

assert_all_prepare_outputs_are_redacted() {
  python3 - "$TMP_DIR" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
needles = (
    b"do-not-leak-prepare-secret",
    b"root-secret",
    b"branding-secret",
)
for path in root.rglob("*"):
    if not path.is_file() or path.name == ".env.production":
        continue
    data = path.read_bytes()
    for needle in needles:
        if needle in data:
            raise SystemExit(f"prepare secret leaked into {path}")
PY
}

run_case() {
  local name="$1"
  "$name"
  if [[ "$name" == prepare_* ]]; then
    assert_all_prepare_outputs_are_redacted
  fi
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

run_prepare_cases() {
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
}

case "$FILTER" in
  all)
    run_bootstrap_cases
    run_prepare_cases
    ;;
  bootstrap)
    run_bootstrap_cases
    ;;
  prepare)
    run_prepare_cases
    ;;
  case:*)
    run_case "${FILTER#case:}"
    ;;
  activate-success|rollback)
    echo "No $FILTER cases registered yet."
    ;;
  *)
    fail "unknown staged deploy test filter: $FILTER"
    ;;
esac

echo 'production staged deploy checks passed'
