#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
PUBLIC_SCRIPT="$SOURCE_ROOT/scripts/deploy-production-staged.sh"
REMOTE_SCRIPT="$SOURCE_ROOT/scripts/production-staged-release-remote.sh"
RECORDS_SCRIPT="$SOURCE_ROOT/scripts/production-release-records.sh"
FILTER="${1:-all}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  if [[ "${STAGED_TEST_KEEP_TMP:-false}" == '1' ]]; then
    printf 'KEPT_TEST_TMP=%s\n' "$TMP_DIR" >&2
    return
  fi
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
FAKE_EVENT_LOG=''
FAKE_EVENT_COUNTER=''
FAKE_CURL_STATE_DIR=''
FAKE_CONTAINER_STATE_FILE=''
PREPARED_COMMIT=''
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

  cat >"$FAKE_BIN/record-event" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
event="${1:-}"
detail="${2:-}"
[[ "$event" =~ ^[a-z0-9_.:-]+$ && "$detail" != *$'\n'* && "$detail" != *$'\t'* ]] || exit 90
mkdir -p "$(dirname -- "$FAKE_EVENT_LOG")"
touch "$FAKE_EVENT_LOG" "$FAKE_EVENT_COUNTER"
exec 9>"$FAKE_EVENT_COUNTER.lock"
flock -x 9
sequence=0
[[ ! -s "$FAKE_EVENT_COUNTER" ]] || sequence="$(<"$FAKE_EVENT_COUNTER")"
sequence=$((sequence + 1))
printf '%s\n' "$sequence" >"$FAKE_EVENT_COUNTER"
printf '%08d\t%s\t%s\t%s\n' "$sequence" "$(date -u +%s%N)" "$event" "$detail" >>"$FAKE_EVENT_LOG"
SH

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

if [[ "${FAKE_SSH_FAIL_CLEANUP:-false}" == 'true' &&
  "$command_text" == rm\ -rf\ --\ /tmp/chatwoot-client-portal-v2-staged.* ]]; then
  exit 88
fi

if [[ "$command_text" == *"/production-staged-release-remote.sh activate "* &&
  -n "${FAKE_SSH_FINAL_ACTIVATE_EXIT:-}" ]]; then
  [[ "$FAKE_SSH_FINAL_ACTIVATE_EXIT" == '130' || "$FAKE_SSH_FINAL_ACTIVATE_EXIT" == '255' ]] || exit 87
  exit "$FAKE_SSH_FINAL_ACTIVATE_EXIT"
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
container_file="$FAKE_CONTAINER_STATE_FILE"
container_lock="$FAKE_DOCKER_STATE_DIR/containers.lock"

initialize_containers() {
  [[ -s "$container_file" ]] && return 0
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    container-backend portal-backend "$CURRENT_BACKEND_ID" true healthy 0 2026-07-16T12:00:00Z \
    container-web portal-web "$CURRENT_WEB_ID" true healthy 0 2026-07-16T12:00:00Z \
    container-telegram telegram-bridge "$CURRENT_TELEGRAM_ID" true none 0 2026-07-16T12:00:00Z \
    >"$container_file"
}

container_field() {
  local container_id="$1"
  local field="$2"
  local column
  case "$field" in
    service) column=2 ;;
    image) column=3 ;;
    running) column=4 ;;
    health) column=5 ;;
    restarts) column=6 ;;
    started_at) column=7 ;;
    *) return 1 ;;
  esac
  awk -F '\t' -v wanted="$container_id" -v column="$column" '$1 == wanted { print $column }' "$container_file" | tail -n1
}

set_candidate_containers() {
  local service health running restarts
  : >"$container_file.tmp"
  for service in portal-backend portal-web telegram-bridge; do
    running=true
    [[ "$service" != "${FAKE_SERVICE_NOT_RUNNING:-}" ]] || running=false
    health=healthy
    [[ "$service" != 'telegram-bridge' ]] || health=none
    [[ "$service" != "${FAKE_SERVICE_WITHOUT_HEALTHCHECK:-}" ]] || health=none
    [[ "$service" != "${FAKE_SERVICE_UNHEALTHY:-}" ]] || health=unhealthy
    restarts=0
    [[ "$service" != "${FAKE_SERVICE_RESTARTED:-}" ]] || restarts=1
    case "$service" in
      portal-backend)
        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' container-backend "$service" "$CANDIDATE_BACKEND_ID" "$running" "$health" "$restarts" 2026-07-16T12:10:00Z
        ;;
      portal-web)
        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' container-web "$service" "$CANDIDATE_WEB_ID" "$running" "$health" "$restarts" 2026-07-16T12:10:00Z
        ;;
      telegram-bridge)
        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' container-telegram "$service" "$CANDIDATE_TELEGRAM_ID" "$running" "$health" "$restarts" 2026-07-16T12:10:00Z
        ;;
    esac >>"$container_file.tmp"
  done
  mv "$container_file.tmp" "$container_file"
}

initialize_containers

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
  container_field "$1" image
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
    [[ "${2:-}" == '--format' && $# == 4 ]] || exit 78
    format="${3:-}"
    target="${@: -1}"
    case "$format" in
      '{{.Image}}') container_image "$target" ;;
      '{{.State.Running}}') container_field "$target" running ;;
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}') container_field "$target" health ;;
      '{{.RestartCount}}') container_field "$target" restarts ;;
      '{{.State.StartedAt}}') container_field "$target" started_at ;;
      '{{.Image}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.StartedAt}}')
        printf '%s|%s|%s|%s|%s\n' \
          "$(container_field "$target" image)" \
          "$(container_field "$target" running)" \
          "$(container_field "$target" health)" \
          "$(container_field "$target" restarts)" \
          "$(container_field "$target" started_at)"
        ;;
      *) exit 78 ;;
    esac
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
        [[ "${FAKE_IMAGE_RM_FAIL_REF:-}" != "$reference" ]] || exit 88
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
          portal-backend) container_id='container-backend' ;;
          portal-web) container_id='container-web' ;;
          telegram-bridge) container_id='container-telegram' ;;
          *) exit 1 ;;
        esac
        printf '%s\n' "$container_id"
        [[ "$service" != "${FAKE_COMPOSE_PS_FAIL_SERVICE:-}" ]] || exit 87
        if [[ "$service" == "${FAKE_DUPLICATE_SERVICE_CONTAINER:-}" ||
          ( "$service" == "${FAKE_SCALE_SERVICE_AFTER_CURL:-}" &&
            -e "$FAKE_CURL_STATE_DIR/scale-triggered" ) ]]; then
          printf '%s\n' "$container_id-duplicate"
        fi
        ;;
      exec)
        [[ $# == 7 && "${1:-}" == '-T' && "${2:-}" == 'portal-db' && "${3:-}" == 'sh' &&
          "${4:-}" == '-ceu' && "${6:-}" == 'sh' ]] || exit 78
        [[ "${7:-}" == $'SELECT\n  CASE WHEN octet_length(slug) <= 63 THEN slug ELSE repeat(\'x\', 64) END,\n  CASE WHEN octet_length(public_base_url) <= 2048 THEN public_base_url ELSE repeat(\'x\', 2049) END\nFROM portal_tenants\nWHERE status = \'active\'\nORDER BY portal_tenants.slug\nLIMIT 101;' ]] || exit 78
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
        [[ "$*" == '-d --no-build --pull never --wait --wait-timeout 120' ]] || exit 82
        "$FAKE_BIN/record-event" compose_up "$*"
        [[ "${FAKE_COMPOSE_UP_FAIL:-false}" != 'true' ]] || exit 82
        exec 9>"$container_lock"
        flock -x 9
        set_candidate_containers
        [[ "${FAKE_COMPOSE_UP_FAIL_AFTER_MUTATION:-false}" != 'true' ]] || exit 82
        exit 0
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

  cat >"$FAKE_BIN/curl" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
exec 7>"$FAKE_COMMAND_LOG.lock"
flock -x 7
{
  printf 'curl\0'
  printf '%s\0' "$@"
  printf '\0'
} >>"$FAKE_COMMAND_LOG"
flock -u 7

[[ $# == 17 ]] || exit 83
[[ "$1" == '--fail' && "$2" == '--silent' && "$3" == '--show-error' ]] || exit 83
[[ "$4" == '--connect-timeout' && "$5" == '5' ]] || exit 83
[[ "$6" == '--max-time' && "$7" == '15' ]] || exit 83
[[ "$8" == '--retry' && "$9" == '2' ]] || exit 83
[[ "${10}" == '--retry-delay' && "${11}" == '3' && "${12}" == '--retry-all-errors' ]] || exit 83
[[ "${13}" == '--max-filesize' && "${14}" == '65536' && "${15}" == '--output' ]] || exit 83
output="${16}"
url="${17}"
[[ "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/api/(health|tenant)$ ]] || exit 83
mkdir -p "$FAKE_CURL_STATE_DIR"
touch "$FAKE_CURL_STATE_DIR/current" "$FAKE_CURL_STATE_DIR/max"

finish() {
  local current
  exec 9>"$FAKE_CURL_STATE_DIR/concurrency.lock"
  flock -x 9
  current=0
  [[ ! -s "$FAKE_CURL_STATE_DIR/current" ]] || current="$(<"$FAKE_CURL_STATE_DIR/current")"
  (( current > 0 )) && current=$((current - 1))
  printf '%s\n' "$current" >"$FAKE_CURL_STATE_DIR/current"
}
trap finish EXIT

exec 9>"$FAKE_CURL_STATE_DIR/concurrency.lock"
flock -x 9
current=0
maximum=0
[[ ! -s "$FAKE_CURL_STATE_DIR/current" ]] || current="$(<"$FAKE_CURL_STATE_DIR/current")"
[[ ! -s "$FAKE_CURL_STATE_DIR/max" ]] || maximum="$(<"$FAKE_CURL_STATE_DIR/max")"
current=$((current + 1))
(( current <= maximum )) || maximum="$current"
printf '%s\n' "$current" >"$FAKE_CURL_STATE_DIR/current"
printf '%s\n' "$maximum" >"$FAKE_CURL_STATE_DIR/max"
flock -u 9

"$FAKE_BIN/record-event" curl_start "$url"
sleep "${FAKE_CURL_DELAY_SECONDS:-0.02}"
failures=0
if [[ -n "${FAKE_CURL_FAIL_PATTERN:-}" && "$url" == *"$FAKE_CURL_FAIL_PATTERN"* ]]; then
  failures="${FAKE_CURL_FAILURES_BEFORE_SUCCESS:-3}"
fi
[[ "$failures" =~ ^[0-3]$ ]] || exit 83
for attempt in 1 2 3; do
  "$FAKE_BIN/record-event" curl_attempt "$url#$attempt"
  if (( attempt <= failures )); then
    (( attempt < 3 )) && continue
    "$FAKE_BIN/record-event" curl_failed "$url"
    exit 22
  fi
  break
done

if [[ -n "${FAKE_RESTART_SERVICE_AFTER_CURL:-}" ]]; then
  exec 8>"$FAKE_DOCKER_STATE_DIR/containers.lock"
  flock -x 8
  if [[ ! -e "$FAKE_CURL_STATE_DIR/restart-triggered" ]]; then
    touch "$FAKE_CURL_STATE_DIR/restart-triggered"
    awk -F '\t' -v OFS='\t' -v service="$FAKE_RESTART_SERVICE_AFTER_CURL" \
      '$2 == service { $6 = $6 + 1; $7 = "2026-07-16T12:11:00Z" } { print }' \
      "$FAKE_CONTAINER_STATE_FILE" >"$FAKE_CONTAINER_STATE_FILE.tmp"
    mv "$FAKE_CONTAINER_STATE_FILE.tmp" "$FAKE_CONTAINER_STATE_FILE"
  fi
fi
if [[ -n "${FAKE_SCALE_SERVICE_AFTER_CURL:-}" ]]; then
  touch "$FAKE_CURL_STATE_DIR/scale-triggered"
fi

mkdir -p "$(dirname -- "$output")"
if [[ "$url" == */api/health ]]; then
  if [[ -n "${FAKE_CURL_HEALTH_BODY_BYTES:-}" ]]; then
    [[ "$FAKE_CURL_HEALTH_BODY_BYTES" =~ ^[0-9]+$ ]] || exit 83
    python3 - "$output" "$FAKE_CURL_HEALTH_BODY_BYTES" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
size = int(sys.argv[2])
if not 1 <= size <= 1048576:
    raise SystemExit(1)
path.write_bytes(b"h" * size)
PY
  else
    printf '%s\n' '{"status":"ok","private":"health-body-must-not-be-logged"}' >"$output"
  fi
else
  host="${url#https://}"
  host="${host%%/*}"
  host="${host%%:*}"
  slug="${host%%.*}"
  if [[ -n "${FAKE_CURL_SLUG_MISMATCH_PATTERN:-}" && "$url" == *"$FAKE_CURL_SLUG_MISMATCH_PATTERN"* ]]; then
    slug='wrong-tenant'
  fi
  if [[ -n "${FAKE_CURL_TENANT_BODY_BYTES:-}" ]]; then
    [[ "$FAKE_CURL_TENANT_BODY_BYTES" =~ ^[0-9]+$ ]] || exit 83
    python3 - "$output" "$FAKE_CURL_TENANT_BODY_BYTES" "$slug" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
size = int(sys.argv[2])
slug = sys.argv[3]
prefix = ('{"tenant":{"slug":' + json.dumps(slug) + '},"padding":"').encode()
suffix = b'"}\n'
if not len(prefix) + len(suffix) <= size <= 1048576:
    raise SystemExit(1)
body = prefix + (b"x" * (size - len(prefix) - len(suffix))) + suffix
if len(body) != size:
    raise SystemExit(1)
path.write_bytes(body)
PY
  else
    printf '{"tenant":{"slug":"%s"},"private":"tenant-body-must-not-be-logged"}\n' "$slug" >"$output"
  fi
fi
"$FAKE_BIN/record-event" curl_success "$url"
SH

  cat >"$FAKE_BIN/rsync" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
{
  printf 'rsync\0'
  printf '%s\0' "$@"
  printf '\0'
} >>"$FAKE_COMMAND_LOG"
"$FAKE_BIN/record-event" root_sync "$*"
[[ "${FAKE_RSYNC_FAIL:-false}" != 'true' ]] || exit 84
"${REAL_RSYNC_BIN:-/usr/bin/rsync}" "$@"
[[ "${FAKE_RSYNC_FAIL_AFTER_COPY:-false}" != 'true' ]] || exit 84
SH

  cat >"$FAKE_BIN/timeout" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
{
  printf 'timeout\0'
  printf '%s\0' "$@"
  printf '\0'
} >>"$FAKE_COMMAND_LOG"
[[ "${1:-}" == '600' ]] || exit 85
"$FAKE_BIN/record-event" smoke_timeout "$1"
shift
exec /usr/bin/timeout 600 "$@"
SH

  cat >"$FAKE_BIN/xargs" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
{
  printf 'xargs\0'
  printf '%s\0' "$@"
  printf '\0'
} >>"$FAKE_COMMAND_LOG"
[[ "${1:-}" == '-0' && "${2:-}" == '-n' && "${3:-}" == '2' && "${4:-}" == '-P' && "${5:-}" == '5' ]] || exit 86
"$FAKE_BIN/record-event" smoke_xargs '-0 -n 2 -P 5'
exec /usr/bin/xargs "$@"
SH

  chmod +x \
    "$FAKE_BIN/record-event" "$FAKE_BIN/ssh-keygen" "$FAKE_BIN/scp" "$FAKE_BIN/ssh" \
    "$FAKE_BIN/docker" "$FAKE_BIN/curl" "$FAKE_BIN/rsync" "$FAKE_BIN/timeout" "$FAKE_BIN/xargs"
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
  FAKE_EVENT_LOG="$CASE_ROOT/events.tsv"
  FAKE_EVENT_COUNTER="$CASE_ROOT/event-counter"
  FAKE_CURL_STATE_DIR="$CASE_ROOT/curl-state"
  FAKE_CONTAINER_STATE_FILE="$FAKE_DOCKER_STATE_DIR/containers.tsv"
  PREPARED_COMMIT=''
  IDENTITY_FILE="$CASE_ROOT/identity"
  KNOWN_HOSTS_FILE="$CASE_ROOT/known-hosts"
  FAKE_NOW_EPOCH='1784203200'

  mkdir -p \
    "$CASE_ROOT" "$REMOTE_TEST_ROOT" "$CASE_ROOT/home" "$FAKE_DOCKER_STATE_DIR" \
    "$FAKE_CURL_STATE_DIR"
  : >"$FAKE_COMMAND_LOG"
  : >"$FAKE_REMOTE_DIR_LOG"
  : >"$FAKE_EVENT_LOG"
  : >"$FAKE_EVENT_COUNTER"
  : >"$FAKE_CONTAINER_STATE_FILE"
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
  local requested_commit="${DEPLOY_COMMIT_OVERRIDE:-$FIXTURE_COMMIT}"
  shift

  STAGED_TEST_MODE=1 \
    STAGED_TEST_ROOT="$REMOTE_TEST_ROOT" \
    STAGED_SSH_BIN="$FAKE_BIN/ssh" \
    STAGED_SCP_BIN="$FAKE_BIN/scp" \
    STAGED_SSH_KEYGEN_BIN="$FAKE_BIN/ssh-keygen" \
    STAGED_DOCKER_BIN="$FAKE_BIN/docker" \
    STAGED_CURL_BIN="$FAKE_BIN/curl" \
    STAGED_RSYNC_BIN="$FAKE_BIN/rsync" \
    STAGED_TIMEOUT_BIN="$FAKE_BIN/timeout" \
    STAGED_XARGS_BIN="$FAKE_BIN/xargs" \
    STAGED_TEST_EVENT_LOG="$FAKE_EVENT_LOG" \
    STAGED_TEST_EVENT_RECORDER="$FAKE_BIN/record-event" \
    FAKE_BIN="$FAKE_BIN" \
    FAKE_COMMAND_LOG="$FAKE_COMMAND_LOG" \
    FAKE_REMOTE_DIR_LOG="$FAKE_REMOTE_DIR_LOG" \
    FAKE_DOCKER_STATE_DIR="$FAKE_DOCKER_STATE_DIR" \
    FAKE_CONTAINER_STATE_FILE="$FAKE_CONTAINER_STATE_FILE" \
    FAKE_EVENT_LOG="$FAKE_EVENT_LOG" \
    FAKE_EVENT_COUNTER="$FAKE_EVENT_COUNTER" \
    FAKE_CURL_STATE_DIR="$FAKE_CURL_STATE_DIR" \
    FAKE_TENANTS_FILE="$FAKE_TENANTS_FILE" \
    FAKE_TENANTS_QUERY_COUNT_FILE="$FAKE_TENANTS_QUERY_COUNT_FILE" \
    FAKE_CANDIDATE_COMMIT="$requested_commit" \
    FAKE_EXTERNAL_IMAGES="${FAKE_EXTERNAL_IMAGES:-postgres:16-alpine}" \
    FAKE_SSH_FAIL_CLEANUP="${FAKE_SSH_FAIL_CLEANUP:-false}" \
    FAKE_SSH_FINAL_ACTIVATE_EXIT="${FAKE_SSH_FINAL_ACTIVATE_EXIT:-}" \
    STAGED_TEST_NOW_EPOCH="$FAKE_NOW_EPOCH" \
    STAGED_TEST_CUTOVER_NOW_EPOCH="${STAGED_TEST_CUTOVER_NOW_EPOCH:-}" \
    STAGED_TEST_AVAILABLE_BYTES="${STAGED_TEST_AVAILABLE_BYTES:-17179869184}" \
    HOME="$CASE_ROOT/home" \
    "$FIXTURE_REPO/scripts/deploy-production-staged.sh" \
    "$phase" \
    --host=deploy@example.test \
    --ssh-port=22 \
    --identity-file="$IDENTITY_FILE" \
    --app-path=/opt/chatwoot-client-portal-v2 \
    --commit="$requested_commit" \
    --known-hosts-file="$KNOWN_HOSTS_FILE" \
    "$@"
}

reset_activation_observation() {
  : >"$FAKE_COMMAND_LOG"
  : >"$FAKE_EVENT_LOG"
  : >"$FAKE_EVENT_COUNTER"
  : >"$FAKE_TENANTS_QUERY_COUNT_FILE"
  rm -rf -- "$FAKE_CURL_STATE_DIR"
  mkdir -p "$FAKE_CURL_STATE_DIR"
}

setup_activation_fixture() {
  local name="$1"
  local migration_path="${2:-}"

  setup_prepare_fixture "$name" "$migration_path"
  complete_activation_fixture_prepare
}

complete_activation_fixture_prepare() {
  deploy_command prepare >"$CASE_ROOT/prepare-output" 2>&1 || {
    sed 's/^/  prepare: /' "$CASE_ROOT/prepare-output" >&2
    fail 'activation fixture prepare did not complete'
  }
  assert_status_once "$CASE_ROOT/prepare-output" prepared
  PREPARED_COMMIT="$FIXTURE_COMMIT"
  reset_activation_observation
}

activate_command() {
  DEPLOY_COMMIT_OVERRIDE="$PREPARED_COMMIT" deploy_command activate "$@"
}

assert_activation_refusal() {
  local output="$1"
  local expected_status="$2"
  shift 2

  if activate_command "$@" >"$output" 2>&1; then
    sed 's/^/  output: /' "$output" >&2
    fail 'activation unexpectedly succeeded'
  fi
  assert_status_once "$output" "$expected_status"
}

assert_activation_failure() {
  local output="$1"
  shift

  if activate_command "$@" >"$output" 2>&1; then
    sed 's/^/  output: /' "$output" >&2
    fail 'activation unexpectedly succeeded'
  fi
  [[ "$(grep -Ec '^status=' "$output" || true)" == '1' ]] || {
    sed 's/^/  output: /' "$output" >&2
    fail 'failed activation did not emit exactly one status line'
  }
  ! grep -Fxq 'status=activation_succeeded' "$output" ||
    fail 'failed activation reported success'
}

assert_activation_success() {
  local output="$1"
  shift

  if ! activate_command "$@" >"$output" 2>&1; then
    sed 's/^/  output: /' "$output" >&2
    fail 'activation did not complete'
  fi
  assert_status_once "$output" activation_succeeded
}

activation_manifest_path() {
  printf '%s/.releases/%s/manifest.txt\n' "$REMOTE_TEST_ROOT/app" "$PREPARED_COMMIT"
}

assert_no_compose_cutover() {
  python3 - "$FAKE_COMMAND_LOG" <<'PY'
import pathlib
import sys

for raw in pathlib.Path(sys.argv[1]).read_bytes().split(b"\0\0"):
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if fields and fields[0] == "docker" and "compose" in fields and "up" in fields and "--help" not in fields:
        raise SystemExit(f"unexpected compose cutover: {fields}")
PY
}

assert_exact_compose_cutover() {
  python3 - "$FAKE_COMMAND_LOG" <<'PY'
import pathlib
import sys

records = []
for raw in pathlib.Path(sys.argv[1]).read_bytes().split(b"\0\0"):
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if fields and fields[0] == "docker":
        records.append(fields[1:])

cutovers = [record for record in records if "compose" in record and "up" in record and "--help" not in record]
if len(cutovers) != 1:
    raise SystemExit(f"expected one compose cutover, got {cutovers}")
record = cutovers[0]
expected_tail = ["up", "-d", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "120"]
if record[-len(expected_tail):] != expected_tail:
    raise SystemExit(f"compose cutover tail mismatch: {record}")
for record in records:
    if record and record[0] == "pull":
        raise SystemExit(f"activation pulled an image: {record}")
    if "compose" in record and "build" in record:
        raise SystemExit(f"activation built an image: {record}")
PY
}

assert_events_in_order() {
  local expected
  local -a expectations=("$@")

  expected="$(printf '%s\n' "${expectations[@]}")"
  EXPECTED_EVENTS="$expected" python3 - "$FAKE_EVENT_LOG" <<'PY'
import os
import pathlib
import sys

events = []
for line in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    fields = line.split("\t", 3)
    if len(fields) != 4:
        raise SystemExit(f"invalid event line: {line!r}")
    events.append((int(fields[0]), fields[2], fields[3]))

cursor = -1
for wanted in os.environ["EXPECTED_EVENTS"].splitlines():
    name, separator, detail = wanted.partition("|")
    matches = [sequence for sequence, event, value in events if sequence > cursor and event == name and (not separator or value == detail)]
    if not matches:
        raise SystemExit(f"missing ordered event {wanted!r} after {cursor}; events={events}")
    cursor = matches[0]
PY
}

assert_no_event() {
  local event="$1"
  local detail="${2:-}"
  if awk -F '\t' -v event="$event" -v detail="$detail" \
    '$3 == event && (detail == "" || $4 == detail) { found = 1 } END { exit found ? 0 : 1 }' \
    "$FAKE_EVENT_LOG"; then
    fail "unexpected event: $event${detail:+|$detail}"
  fi
}

replace_fake_tag_id() {
  local reference="$1"
  local image_id="$2"
  local tags="$FAKE_DOCKER_STATE_DIR/tags.tsv"

  awk -F '\t' -v ref="$reference" '$1 != ref' "$tags" >"$tags.tmp"
  printf '%s\t%s\n' "$reference" "$image_id" >>"$tags.tmp"
  mv "$tags.tmp" "$tags"
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
  local output index invalid_url matrix

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

  setup_prepare_fixture "$FUNCNAME-long-slug"
  output="$CASE_ROOT/output"
  printf '%s\t%s\n' "$(printf 'a%.0s' {1..64})" https://alpha.example.test >"$FAKE_TENANTS_FILE"
  assert_prepare_failure "$output"

  for invalid_url in \
    http://alpha.example.test \
    https://user@alpha.example.test \
    https://alpha.example.test:0 \
    https://alpha.example.test/path \
    'https://alpha.example.test?query=1' \
    'https://alpha.example.test#fragment'; do
    setup_prepare_fixture "$FUNCNAME-url-$RANDOM"
    output="$CASE_ROOT/output"
    printf '%s\t%s\n' alpha "$invalid_url" >"$FAKE_TENANTS_FILE"
    assert_prepare_failure "$output"
  done

  setup_prepare_fixture "$FUNCNAME-max-valid-bytes"
  output="$CASE_ROOT/output"
  python3 - "$FAKE_TENANTS_FILE" <<'PY'
import pathlib

path = pathlib.Path(__import__("sys").argv[1])
prefix = "https://"
origin = prefix + ("é" * ((2048 - len(prefix.encode())) // 2))
if len(origin.encode()) != 2048:
    raise SystemExit(1)
rows = []
for index in range(100):
    seed = f"tenant-{index:03d}-"
    slug = seed + ("a" * (63 - len(seed)))
    rows.append(f"{slug}\t{origin}\n")
body = "".join(rows).encode()
if len(body) > 262144:
    raise SystemExit(1)
path.write_bytes(body)
PY
  deploy_command prepare >"$output" 2>&1 || {
    sed 's/^/  output: /' "$output" >&2
    fail 'prepare rejected the maximum valid UTF-8 tenant matrix'
  }
  assert_status_once "$output" prepared
  matrix="$REMOTE_TEST_ROOT/app/.releases/$FIXTURE_COMMIT/tenants.tsv"
  [[ "$(stat -c '%s' "$matrix")" -le 262144 ]] || fail 'accepted tenant matrix exceeded its byte bound'

  setup_prepare_fixture "$FUNCNAME-origin-over-byte-bound"
  output="$CASE_ROOT/output"
  python3 - "$FAKE_TENANTS_FILE" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
prefix = "https://"
origin = prefix + ("é" * ((2048 - len(prefix.encode())) // 2)) + "a"
if len(origin.encode()) != 2049:
    raise SystemExit(1)
path.write_text(f"alpha\t{origin}\n", encoding="utf-8")
PY
  assert_prepare_failure "$output"

  setup_prepare_fixture "$FUNCNAME-raw-matrix-over-byte-bound"
  output="$CASE_ROOT/output"
  python3 - "$FAKE_TENANTS_FILE" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
prefix = b"alpha\thttps://"
body = prefix + (b"a" * (262145 - len(prefix) - 1)) + b"\n"
if len(body) != 262145:
    raise SystemExit(1)
path.write_bytes(body)
PY
  assert_prepare_failure "$output"

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

activate_rejects_missing_expired_mismatched_or_incomplete_prepare() {
  local output manifest checksum_before state old_previous

  setup_activation_fixture "$FUNCNAME-missing"
  output="$CASE_ROOT/output"
  manifest="$(activation_manifest_path)"
  checksum_before="$(sha256sum "$manifest" | awk '{print $1}')"
  rm -f -- "$REMOTE_TEST_ROOT/app/.release-state/prepared"

  assert_activation_refusal "$output" activation_refused_state_changed
  [[ "$(sha256sum "$manifest" | awk '{print $1}')" == "$checksum_before" ]] ||
    fail 'activation refusal rewrote the immutable prepared manifest'
  grep -aq 'ssh' "$FAKE_COMMAND_LOG" ||
    fail 'activation did not reach the remote prepared-state inspection boundary'
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-expired"
  output="$CASE_ROOT/output"
  FAKE_NOW_EPOCH="$((FAKE_NOW_EPOCH + 86400))"
  assert_activation_refusal "$output" activation_refused_expired
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/prepared" ]] ||
    fail 'expired activation removed the prepared pointer'
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-mismatched"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  printf '%s\n' "$CURRENT_COMMIT" >"$state/prepared"
  chmod 0600 "$state/prepared"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-incomplete"
  output="$CASE_ROOT/output"
  rm -f -- "$REMOTE_TEST_ROOT/app/.releases/$PREPARED_COMMIT/tenants.tsv"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-archive"
  output="$CASE_ROOT/output"
  printf '%s\n' 'corrupt archive evidence' >>"$REMOTE_TEST_ROOT/app/.releases/$PREPARED_COMMIT/source.tar.gz"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-missing-old-previous"
  assert_activation_success "$CASE_ROOT/first-activation-output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  old_previous="$(<"$state/previous")"
  advance_candidate_commit 'candidate after missing old previous'
  complete_activation_fixture_prepare
  rm -rf -- "$REMOTE_TEST_ROOT/app/.releases/$old_previous"
  output="$CASE_ROOT/output"
  assert_activation_refusal "$output" activation_refused_state_changed
  [[ ! -e "$state/transaction" ]] || fail 'missing old previous created an activation transaction'
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-corrupt-old-previous"
  assert_activation_success "$CASE_ROOT/first-activation-output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  old_previous="$(<"$state/previous")"
  advance_candidate_commit 'candidate after corrupt old previous'
  complete_activation_fixture_prepare
  printf '%s\n' 'post-prepare corruption' \
    >>"$REMOTE_TEST_ROOT/app/.releases/$old_previous/source/release-content.txt"
  output="$CASE_ROOT/output"
  assert_activation_refusal "$output" activation_refused_state_changed
  [[ ! -e "$state/transaction" ]] || fail 'corrupt old previous created an activation transaction'
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-policy-on-none"
  output="$CASE_ROOT/output"
  assert_activation_refusal \
    "$output" activation_refused_migration_policy \
    --migration-policy=backward-compatible --approval-ref=OPS-TEST-1
  assert_no_compose_cutover
}

activate_rejects_active_env_image_or_tenant_matrix_drift() {
  local output tag

  setup_activation_fixture "$FUNCNAME-active"
  output="$CASE_ROOT/output"
  sed -i \
    "s/source_commit=$CURRENT_COMMIT/source_commit=$PREPARED_COMMIT/" \
    "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-env"
  output="$CASE_ROOT/output"
  printf '%s\n' 'POST_PREPARE_DRIFT=true' >>"$REMOTE_TEST_ROOT/app/.env.production"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-env-mode"
  output="$CASE_ROOT/output"
  chmod 0644 "$REMOTE_TEST_ROOT/app/.env.production"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-image"
  output="$CASE_ROOT/output"
  tag="chatwoot-client-portal-v2-portal-backend:$PREPARED_COMMIT"
  replace_fake_tag_id "$tag" "$CURRENT_BACKEND_ID"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-rollback-image"
  output="$CASE_ROOT/output"
  tag="chatwoot-client-portal-v2-portal-backend:$CURRENT_COMMIT"
  replace_fake_tag_id "$tag" "$CANDIDATE_BACKEND_ID"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_prepare_fixture "$FUNCNAME-external-image"
  export FAKE_EXTERNAL_IMAGES='redis:7-alpine'
  complete_activation_fixture_prepare
  output="$CASE_ROOT/output"
  replace_fake_tag_id 'redis:7-alpine' "$CURRENT_BACKEND_ID"
  assert_activation_refusal "$output" activation_refused_state_changed
  unset FAKE_EXTERNAL_IMAGES
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-candidate-source"
  output="$CASE_ROOT/output"
  printf '%s\n' 'post-prepare candidate source drift' \
    >"$REMOTE_TEST_ROOT/app/.releases/$PREPARED_COMMIT/source/release-content.txt"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-compose-override"
  output="$CASE_ROOT/output"
  printf '%s\n' \
    '  portal-db:' \
    '    image: attacker-controlled:latest' \
    >>"$REMOTE_TEST_ROOT/app/.releases/$PREPARED_COMMIT/compose.release.yaml"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-tenants"
  output="$CASE_ROOT/output"
  printf '%s\t%s\n' \
    alpha https://alpha.example.test \
    zulu https://zulu.example.test >"$FAKE_TENANTS_FILE"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover
}

activate_accepts_newer_compatible_origin_main_orchestrator() {
  local output

  setup_activation_fixture "$FUNCNAME"
  advance_candidate_commit 'newer compatible activation orchestrator'
  output="$CASE_ROOT/output"
  assert_activation_success "$output"
  [[ "$(<"$REMOTE_TEST_ROOT/app/.release-state/current")" == "$PREPARED_COMMIT" ]] ||
    fail 'newer compatible orchestrator did not activate the prepared candidate'
}

activate_rejects_prepare_orchestrator_missing_from_origin_main() {
  local output candidate orchestrator

  setup_prepare_fixture "$FUNCNAME"
  candidate="$FIXTURE_COMMIT"
  advance_candidate_commit 'prepare-time orchestrator commit'
  orchestrator="$FIXTURE_COMMIT"
  DEPLOY_COMMIT_OVERRIDE="$candidate" deploy_command prepare >"$CASE_ROOT/prepare-output" 2>&1 ||
    fail 'special orchestrator fixture did not prepare'
  PREPARED_COMMIT="$candidate"
  grep -Fxq "orchestrator_commit=$orchestrator" "$(activation_manifest_path)" ||
    fail 'fixture did not record the newer prepare-time orchestrator'
  reset_activation_observation

  git -C "$FIXTURE_REPO" reset -q --hard "$candidate"
  git -C "$FIXTURE_REPO" push -q --force origin main
  FIXTURE_COMMIT="$candidate"
  output="$CASE_ROOT/output"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover
}

activate_rejects_incompatible_orchestrator_protocol() {
  local output

  setup_activation_fixture "$FUNCNAME"
  sed -i \
    "s/readonly STAGED_PROTOCOL_VERSION='1'/readonly STAGED_PROTOCOL_VERSION='2'/" \
    "$FIXTURE_REPO/scripts/deploy-production-staged.sh"
  git -C "$FIXTURE_REPO" add scripts/deploy-production-staged.sh
  git -C "$FIXTURE_REPO" commit -q -m 'incompatible activation orchestrator protocol'
  git -C "$FIXTURE_REPO" push -q origin main
  FIXTURE_COMMIT="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"
  output="$CASE_ROOT/output"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover
  grep -aq 'ssh' "$FAKE_COMMAND_LOG" ||
    fail 'protocol compatibility was not checked against prepared remote evidence'
}

first_activation_requires_matching_adoption_and_legacy_marker() {
  local output state

  setup_activation_fixture "$FUNCNAME-valid"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  assert_activation_success "$output"
  [[ "$(<"$state/current")" == "$PREPARED_COMMIT" ]] || fail 'first activation current pointer mismatch'
  [[ "$(<"$state/previous")" == "$CURRENT_COMMIT" ]] || fail 'first activation previous pointer mismatch'
  [[ ! -e "$state/adoption" ]] || fail 'first activation retained the adoption pointer'
  grep -Fxq 'record_kind=active_source' "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" ||
    fail 'first activation did not replace the legacy active marker'

  setup_activation_fixture "$FUNCNAME-adoption-mismatch"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  printf '%s\n' "$PREPARED_COMMIT" >"$state/adoption"
  chmod 0600 "$state/adoption"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover

  setup_activation_fixture "$FUNCNAME-marker-missing"
  output="$CASE_ROOT/output"
  rm -f -- "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover
}

activate_rejects_unresolved_transaction_before_compose() {
  local output transaction

  setup_activation_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  transaction="$REMOTE_TEST_ROOT/app/.release-state/transaction"
  printf '%s\n' \
    'protocol_version=1' \
    'record_kind=activation_transaction' \
    "candidate_commit=$PREPARED_COMMIT" \
    "previous_commit=$CURRENT_COMMIT" \
    'migration_policy=automatic' \
    'phase=cutover_started' \
    'started_at_utc=2026-07-16T12:00:00Z' \
    'updated_at_utc=2026-07-16T12:00:00Z' >"$transaction"
  chmod 0600 "$transaction"
  assert_activation_refusal "$output" activation_refused_state_changed
  assert_no_compose_cutover
  [[ -f "$transaction" ]] || fail 'refused activation removed unresolved transaction evidence'
}

activation_transport_or_cleanup_failure_preserves_conservative_status() {
  local output remote_dir state transport_exit

  setup_activation_fixture "$FUNCNAME-cleanup"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  export FAKE_COMPOSE_UP_FAIL=true
  export FAKE_SSH_FAIL_CLEANUP=true
  assert_activation_failure "$output"
  unset FAKE_COMPOSE_UP_FAIL FAKE_SSH_FAIL_CLEANUP
  assert_status_once "$output" activation_failed_publication
  grep -Fq 'Candidate Compose wait failed.' "$output" ||
    fail 'cleanup-failure fixture did not receive an explicit publication failure'
  grep -Fq 'remote delivery cleanup requires operator review' "$output" ||
    fail 'cleanup SSH failure did not warn the operator'
  [[ -f "$state/transaction" ]] || fail 'cleanup SSH failure lost activation transaction evidence'
  remote_dir="$(tail -n 1 "$FAKE_REMOTE_DIR_LOG")"
  [[ -n "$remote_dir" && -d "$remote_dir" ]] ||
    fail 'cleanup SSH failure fixture did not retain its remote delivery directory'

  setup_activation_fixture "$FUNCNAME-local-cleanup"
  output="$CASE_ROOT/output"
  rm() {
    local argument
    for argument in "$@"; do
      [[ "$argument" != /tmp/chatwoot-client-portal-v2-local.* ]] || return 91
    done
    command rm "$@"
  }
  export -f rm
  if ! deploy_command activate >"$output" 2>&1; then
    export -n -f rm
    unset -f rm
    sed 's/^/  output: /' "$output" >&2
    fail 'local cleanup failure changed a successful activation result'
  fi
  export -n -f rm
  unset -f rm
  assert_status_once "$output" activation_succeeded
  grep -Fq 'local delivery cleanup requires operator review' "$output" ||
    fail 'local cleanup failure did not warn the operator'

  for transport_exit in 255 130; do
    setup_activation_fixture "$FUNCNAME-final-$transport_exit"
    output="$CASE_ROOT/output"
    state="$REMOTE_TEST_ROOT/app/.release-state"
    export FAKE_SSH_FINAL_ACTIVATE_EXIT="$transport_exit"
    assert_activation_failure "$output"
    unset FAKE_SSH_FINAL_ACTIVATE_EXIT
    assert_status_once "$output" activation_failed_publication
    grep -Fq 'Remote helper returned an invalid status record.' "$output" ||
      fail "final activation SSH exit $transport_exit did not take the conservative transport-failure path"
    [[ ! -e "$state/transaction" ]] ||
      fail "final activation SSH exit $transport_exit unexpectedly created a transaction"
    assert_no_compose_cutover
    assert_remote_delivery_cleaned
    python3 - "$FAKE_COMMAND_LOG" "$transport_exit" <<'PY'
import pathlib
import sys

records = []
for raw in pathlib.Path(sys.argv[1]).read_bytes().split(b"\0\0"):
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if fields and fields[0] == "ssh":
        records.append(fields[-1])
inspect = [index for index, command in enumerate(records) if " inspect-prepared " in f" {command} "]
activate = [
    index
    for index, command in enumerate(records)
    if "/production-staged-release-remote.sh activate " in command
]
if len(inspect) != 1 or len(activate) != 1 or inspect[0] >= activate[0]:
    raise SystemExit(
        f"final SSH exit {sys.argv[2]} did not occur after one successful prepared inspection: {records}"
    )
PY
  done
}

candidate_expiry_at_transaction_boundary_is_refused() {
  local expires_epoch manifest output state

  setup_activation_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  manifest="$(activation_manifest_path)"
  expires_epoch="$(release_record_get_unique "$manifest" expires_at_epoch)" ||
    fail 'expiry-boundary fixture could not read candidate expiry'
  [[ "$expires_epoch" =~ ^[0-9]+$ ]] || fail 'expiry-boundary fixture has invalid expiry'

  export STAGED_TEST_CUTOVER_NOW_EPOCH="$expires_epoch"
  assert_activation_refusal "$output" activation_refused_expired
  unset STAGED_TEST_CUTOVER_NOW_EPOCH
  [[ ! -e "$state/transaction" ]] ||
    fail 'candidate expiry at the transaction boundary created a journal'
  assert_no_compose_cutover
}

activate_writes_cutover_journal_before_compose_up() {
  local output transaction

  setup_activation_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  transaction="$REMOTE_TEST_ROOT/app/.release-state/transaction"
  export FAKE_COMPOSE_UP_FAIL=true
  assert_activation_failure "$output"
  unset FAKE_COMPOSE_UP_FAIL

  [[ -f "$transaction" && ! -L "$transaction" ]] ||
    fail 'Compose failure did not preserve the activation transaction'
  grep -Fxq 'record_kind=activation_transaction' "$transaction" || fail 'transaction kind mismatch'
  grep -Fxq "candidate_commit=$PREPARED_COMMIT" "$transaction" || fail 'transaction candidate mismatch'
  grep -Fxq "previous_commit=$CURRENT_COMMIT" "$transaction" || fail 'transaction previous mismatch'
  grep -Fxq 'migration_policy=automatic' "$transaction" || fail 'transaction automatic policy missing'
  grep -Fxq 'phase=cutover_started' "$transaction" || fail 'transaction cutover phase mismatch'
  [[ "$(stat -c '%a' "$transaction")" == '600' ]] || fail 'transaction is not private'
  assert_events_in_order 'journal_write|cutover_started' 'compose_up|-d --no-build --pull never --wait --wait-timeout 120'
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/prepared" ]] ||
    fail 'post-journal failure removed the prepared pointer'
}

activate_uses_no_build_pull_never_wait_120_exactly() {
  local output

  setup_activation_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  assert_activation_success "$output"
  assert_exact_compose_cutover
}

activate_checks_built_service_running_health_and_restart_state() {
  local output state

  setup_activation_fixture "$FUNCNAME-not-running"
  output="$CASE_ROOT/output"
  export FAKE_SERVICE_NOT_RUNNING=portal-web
  assert_activation_failure "$output"
  unset FAKE_SERVICE_NOT_RUNNING
  state="$REMOTE_TEST_ROOT/app/.release-state"
  [[ -f "$state/transaction" ]] || fail 'not-running service failure lost its transaction'
  [[ ! -e "$state/current" ]] || fail 'not-running service was published current'

  setup_activation_fixture "$FUNCNAME-unhealthy"
  output="$CASE_ROOT/output"
  export FAKE_SERVICE_UNHEALTHY=portal-backend
  assert_activation_failure "$output"
  unset FAKE_SERVICE_UNHEALTHY
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/transaction" ]] ||
    fail 'unhealthy service failure lost its transaction'

  setup_activation_fixture "$FUNCNAME-duplicate"
  output="$CASE_ROOT/output"
  export FAKE_DUPLICATE_SERVICE_CONTAINER=telegram-bridge
  assert_activation_failure "$output"
  unset FAKE_DUPLICATE_SERVICE_CONTAINER
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/transaction" ]] ||
    fail 'duplicate service container failure lost its transaction'

  setup_activation_fixture "$FUNCNAME-restarted-at-capture"
  output="$CASE_ROOT/output"
  export FAKE_SERVICE_RESTARTED=portal-web
  assert_activation_failure "$output"
  unset FAKE_SERVICE_RESTARTED
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/transaction" ]] ||
    fail 'initial service restart evidence lost its transaction'

  setup_activation_fixture "$FUNCNAME-restart-after-smoke"
  output="$CASE_ROOT/output"
  export FAKE_RESTART_SERVICE_AFTER_CURL=portal-backend
  assert_activation_failure "$output"
  unset FAKE_RESTART_SERVICE_AFTER_CURL
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/transaction" ]] ||
    fail 'post-start restart failure lost its transaction'
  assert_no_event marker_rename current

  setup_activation_fixture "$FUNCNAME-ps-command-failure"
  output="$CASE_ROOT/output"
  export FAKE_COMPOSE_PS_FAIL_SERVICE=portal-web
  assert_activation_failure "$output"
  unset FAKE_COMPOSE_PS_FAIL_SERVICE
  assert_no_event marker_rename current

  setup_activation_fixture "$FUNCNAME-scaled-after-smoke"
  output="$CASE_ROOT/output"
  export FAKE_SCALE_SERVICE_AFTER_CURL=portal-backend
  assert_activation_failure "$output"
  unset FAKE_SCALE_SERVICE_AFTER_CURL
  assert_no_event marker_rename current

  setup_activation_fixture "$FUNCNAME-no-healthcheck"
  output="$CASE_ROOT/output"
  export FAKE_SERVICE_WITHOUT_HEALTHCHECK=portal-web
  assert_activation_success "$output"
  unset FAKE_SERVICE_WITHOUT_HEALTHCHECK
}

smoke_checks_health_and_exact_tenant_slug_for_every_active_tenant() {
  local output

  setup_prepare_fixture "$FUNCNAME"
  printf '%s\t%s\n' \
    zulu https://zulu.example.test \
    alpha https://alpha.example.test \
    bravo https://bravo.example.test/ >"$FAKE_TENANTS_FILE"
  complete_activation_fixture_prepare
  output="$CASE_ROOT/output"
  assert_activation_success "$output"

  python3 - "$FAKE_COMMAND_LOG" <<'PY'
import pathlib
import sys

urls = []
for raw in pathlib.Path(sys.argv[1]).read_bytes().split(b"\0\0"):
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if fields and fields[0] == "curl":
        urls.append(fields[-1])
expected = sorted(
    f"https://{slug}.example.test/api/{endpoint}"
    for slug in ("alpha", "bravo", "zulu")
    for endpoint in ("health", "tenant")
)
if sorted(urls) != expected:
    raise SystemExit(f"tenant smoke URL set mismatch: {urls}")
PY
  ! grep -q 'health-body-must-not-be-logged\|tenant-body-must-not-be-logged' "$output" ||
    fail 'activation printed a public response body'
  ! grep -R -q 'health-body-must-not-be-logged\|tenant-body-must-not-be-logged' \
    "$REMOTE_TEST_ROOT/app/.release-state" "$REMOTE_TEST_ROOT/app/.releases" ||
    fail 'activation persisted a public response body'

  setup_activation_fixture "$FUNCNAME-slug-mismatch"
  output="$CASE_ROOT/output"
  export FAKE_CURL_SLUG_MISMATCH_PATTERN='alpha.example.test/api/tenant'
  assert_activation_failure "$output"
  unset FAKE_CURL_SLUG_MISMATCH_PATTERN
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/transaction" ]] ||
    fail 'tenant slug mismatch lost the activation transaction'
  [[ ! -e "$REMOTE_TEST_ROOT/app/.release-state/current" ]] ||
    fail 'tenant slug mismatch published current'
  assert_no_event root_sync
  assert_no_event outcome_write activation_succeeded

  setup_activation_fixture "$FUNCNAME-max-body-bytes"
  output="$CASE_ROOT/output"
  export FAKE_CURL_HEALTH_BODY_BYTES=65536
  export FAKE_CURL_TENANT_BODY_BYTES=65536
  assert_activation_success "$output"
  unset FAKE_CURL_HEALTH_BODY_BYTES FAKE_CURL_TENANT_BODY_BYTES

  setup_activation_fixture "$FUNCNAME-health-body-over-bound"
  output="$CASE_ROOT/output"
  export FAKE_CURL_HEALTH_BODY_BYTES=65537
  assert_activation_failure "$output"
  unset FAKE_CURL_HEALTH_BODY_BYTES
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/transaction" ]] ||
    fail 'oversized health body lost the activation transaction'
  [[ ! -e "$REMOTE_TEST_ROOT/app/.release-state/current" ]] ||
    fail 'oversized health body published current'
  assert_no_event root_sync

  setup_activation_fixture "$FUNCNAME-tenant-body-over-bound"
  output="$CASE_ROOT/output"
  export FAKE_CURL_TENANT_BODY_BYTES=65537
  assert_activation_failure "$output"
  unset FAKE_CURL_TENANT_BODY_BYTES
  [[ -f "$REMOTE_TEST_ROOT/app/.release-state/transaction" ]] ||
    fail 'oversized tenant body lost the activation transaction'
  [[ ! -e "$REMOTE_TEST_ROOT/app/.release-state/current" ]] ||
    fail 'oversized tenant body published current'
  assert_no_event root_sync

  setup_activation_fixture "$FUNCNAME-invalid-origin-direct"
  (
    local result_dir
    result_dir="$(mktemp -d /tmp/chatwoot-client-portal-v2-smoke.XXXXXX)"
    trap 'rm -rf -- "$result_dir"' EXIT
    chmod 0700 "$result_dir"
    if STAGED_TEST_MODE=1 \
      STAGED_TEST_ROOT="$REMOTE_TEST_ROOT" \
      STAGED_CURL_BIN="$FAKE_BIN/curl" \
      STAGED_TEST_EVENT_RECORDER="$FAKE_BIN/record-event" \
      FAKE_BIN="$FAKE_BIN" \
      FAKE_COMMAND_LOG="$FAKE_COMMAND_LOG" \
      FAKE_EVENT_LOG="$FAKE_EVENT_LOG" \
      FAKE_EVENT_COUNTER="$FAKE_EVENT_COUNTER" \
      FAKE_CURL_STATE_DIR="$FAKE_CURL_STATE_DIR" \
      "$REMOTE_SCRIPT" __smoke-one alpha 'https://alpha.example.test/not-origin-only' "$result_dir"; then
      fail 'direct smoke worker accepted a non-origin URL'
    fi
    [[ -z "$(find "$result_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]] ||
      fail 'invalid direct smoke origin retained a response or result file'
  )
  assert_no_event curl_start
}

smoke_never_exceeds_five_workers_or_three_attempts() {
  local output index maximum

  setup_prepare_fixture "$FUNCNAME"
  : >"$FAKE_TENANTS_FILE"
  for index in $(seq -w 1 12); do
    printf 'tenant-%s\thttps://tenant-%s.example.test\n' "$index" "$index" >>"$FAKE_TENANTS_FILE"
  done
  complete_activation_fixture_prepare
  output="$CASE_ROOT/output"
  export FAKE_CURL_DELAY_SECONDS=0.05
  export FAKE_CURL_FAIL_PATTERN='tenant-03.example.test/api/health'
  export FAKE_CURL_FAILURES_BEFORE_SUCCESS=2
  assert_activation_success "$output"
  unset FAKE_CURL_DELAY_SECONDS FAKE_CURL_FAIL_PATTERN FAKE_CURL_FAILURES_BEFORE_SUCCESS

  maximum="$(<"$FAKE_CURL_STATE_DIR/max")"
  [[ "$maximum" =~ ^[0-9]+$ && "$maximum" -ge 2 && "$maximum" -le 5 ]] ||
    fail "fake curl concurrency was $maximum, expected 2..5"
  python3 - "$FAKE_EVENT_LOG" <<'PY'
import collections
import pathlib
import sys

attempts = collections.Counter()
for line in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    fields = line.split("\t", 3)
    if len(fields) == 4 and fields[2] == "curl_attempt":
        url, _, attempt = fields[3].rpartition("#")
        attempts[url] = max(attempts[url], int(attempt))
if not attempts or max(attempts.values()) > 3:
    raise SystemExit(f"curl attempt bound violated: {attempts}")
target = "https://tenant-03.example.test/api/health"
if attempts[target] != 3:
    raise SystemExit(f"retry fixture did not make exactly three attempts: {attempts[target]}")
PY
}

smoke_uses_connect_5_total_15_delay_3_and_timeout_600() {
  local output

  setup_activation_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  assert_activation_success "$output"
  python3 - "$FAKE_COMMAND_LOG" <<'PY'
import pathlib
import sys

records = []
for raw in pathlib.Path(sys.argv[1]).read_bytes().split(b"\0\0"):
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if fields:
        records.append(fields)
timeout = [record for record in records if record[0] == "timeout"]
xargs = [record for record in records if record[0] == "xargs"]
curl = [record for record in records if record[0] == "curl"]
if len(timeout) != 1 or timeout[0][1] != "600":
    raise SystemExit(f"timeout invocation mismatch: {timeout}")
if len(xargs) != 1 or xargs[0][1:6] != ["-0", "-n", "2", "-P", "5"]:
    raise SystemExit(f"xargs invocation mismatch: {xargs}")
expected_prefix = [
    "curl", "--fail", "--silent", "--show-error", "--connect-timeout", "5",
    "--max-time", "15", "--retry", "2", "--retry-delay", "3", "--retry-all-errors",
    "--max-filesize", "65536",
]
if len(curl) != 2 or any(record[:len(expected_prefix)] != expected_prefix for record in curl):
    raise SystemExit(f"curl invocation mismatch: {curl}")
PY
}

activation_does_not_publish_source_or_markers_before_all_smoke_passes() {
  local output marker_before source_before state

  setup_prepare_fixture "$FUNCNAME"
  printf '%s\t%s\n' \
    alpha https://alpha.example.test \
    zulu https://zulu.example.test >"$FAKE_TENANTS_FILE"
  complete_activation_fixture_prepare
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  marker_before="$(sha256sum "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" | awk '{print $1}')"
  source_before="$(sha256sum "$REMOTE_TEST_ROOT/app/release-content.txt" | awk '{print $1}')"
  export FAKE_CURL_FAIL_PATTERN='zulu.example.test/api/tenant'
  export FAKE_CURL_FAILURES_BEFORE_SUCCESS=3
  assert_activation_failure "$output"
  unset FAKE_CURL_FAIL_PATTERN FAKE_CURL_FAILURES_BEFORE_SUCCESS

  [[ "$(sha256sum "$REMOTE_TEST_ROOT/app/DEPLOY_SOURCE.txt" | awk '{print $1}')" == "$marker_before" ]] ||
    fail 'failed tenant smoke changed the active marker'
  [[ "$(sha256sum "$REMOTE_TEST_ROOT/app/release-content.txt" | awk '{print $1}')" == "$source_before" ]] ||
    fail 'failed tenant smoke changed the active root source'
  [[ ! -e "$state/current" && ! -e "$state/previous" ]] ||
    fail 'failed tenant smoke published staged pointers'
  [[ -f "$state/transaction" && -f "$state/prepared" ]] ||
    fail 'failed tenant smoke did not preserve prepared transaction evidence'
  assert_no_event root_sync
  assert_no_event marker_rename
  assert_no_event outcome_write activation_succeeded
}

successful_publication_advances_journal_and_writes_markers_last() {
  local output state

  setup_activation_fixture "$FUNCNAME"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  assert_activation_success "$output"
  assert_events_in_order \
    'journal_write|cutover_started' \
    'compose_up|-d --no-build --pull never --wait --wait-timeout 120' \
    'curl_success|https://alpha.example.test/api/health' \
    'curl_success|https://alpha.example.test/api/tenant' \
    'journal_write|candidate_healthy' \
    'journal_write|root_sync_started' \
    'root_sync' \
    'journal_write|root_sync_completed' \
    'marker_rename|DEPLOY_SOURCE.txt' \
    'marker_rename|previous' \
    'marker_rename|current' \
    'journal_write|markers_published'
  python3 - "$FAKE_EVENT_LOG" <<'PY'
import pathlib
import sys

markers = []
for line in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    fields = line.split("\t", 3)
    if len(fields) == 4 and fields[2] == "marker_rename":
        markers.append(fields[3])
if markers != ["DEPLOY_SOURCE.txt", "previous", "current"]:
    raise SystemExit(f"authority marker order mismatch: {markers}")
PY
  [[ "$(<"$state/current")" == "$PREPARED_COMMIT" ]] || fail 'published current pointer mismatch'
  [[ "$(<"$state/previous")" == "$CURRENT_COMMIT" ]] || fail 'published previous pointer mismatch'
}

successful_activation_records_outcome_then_clears_journal() {
  local output state history outcome index epoch utc other_sha oldest_path retained_path
  local original_commit first_candidate second_candidate cleanup_candidate cleanup_fail_ref tags
  local -a outcomes=()

  setup_activation_fixture "$FUNCNAME"
  original_commit="$CURRENT_COMMIT"
  first_candidate="$PREPARED_COMMIT"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  history="$state/history"
  for index in $(seq 1 20); do
    epoch="$((FAKE_NOW_EPOCH - 100 + index))"
    utc="$(date -u -d "@$epoch" +%Y-%m-%dT%H:%M:%SZ)"
    printf -v other_sha '%040x' "$index"
    printf '%s\n' \
      'protocol_version=1' \
      'record_kind=deployment_outcome' \
      "candidate_commit=$other_sha" \
      'previous_commit=none' \
      'status=activation_succeeded' \
      'failure_stage=none' \
      "recorded_at_utc=$utc" \
      "recorded_at_epoch=$epoch" \
      >"$history/$epoch-$other_sha-activation_succeeded.txt"
    chmod 0600 "$history/$epoch-$other_sha-activation_succeeded.txt"
    [[ "$index" != '1' ]] || oldest_path="$history/$epoch-$other_sha-activation_succeeded.txt"
    [[ "$index" != '2' ]] || retained_path="$history/$epoch-$other_sha-activation_succeeded.txt"
  done

  assert_activation_success "$output"
  mapfile -t outcomes < <(find "$history" -maxdepth 1 -type f -name "*-$PREPARED_COMMIT-activation_succeeded.txt")
  (( ${#outcomes[@]} == 1 )) || fail 'successful activation outcome count mismatch'
  outcome="${outcomes[0]}"
  [[ "$(stat -c '%a' "$outcome")" == '600' ]] || fail 'activation outcome is not private'
  grep -Fxq 'protocol_version=1' "$outcome" || fail 'outcome protocol mismatch'
  grep -Fxq 'record_kind=deployment_outcome' "$outcome" || fail 'outcome kind mismatch'
  grep -Fxq "candidate_commit=$PREPARED_COMMIT" "$outcome" || fail 'outcome candidate mismatch'
  grep -Fxq "previous_commit=$CURRENT_COMMIT" "$outcome" || fail 'outcome previous mismatch'
  grep -Fxq 'status=activation_succeeded' "$outcome" || fail 'outcome success status missing'
  grep -Fxq 'failure_stage=none' "$outcome" || fail 'successful outcome has a failure stage'
  [[ ! -e "$state/prepared" ]] || fail 'successful activation retained prepared pointer'
  [[ ! -e "$state/transaction" ]] || fail 'successful activation retained transaction journal'
  [[ "$(find "$history" -maxdepth 1 -type f | wc -l | tr -d ' ')" == '20' ]] ||
    fail 'activation history retention did not keep exactly 20 records'
  [[ ! -e "$oldest_path" ]] || fail 'activation history retained the oldest record'
  [[ -f "$retained_path" ]] || fail 'activation history removed a newer retained record'
  assert_events_in_order \
    'journal_write|markers_published' \
    'outcome_write|activation_succeeded' \
    "prepared_remove|$PREPARED_COMMIT" \
    'journal_remove|activation_succeeded'

  advance_candidate_commit 'second staged activation candidate'
  complete_activation_fixture_prepare
  second_candidate="$PREPARED_COMMIT"
  output="$CASE_ROOT/second-activation-output"
  assert_activation_success "$output"
  [[ "$(<"$state/current")" == "$second_candidate" ]] || fail 'second activation current pointer mismatch'
  [[ "$(<"$state/previous")" == "$first_candidate" ]] || fail 'second activation previous pointer mismatch'
  [[ ! -e "$REMOTE_TEST_ROOT/app/.releases/$original_commit" ]] ||
    fail 'second activation retained the superseded original release'
  tags="$FAKE_DOCKER_STATE_DIR/tags.tsv"
  ! grep -Fq ":$original_commit" "$tags" || fail 'second activation retained superseded full-SHA tags'
  [[ -d "$REMOTE_TEST_ROOT/app/.releases/$first_candidate" &&
    -d "$REMOTE_TEST_ROOT/app/.releases/$second_candidate" ]] ||
    fail 'second activation removed current or previous release evidence'

  advance_candidate_commit 'cleanup warning activation candidate'
  complete_activation_fixture_prepare
  cleanup_candidate="$PREPARED_COMMIT"
  cleanup_fail_ref="chatwoot-client-portal-v2-portal-backend:$first_candidate"
  output="$CASE_ROOT/cleanup-warning-output"
  export FAKE_IMAGE_RM_FAIL_REF="$cleanup_fail_ref"
  assert_activation_success "$output"
  unset FAKE_IMAGE_RM_FAIL_REF
  grep -Fq 'bounded cleanup requires operator review' "$output" ||
    fail 'post-success cleanup failure did not warn the operator'
  [[ "$(<"$state/current")" == "$cleanup_candidate" &&
    "$(<"$state/previous")" == "$second_candidate" ]] ||
    fail 'cleanup warning activation did not retain truthful current/previous pointers'
  [[ ! -e "$state/transaction" && ! -e "$state/prepared" ]] ||
    fail 'post-success cleanup failure retained a resolved activation transaction'
  [[ -d "$REMOTE_TEST_ROOT/app/.releases/$first_candidate" ]] ||
    fail 'failed superseded cleanup removed its retained evidence directory'
}

root_sync_preserves_runtime_owned_paths() {
  local output app path checksum index root_mode_before
  local -a protected_paths=() protected_checksums=()

  setup_prepare_fixture "$FUNCNAME"
  mkdir -p "$FIXTURE_REPO/docs"
  printf '%s\n' 'candidate env example' >"$FIXTURE_REPO/.env.example"
  printf '%s\n' 'candidate nested dot-env' >"$FIXTURE_REPO/docs/.env"
  git -C "$FIXTURE_REPO" add .env.example docs/.env
  git -C "$FIXTURE_REPO" commit -q -m 'candidate tracked sync fixtures'
  git -C "$FIXTURE_REPO" push -q origin main
  FIXTURE_COMMIT="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"
  complete_activation_fixture_prepare

  app="$REMOTE_TEST_ROOT/app"
  chmod 0751 "$app"
  root_mode_before="$(stat -c '%a' "$app")"
  mkdir -p "$app/.git" "$app/.codex" "$app/.install" "$app/logs" "$app/backups"
  printf '%s\n' runtime-env >"$app/.env"
  printf '%s\n' runtime-backup >"$app/.env.production.backup.keep"
  printf '%s\n' runtime-git >"$app/.git/keep"
  printf '%s\n' runtime-codex >"$app/.codex/keep"
  printf '%s\n' runtime-install >"$app/.install/keep"
  printf '%s\n' runtime-log >"$app/logs/keep"
  printf '%s\n' runtime-backup-dir >"$app/backups/keep"
  printf '%s\n' runtime-bootstrap-marker >"$app/BOOTSTRAP_SOURCE.txt"
  printf '%s\n' stale-root-file >"$app/stale-root-only.txt"
  protected_paths=(
    "$app/.env"
    "$app/.env.production"
    "$app/.env.production.backup.keep"
    "$app/.git/keep"
    "$app/.codex/keep"
    "$app/.install/keep"
    "$app/logs/keep"
    "$app/backups/keep"
    "$app/BOOTSTRAP_SOURCE.txt"
  )
  for path in "${protected_paths[@]}"; do
    protected_checksums+=("$(sha256sum "$path" | awk '{print $1}')")
  done

  output="$CASE_ROOT/output"
  assert_activation_success "$output"
  [[ "$(stat -c '%a' "$app")" == "$root_mode_before" ]] ||
    fail 'root sync changed the application root mode'
  for index in "${!protected_paths[@]}"; do
    path="${protected_paths[$index]}"
    checksum="$(sha256sum "$path" | awk '{print $1}')"
    [[ "$checksum" == "${protected_checksums[$index]}" ]] || fail "root sync changed runtime path: $path"
  done
  [[ ! -e "$app/stale-root-only.txt" ]] || fail 'root sync did not delete an obsolete tracked-root file'
  grep -Fxq 'candidate env example' "$app/.env.example" || fail 'tracked env example was not updated'
  grep -Fxq 'candidate nested dot-env' "$app/docs/.env" || fail 'root-only .env exclusion matched a nested file'
  grep -Fxq 'candidate-content' "$app/release-content.txt" || fail 'candidate root source was not published'
  python3 - "$FAKE_COMMAND_LOG" <<'PY'
import pathlib
import sys

records = []
for raw in pathlib.Path(sys.argv[1]).read_bytes().split(b"\0\0"):
    fields = [part.decode() for part in raw.split(b"\0") if part]
    if fields and fields[0] == "rsync":
        records.append(fields[1:])
if len(records) != 1:
    raise SystemExit(f"expected one root rsync: {records}")
args = records[0]
if args[:2] != ["-a", "--delete"]:
    raise SystemExit(f"root rsync flags mismatch: {args}")
exclusions = set()
index = 0
while index < len(args):
    if args[index] == "--exclude" and index + 1 < len(args):
        exclusions.add(args[index + 1])
        index += 2
    elif args[index].startswith("--exclude="):
        exclusions.add(args[index].split("=", 1)[1])
        index += 1
    else:
        index += 1
expected = {
    "/.env", "/.env.production", "/.env.production.backup.*", "/.git", "/.codex",
    "/.install", "/.release-state", "/.releases", "/logs", "/backups",
    "/BOOTSTRAP_SOURCE.txt", "/DEPLOY_SOURCE.txt",
}
if exclusions != expected:
    raise SystemExit(f"root rsync exclusions mismatch: {sorted(exclusions)}")
PY
}

root_sync_or_marker_failure_never_reports_success() {
  local output state history

  setup_activation_fixture "$FUNCNAME-rsync"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  history="$state/history"
  export FAKE_RSYNC_FAIL=true
  assert_activation_failure "$output"
  unset FAKE_RSYNC_FAIL
  assert_status_once "$output" activation_failed_publication
  [[ -f "$state/transaction" ]] || fail 'root sync failure lost transaction evidence'
  grep -Fxq 'phase=root_sync_started' "$state/transaction" || fail 'root sync failure journal phase mismatch'
  [[ ! -e "$state/current" ]] || fail 'root sync failure published current'
  ! find "$history" -maxdepth 1 -type f -name '*-activation_succeeded.txt' | grep -q . ||
    fail 'root sync failure wrote a success outcome'

  setup_activation_fixture "$FUNCNAME-rsync-after-copy"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  history="$state/history"
  export FAKE_RSYNC_FAIL_AFTER_COPY=true
  assert_activation_failure "$output"
  unset FAKE_RSYNC_FAIL_AFTER_COPY
  assert_status_once "$output" activation_failed_publication
  [[ -f "$state/transaction" ]] || fail 'partial root sync failure lost transaction evidence'
  grep -Fxq 'phase=root_sync_started' "$state/transaction" ||
    fail 'partial root sync failure journal phase mismatch'
  grep -Fxq 'candidate-content' "$REMOTE_TEST_ROOT/app/release-content.txt" ||
    fail 'partial root sync fixture did not copy candidate source before failing'
  [[ ! -e "$state/current" ]] || fail 'partial root sync failure published current'
  ! find "$history" -maxdepth 1 -type f -name '*-activation_succeeded.txt' | grep -q . ||
    fail 'partial root sync failure wrote a success outcome'
  assert_no_event marker_rename
  assert_no_event journal_remove activation_succeeded

  setup_activation_fixture "$FUNCNAME-marker"
  output="$CASE_ROOT/output"
  state="$REMOTE_TEST_ROOT/app/.release-state"
  history="$state/history"
  export STAGED_TEST_FAIL_PUBLICATION_AT=previous
  assert_activation_failure "$output"
  unset STAGED_TEST_FAIL_PUBLICATION_AT
  assert_status_once "$output" activation_failed_publication
  [[ -f "$state/transaction" ]] || fail 'marker failure lost transaction evidence'
  grep -Fxq 'phase=root_sync_completed' "$state/transaction" || fail 'marker failure journal phase mismatch'
  [[ ! -e "$state/current" ]] || fail 'marker failure published current authority'
  ! find "$history" -maxdepth 1 -type f -name '*-activation_succeeded.txt' | grep -q . ||
    fail 'marker failure wrote a success outcome'
  assert_no_event outcome_write activation_succeeded
  assert_no_event journal_remove activation_succeeded
}

cleanup_helpers_propagate_removal_failure() {
  STAGED_TEST_MODE=1 bash -Eeuo pipefail -s -- "$REMOTE_SCRIPT" <<'SH'
remote_script="$1"
root="$(mktemp -d /tmp/chatwoot-client-portal-v2-cleanup-test.XXXXXX)"
library_dir="$root/library"
mkdir -p "$library_dir"
cp -- "$(dirname -- "$remote_script")/production-release-records.sh" "$library_dir/"
python3 - "$remote_script" "$library_dir/production-staged-release-remote.sh" <<'PY'
import pathlib
import sys

source, destination = map(pathlib.Path, sys.argv[1:])
text = source.read_text(encoding="utf-8")
marker = "\ntrap 'remote_on_error"
boundary = text.rfind(marker)
if boundary < 0:
    raise SystemExit(1)
destination.write_text(text[:boundary] + "\n", encoding="utf-8")
PY
# shellcheck source=/dev/null
source "$library_dir/production-staged-release-remote.sh"

smoke_dir="$(mktemp -d /tmp/chatwoot-client-portal-v2-smoke.XXXXXX)"
env_dir="$(mktemp -d /tmp/chatwoot-client-portal-v2-env-check.XXXXXX)"
activation_file="$(mktemp /tmp/chatwoot-client-portal-v2-activate-matrix.XXXXXX)"
publication_file="$root/.release-activation.marker.test"
health_body="$smoke_dir/.health.alpha.test"
touch "$publication_file" "$health_body"
trap 'command rm -rf -- "$root" "$smoke_dir" "$env_dir" "$activation_file"' EXIT

REMOTE_PREPARE_ENV_TEMP="$env_dir"
REMOTE_SMOKE_HEALTH_BODY="$health_body"
REMOTE_PUBLICATION_MARKER_TEMP="$publication_file"
REMOTE_ACTIVATION_RAW_TENANTS="$activation_file"
REMOTE_SMOKE_RESULT_DIR="$smoke_dir"

rm() { return 91; }

if remote_cleanup_env_temp; then exit 1; fi
[[ "$REMOTE_PREPARE_ENV_TEMP" == "$env_dir" && -d "$env_dir" ]] || exit 1
if remote_cleanup_smoke_bodies; then exit 1; fi
[[ "$REMOTE_SMOKE_HEALTH_BODY" == "$health_body" && -f "$health_body" ]] || exit 1
if remote_cleanup_publication_temps; then exit 1; fi
[[ "$REMOTE_PUBLICATION_MARKER_TEMP" == "$publication_file" && -f "$publication_file" ]] || exit 1
if remote_cleanup_activation_temps; then exit 1; fi
[[ "$REMOTE_ACTIVATION_RAW_TENANTS" == "$activation_file" && -f "$activation_file" ]] || exit 1
[[ "$REMOTE_SMOKE_RESULT_DIR" == "$smoke_dir" && -d "$smoke_dir" ]] || exit 1
SH
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

run_activate_success_cases() {
  run_case activate_rejects_missing_expired_mismatched_or_incomplete_prepare
  run_case activate_rejects_active_env_image_or_tenant_matrix_drift
  run_case activate_accepts_newer_compatible_origin_main_orchestrator
  run_case activate_rejects_prepare_orchestrator_missing_from_origin_main
  run_case activate_rejects_incompatible_orchestrator_protocol
  run_case first_activation_requires_matching_adoption_and_legacy_marker
  run_case activate_rejects_unresolved_transaction_before_compose
  run_case activation_transport_or_cleanup_failure_preserves_conservative_status
  run_case candidate_expiry_at_transaction_boundary_is_refused
  run_case cleanup_helpers_propagate_removal_failure
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
}

case "$FILTER" in
  all)
    run_bootstrap_cases
    run_prepare_cases
    run_activate_success_cases
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
  activate-success)
    run_activate_success_cases
    ;;
  rollback)
    echo "No $FILTER cases registered yet."
    ;;
  *)
    fail "unknown staged deploy test filter: $FILTER"
    ;;
esac

echo 'production staged deploy checks passed'
