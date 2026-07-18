#!/usr/bin/env bash
set -Eeuo pipefail

readonly REMOTE_APP_NAME='chatwoot-client-portal-v2'
readonly REMOTE_APP_PATH='/opt/chatwoot-client-portal-v2'
readonly REMOTE_PROTOCOL_VERSION='1'

SELF_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)/$(basename -- "${BASH_SOURCE[0]}")"
RECORDS_LIB="$(dirname -- "$SELF_PATH")/production-release-records.sh"
[[ -r "$RECORDS_LIB" ]] || {
  echo "Release records helper is missing: $RECORDS_LIB" >&2
  exit 1
}
# shellcheck source=scripts/production-release-records.sh
source "$RECORDS_LIB"

REMOTE_STATUS_EMITTED='false'
REMOTE_FAILURE_STATUS='bootstrap_failed'
REMOTE_EFFECTIVE_APP_PATH=''
REMOTE_DOCKER=()
REMOTE_PYTHON_BIN=''
REMOTE_PREPARE_CANDIDATE_COMMIT=''
REMOTE_PREPARE_CANDIDATE_DIR=''
REMOTE_PREPARE_PUBLISHED='false'
REMOTE_PREPARE_CREATED_TAGS=()
REMOTE_PREPARE_ADOPTION_DIR=''
REMOTE_PREPARE_ADOPTION_VERIFIED='false'
REMOTE_PREPARE_ADOPTION_CREATED_TAGS=()
REMOTE_PREPARE_ENV_TEMP=''
REMOTE_EXIT_CLEANUP_RUNNING='false'
REMOTE_CURL_BIN=''
REMOTE_RSYNC_BIN=''
REMOTE_TIMEOUT_BIN=''
REMOTE_XARGS_BIN=''
REMOTE_EVENT_RECORDER=''
REMOTE_ACTIVATION_CONTAINER_IDS=()
REMOTE_ACTIVATION_CONTAINER_IMAGES=()
REMOTE_ACTIVATION_CONTAINER_RESTARTS=()
REMOTE_ACTIVATION_CONTAINER_STARTED=()
REMOTE_SMOKE_HEALTH_BODY=''
REMOTE_SMOKE_TENANT_BODY=''
REMOTE_PUBLICATION_MARKER_TEMP=''
REMOTE_PUBLICATION_PREVIOUS_TEMP=''
REMOTE_PUBLICATION_CURRENT_TEMP=''
REMOTE_ACTIVATION_RAW_TENANTS=''
REMOTE_ACTIVATION_RECOMPUTED_TENANTS=''
REMOTE_SMOKE_RESULT_DIR=''
REMOTE_ACTIVATION_CANDIDATE_COMMIT=''
REMOTE_ACTIVATION_PREVIOUS_COMMIT=''
REMOTE_ACTIVATION_CANDIDATE_ARCHIVE_SHA=''
REMOTE_ACTIVATION_PREVIOUS_ARCHIVE_SHA=''
REMOTE_ACTIVATION_ENV_SHA=''
REMOTE_ACTIVATION_MIGRATION=''
REMOTE_ACTIVATION_POLICY='automatic'
REMOTE_ACTIVATION_APPROVAL_REF=''
REMOTE_ACTIVATION_DECISION_PATH=''
REMOTE_ACTIVATION_OLD_PREVIOUS_COMMIT=''
REMOTE_ACTIVATION_FIRST_ADOPTION='false'
REMOTE_ACTIVATION_FAILURE_STAGE=''
REMOTE_ACTIVATION_TENANT_COUNT=''
REMOTE_ACTIVATION_TENANT_SHA=''
REMOTE_ACTIVATION_CANDIDATE_IDS=()
REMOTE_ACTIVATION_PREVIOUS_IDS=()
REMOTE_COMPOSE_WAIT_EXIT_CODE='unavailable'
REMOTE_COMPOSE_WAIT_PORTAL_BACKEND='unavailable'
REMOTE_COMPOSE_WAIT_PORTAL_WEB='unavailable'
REMOTE_COMPOSE_WAIT_TELEGRAM_BRIDGE='unavailable'
REMOTE_COMPOSE_WAIT_PRE_CUTOVER_CONTAINER_IDS=()
REMOTE_RESOLVED_CONTAINER_ID=''
REMOTE_SUPERSEDED_ARCHIVE_SHA=''
REMOTE_SUPERSEDED_BACKEND_ID=''
REMOTE_SUPERSEDED_WEB_ID=''
REMOTE_SUPERSEDED_TELEGRAM_ID=''
REMOTE_VISIBLE_SUCCESS_OUTCOME_PATH=''
REMOTE_VISIBLE_SUCCESS_OUTCOME_STARTED=''

remote_emit_status() {
  local status="$1"
  if [[ "$REMOTE_STATUS_EMITTED" == 'false' ]]; then
    printf 'status=%s\n' "$status"
    REMOTE_STATUS_EMITTED='true'
  fi
}

remote_fail() {
  local message="$1"
  local status="${2:-$REMOTE_FAILURE_STATUS}"
  local exit_code="${3:-1}"

  printf '%s\n' "$message" >&2
  remote_emit_status "$status"
  exit "$exit_code"
}

remote_on_error() {
  local exit_code="$1"
  local line="$2"
  if [[ "$REMOTE_FAILURE_STATUS" == 'prepare_failed' ]] && declare -F remote_prepare_cleanup_attempt >/dev/null; then
    remote_prepare_cleanup_attempt || true
  fi
  if [[ "$REMOTE_STATUS_EMITTED" == 'false' ]]; then
    printf 'Remote staged helper stopped unexpectedly at line %s.\n' "$line" >&2
    remote_emit_status "$REMOTE_FAILURE_STATUS"
  fi
  exit "$exit_code"
}

remote_cleanup_env_temp() {
  local path="$REMOTE_PREPARE_ENV_TEMP"

  [[ -n "$path" ]] || return 0
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    REMOTE_PREPARE_ENV_TEMP=''
    return 0
  fi
  [[ "$path" == /tmp/chatwoot-client-portal-v2-env-check.* && -d "$path" && ! -L "$path" ]] || return 1
  rm -rf -- "$path" || return 1
  [[ ! -e "$path" && ! -L "$path" ]] || return 1
  REMOTE_PREPARE_ENV_TEMP=''
}

remote_cleanup_smoke_bodies() {
  local variable path cleanup_status=0

  for variable in REMOTE_SMOKE_HEALTH_BODY REMOTE_SMOKE_TENANT_BODY; do
    path="${!variable}"
    [[ -n "$path" ]] || continue
    if [[ ! -e "$path" && ! -L "$path" ]]; then
      printf -v "$variable" '%s' ''
    elif [[ "$path" == /tmp/chatwoot-client-portal-v2-smoke.*/* && -f "$path" && ! -L "$path" ]]; then
      if rm -f -- "$path" && [[ ! -e "$path" && ! -L "$path" ]]; then
        printf -v "$variable" '%s' ''
      else
        cleanup_status=1
      fi
    else
      cleanup_status=1
    fi
  done
  return "$cleanup_status"
}

remote_cleanup_publication_temps() {
  local variable path cleanup_status=0

  for variable in REMOTE_PUBLICATION_MARKER_TEMP REMOTE_PUBLICATION_PREVIOUS_TEMP \
    REMOTE_PUBLICATION_CURRENT_TEMP; do
    path="${!variable}"
    [[ -n "$path" ]] || continue
    if [[ ! -e "$path" && ! -L "$path" ]]; then
      printf -v "$variable" '%s' ''
    elif [[ "$path" == */.release-activation.* && -f "$path" && ! -L "$path" ]]; then
      if rm -f -- "$path" && [[ ! -e "$path" && ! -L "$path" ]]; then
        printf -v "$variable" '%s' ''
      else
        cleanup_status=1
      fi
    else
      cleanup_status=1
    fi
  done
  return "$cleanup_status"
}

remote_cleanup_activation_temps() {
  local variable path cleanup_status=0

  for variable in REMOTE_ACTIVATION_RAW_TENANTS REMOTE_ACTIVATION_RECOMPUTED_TENANTS; do
    path="${!variable}"
    [[ -n "$path" ]] || continue
    if [[ ! -e "$path" && ! -L "$path" ]]; then
      printf -v "$variable" '%s' ''
    elif [[ "$path" == /tmp/chatwoot-client-portal-v2-activate-* && -f "$path" && ! -L "$path" ]]; then
      if rm -f -- "$path" && [[ ! -e "$path" && ! -L "$path" ]]; then
        printf -v "$variable" '%s' ''
      else
        cleanup_status=1
      fi
    else
      cleanup_status=1
    fi
  done
  path="$REMOTE_SMOKE_RESULT_DIR"
  if [[ -n "$path" ]]; then
    if [[ ! -e "$path" && ! -L "$path" ]]; then
      REMOTE_SMOKE_RESULT_DIR=''
    elif [[ "$path" == /tmp/chatwoot-client-portal-v2-smoke.* && -d "$path" && ! -L "$path" ]]; then
      if rm -rf -- "$path" && [[ ! -e "$path" && ! -L "$path" ]]; then
        REMOTE_SMOKE_RESULT_DIR=''
      else
        cleanup_status=1
      fi
    else
      cleanup_status=1
    fi
  fi
  return "$cleanup_status"
}

remote_exit_cleanup() {
  [[ "$REMOTE_EXIT_CLEANUP_RUNNING" == 'false' ]] || return 0
  REMOTE_EXIT_CLEANUP_RUNNING='true'
  remote_cleanup_env_temp || true
  remote_cleanup_smoke_bodies || true
  remote_cleanup_publication_temps || true
  remote_cleanup_activation_temps || true
  if [[ "$REMOTE_FAILURE_STATUS" == 'prepare_failed' && "$REMOTE_PREPARE_PUBLISHED" == 'false' ]] &&
    declare -F remote_prepare_cleanup_attempt >/dev/null; then
    remote_prepare_cleanup_attempt || true
  fi
}

remote_on_signal() {
  local exit_code="$1"

  trap - ERR HUP INT TERM
  remote_exit_cleanup
  if [[ "$REMOTE_STATUS_EMITTED" == 'false' ]]; then
    remote_emit_status "$REMOTE_FAILURE_STATUS"
  fi
  exit "$exit_code"
}

remote_is_test_mode() {
  [[ "${STAGED_TEST_MODE:-false}" == '1' ]]
}

remote_require_private_directory() {
  local path="$1"
  local mode

  [[ -d "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -c '%u' -- "$path")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' -- "$path")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 0077) == 0 ))
}

remote_find_paths() {
  local output_array_name="$1"
  shift
  local temporary
  local -n output_array="$output_array_name"

  temporary="$(mktemp /tmp/chatwoot-client-portal-v2-find.XXXXXX)" || return 1
  chmod 0600 "$temporary"
  if ! find "$@" -print0 >"$temporary"; then
    rm -f -- "$temporary"
    return 1
  fi
  output_array=()
  mapfile -d '' -t output_array <"$temporary"
  rm -f -- "$temporary"
}

remote_resolve_app_path() {
  local requested="$1"
  local test_root resolved

  [[ "$requested" == "$REMOTE_APP_PATH" ]] || return 1
  if ! remote_is_test_mode; then
    [[ -z "${STAGED_TEST_ROOT:-}" ]] || return 1
    printf '%s\n' "$requested"
    return
  fi

  test_root="${STAGED_TEST_ROOT:-}"
  [[ -n "$test_root" && -d "$test_root" && ! -L "$test_root" ]] || return 1
  resolved="$(realpath -e -- "$test_root")"
  [[ "$resolved" == /tmp/* && "$resolved" != '/tmp' ]] || return 1
  printf '%s/app\n' "$resolved"
}

remote_select_python() {
  local override="${STAGED_PYTHON_BIN:-}"

  if remote_is_test_mode && [[ -n "$override" ]]; then
    [[ "$override" == /* && -x "$override" && -f "$override" && ! -L "$override" ]] || return 1
    printf '%s\n' "$override"
    return
  fi
  [[ -z "$override" ]] || return 1
  command -v python3
}

remote_select_docker() {
  local override="${STAGED_DOCKER_BIN:-}"
  local docker_bin

  if remote_is_test_mode; then
    [[ -n "$override" && "$override" == /* && -x "$override" && -f "$override" && ! -L "$override" ]] || return 1
    REMOTE_DOCKER=("$override")
  else
    [[ -z "$override" ]] || return 1
    docker_bin="$(command -v docker)"
    REMOTE_DOCKER=("$docker_bin")
  fi

  if "${REMOTE_DOCKER[@]}" info >/dev/null 2>&1; then
    return 0
  fi

  remote_is_test_mode && return 1
  command -v sudo >/dev/null || return 1
  sudo -n docker info >/dev/null 2>&1 || return 1
  REMOTE_DOCKER=(sudo -n docker)
}

remote_select_command() {
  local override_name="$1"
  local default_name="$2"
  local override="${!override_name:-}"
  local resolved

  if remote_is_test_mode; then
    [[ -n "$override" && "$override" == /tmp/* && -f "$override" && ! -L "$override" && -x "$override" ]] ||
      return 1
    printf '%s\n' "$override"
    return
  fi
  [[ -z "$override" ]] || return 1
  resolved="$(command -v "$default_name")" || return 1
  [[ -n "$resolved" && -x "$resolved" ]] || return 1
  printf '%s\n' "$resolved"
}

remote_select_activation_tools() {
  REMOTE_CURL_BIN="$(remote_select_command STAGED_CURL_BIN curl)" || return 1
  REMOTE_RSYNC_BIN="$(remote_select_command STAGED_RSYNC_BIN rsync)" || return 1
  REMOTE_TIMEOUT_BIN="$(remote_select_command STAGED_TIMEOUT_BIN timeout)" || return 1
  REMOTE_XARGS_BIN="$(remote_select_command STAGED_XARGS_BIN xargs)" || return 1

  if remote_is_test_mode; then
    REMOTE_EVENT_RECORDER="${STAGED_TEST_EVENT_RECORDER:-}"
    [[ -n "$REMOTE_EVENT_RECORDER" && "$REMOTE_EVENT_RECORDER" == /tmp/* &&
      -f "$REMOTE_EVENT_RECORDER" && ! -L "$REMOTE_EVENT_RECORDER" && -x "$REMOTE_EVENT_RECORDER" ]] || return 1
  else
    [[ -z "${STAGED_TEST_EVENT_RECORDER:-}" && -z "${STAGED_TEST_EVENT_LOG:-}" &&
      -z "${STAGED_TEST_FAIL_PUBLICATION_AT:-}" && -z "${STAGED_TEST_CUTOVER_NOW_EPOCH:-}" &&
      -z "${STAGED_TEST_FAIL_DECISION_FSYNC:-}" &&
      -z "${STAGED_TEST_FAIL_SUCCESS_OUTCOME_AT:-}" &&
      -z "${STAGED_TEST_TAMPER_ROLLBACK_MARKER_ARCHIVE:-}" ]] || return 1
    REMOTE_EVENT_RECORDER=''
  fi
}

remote_record_test_event() {
  local event="$1"
  local detail="${2:-}"

  [[ "$event" =~ ^[a-z0-9_.:-]+$ && "$detail" != *$'\n'* && "$detail" != *$'\t'* ]] || return 1
  [[ -n "$REMOTE_EVENT_RECORDER" ]] || return 0
  "$REMOTE_EVENT_RECORDER" "$event" "$detail"
}

remote_fsync_path_and_parent() {
  local path="$1"
  local parent

  [[ -e "$path" && ! -L "$path" ]] || return 1
  parent="$(dirname -- "$path")"
  "$REMOTE_PYTHON_BIN" - "$path" "$parent" <<'PY'
import os
import sys

path, parent = sys.argv[1:]
flags = os.O_RDONLY
if os.path.isdir(path):
    flags |= getattr(os, "O_DIRECTORY", 0)
fd = os.open(path, flags)
try:
    os.fsync(fd)
finally:
    os.close(fd)
parent_fd = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
try:
    os.fsync(parent_fd)
finally:
    os.close(parent_fd)
PY
}

remote_validate_archive() {
  local archive_path="$1"

  [[ -f "$archive_path" && ! -L "$archive_path" ]] || return 1
  "$REMOTE_PYTHON_BIN" - "$archive_path" <<'PY'
import pathlib
import sys
import tarfile

archive_path = sys.argv[1]
try:
    with tarfile.open(archive_path, "r:gz") as archive:
        members = archive.getmembers()
        if not members:
            raise ValueError("empty archive")
        for member in members:
            path = pathlib.PurePosixPath(member.name)
            if not member.name or path.is_absolute() or ".." in path.parts:
                raise ValueError("unsafe archive path")
            if not (member.isfile() or member.isdir()):
                raise ValueError("unsupported archive member")
except (OSError, tarfile.TarError, ValueError):
    raise SystemExit(1)
PY
}

remote_container_ids() {
  "${REMOTE_DOCKER[@]}" ps -aq \
    --filter "label=com.docker.compose.project=$REMOTE_APP_NAME"
}

remote_lock_file_is_safe() {
  local path="$1"
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    (
      umask 077
      set -o noclobber
      : >"$path"
    ) || return 1
    chmod 0600 "$path"
  fi
  release_record_require_private_file "$path"
}

remote_bootstrap_preflight() {
  local app_path="$1"
  local containers
  local -a entries=()

  if [[ -L "$app_path" ]]; then
    return 1
  fi
  if [[ -e "$app_path" && ! -d "$app_path" ]]; then
    return 1
  fi
  if [[ -d "$app_path" ]]; then
    remote_find_paths entries "$app_path" -mindepth 1 -maxdepth 1 || return 1
    (( ${#entries[@]} == 0 )) || return 1
  fi
  containers="$(remote_container_ids)" || return 1
  [[ -z "$containers" ]]
}

remote_create_app_root() {
  local app_path="$1"
  local parent user group

  if [[ -d "$app_path" ]]; then
    [[ -w "$app_path" ]] || return 1
    printf 'existing\n'
    return
  fi

  parent="$(dirname -- "$app_path")"
  if [[ -d "$parent" && -w "$parent" ]] && mkdir -- "$app_path"; then
    chmod 0755 "$app_path"
    printf 'created\n'
    return
  fi

  remote_is_test_mode && return 1
  command -v sudo >/dev/null || return 1
  user="$(id -un)"
  group="$(id -gn)"
  sudo -n install -d -m 0755 -o "$user" -g "$group" -- "$app_path" || return 1
  printf 'created\n'
}

remote_remove_created_root() {
  local app_path="$1"
  local containers

  if [[ "$app_path" == "$REMOTE_APP_PATH" ]]; then
    :
  elif remote_is_test_mode && [[ "$app_path" == /tmp/*/app ]]; then
    :
  else
    return 1
  fi
  [[ -d "$app_path" && ! -L "$app_path" ]] || return 1
  containers="$(remote_container_ids)" || return 1
  [[ -z "$containers" ]] || return 1
  rm -rf -- "$app_path"
}

remote_bootstrap_apply() {
  local app_path="$1"
  local archive_path="$2"
  local archive_sha="$3"
  local commit="$4"
  local approval_ref="$5"
  local actual_sha extract_dir root_state

  [[ -f "$archive_path" && ! -L "$archive_path" ]] || return 1
  actual_sha="$(sha256sum "$archive_path" | awk '{print $1}')" || return 1
  [[ "$actual_sha" == "$archive_sha" ]] || return 1
  remote_validate_archive "$archive_path" || return 1

  extract_dir="$(mktemp -d /tmp/chatwoot-client-portal-v2-extract.XXXXXX)" || return 1
  chmod 0700 "$extract_dir"
  if ! tar -xzf "$archive_path" -C "$extract_dir"; then
    rm -rf -- "$extract_dir"
    return 1
  fi
  if [[ ! -f "$extract_dir/package.json" ||
    ! -f "$extract_dir/scripts/install-production.sh" ||
    ! -f "$extract_dir/infra/production/compose.yaml" ]]; then
    rm -rf -- "$extract_dir"
    return 1
  fi

  root_state="$(remote_create_app_root "$app_path")" || {
    rm -rf -- "$extract_dir"
    return 1
  }

  if ! rsync -a -- "$extract_dir/" "$app_path/"; then
    rm -rf -- "$extract_dir"
    [[ "$root_state" == 'created' ]] && remote_remove_created_root "$app_path" || true
    return 1
  fi
  rm -rf -- "$extract_dir"

  if remote_is_test_mode && [[ "${STAGED_TEST_FAIL_AFTER_ROOT_COPY:-false}" == 'true' ]]; then
    [[ "$root_state" == 'created' ]] && remote_remove_created_root "$app_path" || true
    return 97
  fi

  if ! release_marker_write_bootstrap \
    "$app_path/BOOTSTRAP_SOURCE.txt" \
    "$commit" \
    "$archive_sha" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$approval_ref"; then
    [[ "$root_state" == 'created' ]] && remote_remove_created_root "$app_path" || true
    return 1
  fi

  printf 'Bootstrap source prepared: %s\n' "$commit"
  printf 'Archive SHA-256: %s\n' "$archive_sha"
  printf 'Production was not configured, started, or activated.\n'
}

remote_locked_bootstrap() {
  local app_path="$1"
  local archive_path="$2"
  local archive_sha="$3"
  local commit="$4"
  local approval_ref="$5"

  if ! remote_select_docker; then
    remote_fail 'Docker access is unavailable.' bootstrap_failed
  fi
  REMOTE_PYTHON_BIN="$(remote_select_python)" || remote_fail 'Python 3 is unavailable.' bootstrap_failed
  for required in tar rsync sha256sum find stat; do
    command -v "$required" >/dev/null || remote_fail "Required command is missing: $required" bootstrap_failed
  done

  if ! remote_bootstrap_preflight "$app_path"; then
    remote_fail 'Bootstrap requires an absent or empty inactive application root.' bootstrap_refused_nonempty
  fi

  if ! remote_bootstrap_apply "$app_path" "$archive_path" "$archive_sha" "$commit" "$approval_ref"; then
    remote_fail 'Bootstrap source copy failed; partial evidence was handled according to root ownership.' bootstrap_failed
  fi

  remote_emit_status bootstrap_completed
}

remote_run_bootstrap_with_lock() {
  local app_path="$1"
  shift
  local lock_path="$HOME/.chatwoot-client-portal-v2-bootstrap.lock"
  local lock_exit

  [[ -d "$HOME" && ! -L "$HOME" ]] || remote_fail 'HOME must be a non-symlink directory.' bootstrap_failed
  [[ "$(stat -c '%u' -- "$HOME")" == "$(id -u)" ]] || remote_fail 'HOME must be owned by the deploy user.' bootstrap_failed
  remote_lock_file_is_safe "$lock_path" || remote_fail 'Bootstrap lock file is unsafe.' bootstrap_failed

  set +e
  flock --nonblock --close --conflict-exit-code 75 "$lock_path" \
    "$SELF_PATH" __locked-bootstrap \
    "--app-path=$REMOTE_APP_PATH" \
    "$@"
  lock_exit=$?
  set -e

  if (( lock_exit == 75 )); then
    remote_fail 'Another staged bootstrap is already running or bootstrap failed.' bootstrap_failed
  fi
  return "$lock_exit"
}

remote_pointer_read() {
  local path="$1"
  local -a lines=()

  release_record_require_private_file "$path" || return 1
  [[ "$(stat -c '%s' -- "$path")" == '41' ]] || return 1
  mapfile -t lines <"$path"
  (( ${#lines[@]} == 1 )) || return 1
  release_record_is_sha "${lines[0]}" || return 1
  printf '%s\n' "${lines[0]}"
}

remote_pointer_write() {
  local mode="$1"
  local path="$2"
  local commit="$3"
  local parent temporary

  [[ "$mode" == 'create' || "$mode" == 'replace' ]] || return 2
  release_record_is_sha "$commit" || return 2
  parent="$(dirname -- "$path")"
  [[ -d "$parent" && ! -L "$parent" ]] || return 1
  [[ "$(stat -c '%u' -- "$parent")" == "$(id -u)" ]] || return 1
  [[ ! -L "$path" ]] || return 1

  umask 077
  temporary="$(mktemp "$parent/.release-pointer.XXXXXX")" || return 1
  printf '%s\n' "$commit" >"$temporary"
  chmod 0600 "$temporary"
  if [[ "$mode" == 'create' ]]; then
    if ! ln -- "$temporary" "$path"; then
      rm -f -- "$temporary"
      return 1
    fi
    rm -f -- "$temporary"
  else
    mv -T -- "$temporary" "$path" || {
      rm -f -- "$temporary"
      return 1
    }
  fi
  [[ "$(remote_pointer_read "$path")" == "$commit" ]]
}

remote_release_tag() {
  local service="$1"
  local commit="$2"

  case "$service" in
    portal-backend) printf '%s-portal-backend:%s\n' "$REMOTE_APP_NAME" "$commit" ;;
    portal-web) printf '%s-portal-web:%s\n' "$REMOTE_APP_NAME" "$commit" ;;
    telegram-bridge) printf '%s-telegram-bridge:%s\n' "$REMOTE_APP_NAME" "$commit" ;;
    *) return 1 ;;
  esac
}

remote_image_id() {
  local reference="$1"
  local image_id

  image_id="$("${REMOTE_DOCKER[@]}" image inspect --format '{{.Id}}' "$reference" 2>/dev/null)" || return 1
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  printf '%s\n' "$image_id"
}

remote_tag_exact_image() {
  local image_id="$1"
  local reference="$2"
  local track_created="${3:-false}"
  local existing

  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$reference" != -* && ${#reference} -le 255 && "$reference" != *[[:space:]]* ]] || return 1
  [[ "$(remote_image_id "$image_id")" == "$image_id" ]] || return 1
  if existing="$(remote_image_id "$reference" 2>/dev/null)"; then
    [[ "$existing" == "$image_id" ]] || return 1
    return 0
  fi
  "${REMOTE_DOCKER[@]}" tag "$image_id" "$reference" >/dev/null || return 1
  [[ "$(remote_image_id "$reference")" == "$image_id" ]] || return 1
  if [[ "$track_created" == 'candidate' ]]; then
    REMOTE_PREPARE_CREATED_TAGS+=("$reference=$image_id")
  elif [[ "$track_created" == 'adoption' ]]; then
    REMOTE_PREPARE_ADOPTION_CREATED_TAGS+=("$reference=$image_id")
  fi
}

remote_remove_exact_tag() {
  local reference="$1"
  local expected_id="$2"
  local actual

  [[ "$expected_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  actual="$(remote_image_id "$reference")" || return 1
  [[ "$actual" == "$expected_id" ]] || return 1
  "${REMOTE_DOCKER[@]}" image rm "$expected_id" >/dev/null
  ! remote_image_id "$reference" >/dev/null 2>&1
}

remote_write_release_override() {
  local release_dir="$1"
  local commit="$2"
  local path="$release_dir/compose.release.yaml"

  release_record_is_sha "$commit" || return 1
  [[ -d "$release_dir" && ! -L "$release_dir" && ! -e "$path" && ! -L "$path" ]] || return 1
  umask 077
  {
    printf 'services:\n'
    printf '  portal-backend:\n    image: %s\n' "$(remote_release_tag portal-backend "$commit")"
    printf '  portal-web:\n    image: %s\n' "$(remote_release_tag portal-web "$commit")"
    printf '  telegram-bridge:\n    image: %s\n' "$(remote_release_tag telegram-bridge "$commit")"
  } >"$path"
  chmod 0600 "$path"
}

remote_validate_release_override() {
  local release_dir="$1"
  local commit="$2"
  local path="$release_dir/compose.release.yaml"

  release_record_is_sha "$commit" || return 1
  release_record_require_private_file "$path" || return 1
  "$REMOTE_PYTHON_BIN" - "$path" "$REMOTE_APP_NAME" "$commit" <<'PY'
import pathlib
import sys

path, app, commit = sys.argv[1:]
expected = (
    "services:\n"
    "  portal-backend:\n"
    f"    image: {app}-portal-backend:{commit}\n"
    "  portal-web:\n"
    f"    image: {app}-portal-web:{commit}\n"
    "  telegram-bridge:\n"
    f"    image: {app}-telegram-bridge:{commit}\n"
).encode()
if pathlib.Path(path).read_bytes() != expected:
    raise SystemExit(1)
PY
}

remote_validate_compose_images() {
  local manifest="$1"
  local images_output="$2"

  "$REMOTE_PYTHON_BIN" - "$manifest" "$images_output" <<'PY'
import pathlib
import sys

manifest_path, output = sys.argv[1:]
fields = {}
for line in pathlib.Path(manifest_path).read_text(encoding="utf-8").splitlines():
    key, value = line.split("=", 1)
    fields[key] = value
try:
    external_count = int(fields["external_image_count"])
except (KeyError, ValueError):
    raise SystemExit(1)
expected = {
    fields.get("backend_image_tag", ""),
    fields.get("web_image_tag", ""),
    fields.get("telegram_image_tag", ""),
}
for index in range(1, external_count + 1):
    expected.add(fields.get(f"external_image_{index:03d}_ref", ""))
actual_lines = output.splitlines()
if not actual_lines or any(not value or value.startswith("-") or any(char.isspace() for char in value) for value in actual_lines):
    raise SystemExit(1)
if "" in expected or set(actual_lines) != expected:
    raise SystemExit(1)
PY
}

REMOTE_COMPOSE=()
remote_configure_compose() {
  local app_path="$1"
  local release_dir="$2"

  [[ -f "$app_path/.env.production" && ! -L "$app_path/.env.production" ]] || return 1
  [[ -f "$release_dir/source/infra/production/compose.yaml" &&
    -f "$release_dir/compose.release.yaml" ]] || return 1
  REMOTE_COMPOSE=(
    "${REMOTE_DOCKER[@]}" compose
    --project-name "$REMOTE_APP_NAME"
    --env-file "$app_path/.env.production"
    -f "$release_dir/source/infra/production/compose.yaml"
    -f "$release_dir/compose.release.yaml"
  )
}

remote_extract_release_archive() {
  local archive_path="$1"
  local expected_checksum="$2"
  local release_dir="$3"
  local actual_checksum

  [[ ! -e "$release_dir" && ! -L "$release_dir" ]] || return 1
  actual_checksum="$(sha256sum "$archive_path" | awk '{print $1}')" || return 1
  [[ "$actual_checksum" == "$expected_checksum" ]] || return 1
  remote_validate_archive "$archive_path" || return 1
  umask 077
  mkdir -m 0700 -- "$release_dir" "$release_dir/source" || return 1
  cp -- "$archive_path" "$release_dir/source.tar.gz" || return 1
  chmod 0600 "$release_dir/source.tar.gz"
  tar -xzf "$release_dir/source.tar.gz" -C "$release_dir/source" || return 1
  [[ -f "$release_dir/source/package.json" &&
    -f "$release_dir/source/infra/production/compose.yaml" &&
    -f "$release_dir/source/scripts/ensure-production-object-storage-env.sh" ]] || return 1
}

remote_validate_imported_manifest() {
  local path="$1"
  local expected_commit="$2"
  local protocol kind commit checksum timestamp service tag image_id

  release_record_validate_keys "$path" \
    protocol_version record_kind release_commit archive_sha256 imported_at_utc \
    backend_image_tag backend_image_id web_image_tag web_image_id \
    telegram_image_tag telegram_image_id || return 1
  protocol="$(release_record_get_unique "$path" protocol_version)"
  kind="$(release_record_get_unique "$path" record_kind)"
  commit="$(release_record_get_unique "$path" release_commit)"
  checksum="$(release_record_get_unique "$path" archive_sha256)"
  timestamp="$(release_record_get_unique "$path" imported_at_utc)"
  [[ "$protocol" == "$REMOTE_PROTOCOL_VERSION" && "$kind" == 'imported_release' &&
    "$commit" == "$expected_commit" ]] || return 1
  release_record_is_checksum "$checksum" || return 1
  release_record_is_timestamp "$timestamp" || return 1
  for service in backend web telegram; do
    tag="$(release_record_get_unique "$path" "${service}_image_tag")"
    image_id="$(release_record_get_unique "$path" "${service}_image_id")"
    case "$service" in
      backend) [[ "$tag" == "$(remote_release_tag portal-backend "$commit")" ]] || return 1 ;;
      web) [[ "$tag" == "$(remote_release_tag portal-web "$commit")" ]] || return 1 ;;
      telegram) [[ "$tag" == "$(remote_release_tag telegram-bridge "$commit")" ]] || return 1 ;;
    esac
    [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  done
}

remote_write_imported_manifest() {
  local path="$1"
  local commit="$2"
  local archive_checksum="$3"
  local timestamp="$4"
  local backend_id="$5"
  local web_id="$6"
  local telegram_id="$7"

  printf '%s\n' \
    "protocol_version=$REMOTE_PROTOCOL_VERSION" \
    'record_kind=imported_release' \
    "release_commit=$commit" \
    "archive_sha256=$archive_checksum" \
    "imported_at_utc=$timestamp" \
    "backend_image_tag=$(remote_release_tag portal-backend "$commit")" \
    "backend_image_id=$backend_id" \
    "web_image_tag=$(remote_release_tag portal-web "$commit")" \
    "web_image_id=$web_id" \
    "telegram_image_tag=$(remote_release_tag telegram-bridge "$commit")" \
    "telegram_image_id=$telegram_id" |
    release_record_write_atomic create "$path" || return 1
  remote_validate_imported_manifest "$path" "$commit"
}

REMOTE_INSPECT_CURRENT=''
REMOTE_INSPECT_STAGED='false'
REMOTE_INSPECT_ARCHIVE_SHA=''
remote_inspect_current() {
  local app_path="$1"
  local state_dir="$app_path/.release-state"
  local releases_dir="$app_path/.releases"
  local marker_commit pointer manifest_commit
  local -a links=()

  [[ -d "$app_path" && ! -L "$app_path" ]] || return 1
  REMOTE_INSPECT_ARCHIVE_SHA=''
  [[ -f "$app_path/DEPLOY_SOURCE.txt" && ! -L "$app_path/DEPLOY_SOURCE.txt" ]] || return 1
  if [[ -e "$state_dir" || -L "$state_dir" ]]; then
    [[ -d "$state_dir" && ! -L "$state_dir" ]] || return 1
    remote_find_paths links "$state_dir" -type l || return 1
    (( ${#links[@]} == 0 )) || return 1
  fi
  if [[ -e "$releases_dir" || -L "$releases_dir" ]]; then
    [[ -d "$releases_dir" && ! -L "$releases_dir" ]] || return 1
    remote_find_paths links "$releases_dir" -type l || return 1
    (( ${#links[@]} == 0 )) || return 1
  fi

  if [[ -f "$state_dir/current" || -L "$state_dir/current" ]]; then
    pointer="$(remote_pointer_read "$state_dir/current")" || return 1
    [[ ! -e "$state_dir/adoption" && ! -L "$state_dir/adoption" ]] || return 1
    marker_commit="$(release_marker_read_active_commit "$app_path/DEPLOY_SOURCE.txt" false)" || return 1
    [[ "$marker_commit" == "$pointer" ]] || return 1
    REMOTE_INSPECT_ARCHIVE_SHA="$(release_record_get_unique "$app_path/DEPLOY_SOURCE.txt" archive_sha256)" || return 1
    release_record_is_checksum "$REMOTE_INSPECT_ARCHIVE_SHA" || return 1
    REMOTE_INSPECT_CURRENT="$pointer"
    REMOTE_INSPECT_STAGED='true'
    return 0
  fi

  marker_commit="$(release_marker_read_active_commit "$app_path/DEPLOY_SOURCE.txt" true)" || return 1
  if [[ -e "$state_dir/adoption" || -L "$state_dir/adoption" ]]; then
    pointer="$(remote_pointer_read "$state_dir/adoption")" || return 1
    [[ "$pointer" == "$marker_commit" ]] || return 1
    remote_validate_imported_manifest "$releases_dir/$pointer/manifest.txt" "$pointer" || return 1
    manifest_commit="$(release_record_get_unique "$releases_dir/$pointer/manifest.txt" release_commit)"
    [[ "$manifest_commit" == "$pointer" ]] || return 1
  fi
  REMOTE_INSPECT_CURRENT="$marker_commit"
  REMOTE_INSPECT_STAGED='false'
}

remote_run_inspect() {
  local app_path="$1"

  remote_block_on_critical_state "$app_path" prepare || return 1
  remote_inspect_current "$app_path" || return 1
  printf '%s\n' \
    "protocol_version=$REMOTE_PROTOCOL_VERSION" \
    'record_kind=current_inspection' \
    "current_commit=$REMOTE_INSPECT_CURRENT" \
    "staged_current=$REMOTE_INSPECT_STAGED"
}

remote_run_prepared_inspect() {
  local app_path="$1"
  local candidate_commit="$2"
  local state_dir="$app_path/.release-state"
  local release_dir="$app_path/.releases/$candidate_commit"
  local manifest="$release_dir/manifest.txt"
  local prepared orchestrator protocol migration

  REMOTE_PYTHON_BIN="$(remote_select_python)" || return 1
  remote_block_on_critical_state "$app_path" activate || return 1
  remote_validate_state_layout "$app_path" || return 1
  prepared="$(remote_pointer_read "$state_dir/prepared")" || return 1
  [[ "$prepared" == "$candidate_commit" ]] || return 1
  remote_validate_prepared_manifest "$manifest" "$candidate_commit" || return 1
  orchestrator="$(release_record_get_unique "$manifest" orchestrator_commit)" || return 1
  protocol="$(release_record_get_unique "$manifest" orchestrator_protocol_version)" || return 1
  migration="$(release_record_get_unique "$manifest" migration_classification)" || return 1
  release_record_is_sha "$orchestrator" || return 1
  [[ "$protocol" == "$REMOTE_PROTOCOL_VERSION" ]] || return 1
  [[ "$migration" == 'none' || "$migration" == 'migration' ]] || return 1

  printf '%s\n' \
    "protocol_version=$REMOTE_PROTOCOL_VERSION" \
    'record_kind=prepared_inspection' \
    "candidate_commit=$candidate_commit" \
    "orchestrator_commit=$orchestrator" \
    "orchestrator_protocol_version=$protocol" \
    "migration_classification=$migration"
}

remote_validate_prepared_manifest() {
  local path="$1"
  local expected_candidate="${2:-}"

  release_record_validate_structure "$path" || return 1
  "$REMOTE_PYTHON_BIN" - "$path" "$expected_candidate" "$REMOTE_APP_NAME" <<'PY'
import datetime
import pathlib
import re
import sys

path, expected_candidate, app = sys.argv[1:]
fields = {}
for line in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
    key, value = line.split("=", 1)
    if key in fields:
        raise SystemExit(1)
    fields[key] = value

base = {
    "protocol_version", "record_kind", "orchestrator_commit", "orchestrator_protocol_version",
    "candidate_commit", "candidate_archive_sha256", "rollback_commit", "rollback_archive_sha256",
    "prepared_at_utc", "prepared_at_epoch", "expires_at_utc", "expires_at_epoch",
    "observed_current_commit", "production_env_sha256", "migration_classification",
    "backend_image_tag", "backend_image_id", "web_image_tag", "web_image_id",
    "telegram_image_tag", "telegram_image_id", "rollback_backend_image_tag",
    "rollback_backend_image_id", "rollback_web_image_tag", "rollback_web_image_id",
    "rollback_telegram_image_tag", "rollback_telegram_image_id", "tenant_count",
    "tenant_matrix_sha256", "external_image_count",
}
if not base.issubset(fields):
    raise SystemExit(1)
sha = re.compile(r"[0-9a-f]{40}\Z")
checksum = re.compile(r"[0-9a-f]{64}\Z")
image = re.compile(r"sha256:[0-9a-f]{64}\Z")
timestamp = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\Z")
if fields["protocol_version"] != "1" or fields["record_kind"] != "prepared_release":
    raise SystemExit(1)
if fields["orchestrator_protocol_version"] != "1":
    raise SystemExit(1)
for key in ("orchestrator_commit", "candidate_commit", "rollback_commit", "observed_current_commit"):
    if not sha.fullmatch(fields[key]):
        raise SystemExit(1)
if expected_candidate and fields["candidate_commit"] != expected_candidate:
    raise SystemExit(1)
if fields["rollback_commit"] != fields["observed_current_commit"]:
    raise SystemExit(1)
for key in ("candidate_archive_sha256", "rollback_archive_sha256", "production_env_sha256", "tenant_matrix_sha256"):
    if not checksum.fullmatch(fields[key]):
        raise SystemExit(1)
if fields["migration_classification"] not in {"none", "migration"}:
    raise SystemExit(1)
try:
    prepared = int(fields["prepared_at_epoch"])
    expires = int(fields["expires_at_epoch"])
    tenants = int(fields["tenant_count"])
    external_count = int(fields["external_image_count"])
except ValueError:
    raise SystemExit(1)
if prepared < 1 or expires != prepared + 86400 or not (1 <= tenants <= 100) or not (0 <= external_count <= 32):
    raise SystemExit(1)
for key, epoch in (("prepared_at_utc", prepared), ("expires_at_utc", expires)):
    if not timestamp.fullmatch(fields[key]):
        raise SystemExit(1)
    rendered = datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if fields[key] != rendered:
        raise SystemExit(1)

candidate = fields["candidate_commit"]
rollback = fields["rollback_commit"]
expected_tags = {
    "backend_image_tag": f"{app}-portal-backend:{candidate}",
    "web_image_tag": f"{app}-portal-web:{candidate}",
    "telegram_image_tag": f"{app}-telegram-bridge:{candidate}",
    "rollback_backend_image_tag": f"{app}-portal-backend:{rollback}",
    "rollback_web_image_tag": f"{app}-portal-web:{rollback}",
    "rollback_telegram_image_tag": f"{app}-telegram-bridge:{rollback}",
}
for key, value in expected_tags.items():
    if fields[key] != value:
        raise SystemExit(1)
for key in (
    "backend_image_id", "web_image_id", "telegram_image_id",
    "rollback_backend_image_id", "rollback_web_image_id", "rollback_telegram_image_id",
):
    if not image.fullmatch(fields[key]):
        raise SystemExit(1)

dynamic = set()
for index in range(1, external_count + 1):
    ref_key = f"external_image_{index:03d}_ref"
    id_key = f"external_image_{index:03d}_id"
    dynamic.update((ref_key, id_key))
    ref = fields.get(ref_key, "")
    if not ref or len(ref.encode()) > 255 or ref.startswith("-") or any(char.isspace() or ord(char) < 32 for char in ref):
        raise SystemExit(1)
    if not image.fullmatch(fields.get(id_key, "")):
        raise SystemExit(1)
if set(fields) != base | dynamic:
    raise SystemExit(1)
PY
}

REMOTE_ROLLBACK_ARCHIVE_SHA=''
REMOTE_ROLLBACK_BACKEND_ID=''
REMOTE_ROLLBACK_WEB_ID=''
REMOTE_ROLLBACK_TELEGRAM_ID=''
remote_load_release_evidence() {
  local release_dir="$1"
  local commit="$2"
  local manifest="$release_dir/manifest.txt"
  local kind

  kind="$(release_record_get_unique "$manifest" record_kind)" || return 1
  if [[ "$kind" == 'imported_release' ]]; then
    remote_validate_imported_manifest "$manifest" "$commit" || return 1
    REMOTE_ROLLBACK_ARCHIVE_SHA="$(release_record_get_unique "$manifest" archive_sha256)"
    REMOTE_ROLLBACK_BACKEND_ID="$(release_record_get_unique "$manifest" backend_image_id)"
    REMOTE_ROLLBACK_WEB_ID="$(release_record_get_unique "$manifest" web_image_id)"
    REMOTE_ROLLBACK_TELEGRAM_ID="$(release_record_get_unique "$manifest" telegram_image_id)"
  elif [[ "$kind" == 'prepared_release' ]]; then
    remote_validate_prepared_manifest "$manifest" "$commit" || return 1
    REMOTE_ROLLBACK_ARCHIVE_SHA="$(release_record_get_unique "$manifest" candidate_archive_sha256)"
    REMOTE_ROLLBACK_BACKEND_ID="$(release_record_get_unique "$manifest" backend_image_id)"
    REMOTE_ROLLBACK_WEB_ID="$(release_record_get_unique "$manifest" web_image_id)"
    REMOTE_ROLLBACK_TELEGRAM_ID="$(release_record_get_unique "$manifest" telegram_image_id)"
  else
    return 1
  fi
}

remote_validate_state_layout() {
  local app_path="$1"
  local allow_transaction="${2:-false}"
  local allow_critical_layout="${3:-false}"
  local state_dir="$app_path/.release-state"
  local releases_dir="$app_path/.releases"
  local entry name count=0 pointer current='' previous='' adoption='' prepared=''
  local -a links=() state_entries=() release_entries=()

  remote_require_private_directory "$state_dir" || return 1
  remote_require_private_directory "$releases_dir" || return 1
  remote_require_private_directory "$state_dir/decisions" || return 1
  remote_require_private_directory "$state_dir/history" || return 1
  remote_find_paths links "$state_dir" "$releases_dir" -type l || return 1
  (( ${#links[@]} == 0 )) || return 1
  [[ "$allow_transaction" == 'false' || "$allow_transaction" == 'true' ]] || return 1
  [[ "$allow_critical_layout" == 'false' || "$allow_critical_layout" == 'true' ]] || return 1
  [[ "$allow_critical_layout" == 'false' || "$allow_transaction" == 'true' ]] || return 1
  if [[ -e "$state_dir/transaction" || -L "$state_dir/transaction" ]]; then
    [[ "$allow_transaction" == 'true' ]] || return 1
    release_record_require_private_file "$state_dir/transaction" || return 1
  fi

  remote_find_paths state_entries "$state_dir" -mindepth 1 -maxdepth 1 || return 1
  for entry in "${state_entries[@]}"; do
    name="$(basename -- "$entry")"
    case "$name" in
      deploy.lock|adoption|current|previous|prepared|transaction) [[ -f "$entry" && ! -L "$entry" ]] || return 1 ;;
      decisions|history) remote_require_private_directory "$entry" || return 1 ;;
      *) return 1 ;;
    esac
  done

  for pointer in adoption current previous prepared; do
    if [[ -e "$state_dir/$pointer" || -L "$state_dir/$pointer" ]]; then
      remote_pointer_read "$state_dir/$pointer" >/dev/null || return 1
    fi
  done
  [[ ! -e "$state_dir/current" ]] || current="$(remote_pointer_read "$state_dir/current")"
  [[ ! -e "$state_dir/previous" ]] || previous="$(remote_pointer_read "$state_dir/previous")"
  [[ ! -e "$state_dir/adoption" ]] || adoption="$(remote_pointer_read "$state_dir/adoption")"
  [[ ! -e "$state_dir/prepared" ]] || prepared="$(remote_pointer_read "$state_dir/prepared")"
  for pointer in "$current" "$previous" "$adoption" "$prepared"; do
    [[ -z "$pointer" ]] || remote_require_private_directory "$releases_dir/$pointer" || return 1
  done
  if [[ "$allow_critical_layout" == 'false' ]]; then
    if [[ -n "$current" ]]; then
      [[ -z "$adoption" ]] || return 1
    else
      [[ -z "$previous" ]] || return 1
    fi
    [[ -z "$current" || -z "$previous" || "$current" != "$previous" ]] || return 1
  else
    [[ -f "$state_dir/transaction" ]] || return 1
  fi

  remote_find_paths release_entries "$releases_dir" -mindepth 1 -maxdepth 1 || return 1
  for entry in "${release_entries[@]}"; do
    name="$(basename -- "$entry")"
    remote_require_private_directory "$entry" || return 1
    release_record_is_sha "$name" || return 1
    if [[ "$allow_critical_layout" == 'false' ]]; then
      [[ "$name" == "$current" || "$name" == "$previous" || "$name" == "$adoption" ||
        "$name" == "$prepared" ]] || return 1
    fi
    count=$((count + 1))
  done
  (( count <= 3 ))
}

remote_prepare_initialize_layout() {
  local app_path="$1"
  local state_dir="$app_path/.release-state"
  local releases_dir="$app_path/.releases"
  local path

  [[ -d "$app_path" && ! -L "$app_path" ]] || return 1
  [[ -f "$app_path/.env.production" && ! -L "$app_path/.env.production" ]] || return 1
  release_record_require_private_file "$app_path/.env.production" || return 1
  for path in "$state_dir" "$releases_dir"; do
    [[ ! -L "$path" ]] || return 1
    if [[ -e "$path" ]]; then
      remote_require_private_directory "$path" || return 1
    else
      mkdir -m 0700 -- "$path" || return 1
    fi
  done
  for path in "$state_dir/decisions" "$state_dir/history"; do
    [[ ! -L "$path" ]] || return 1
    if [[ -e "$path" ]]; then
      remote_require_private_directory "$path" || return 1
    else
      mkdir -m 0700 -- "$path" || return 1
    fi
  done
}

remote_prepare_cleanup_attempt() {
  local item reference expected_id

  if (( ${#REMOTE_DOCKER[@]} > 0 )); then
    for item in "${REMOTE_PREPARE_CREATED_TAGS[@]}"; do
      reference="${item%%=*}"
      expected_id="${item#*=}"
      remote_remove_exact_tag "$reference" "$expected_id" >/dev/null 2>&1 || true
    done
    if [[ "$REMOTE_PREPARE_ADOPTION_VERIFIED" == 'false' ]]; then
      for item in "${REMOTE_PREPARE_ADOPTION_CREATED_TAGS[@]}"; do
        reference="${item%%=*}"
        expected_id="${item#*=}"
        remote_remove_exact_tag "$reference" "$expected_id" >/dev/null 2>&1 || true
      done
    fi
  fi
  if [[ "$REMOTE_PREPARE_PUBLISHED" == 'false' && -n "$REMOTE_PREPARE_CANDIDATE_DIR" &&
    -n "$REMOTE_PREPARE_CANDIDATE_COMMIT" &&
    "$REMOTE_PREPARE_CANDIDATE_DIR" == */.releases/"$REMOTE_PREPARE_CANDIDATE_COMMIT" &&
    -d "$REMOTE_PREPARE_CANDIDATE_DIR" && ! -L "$REMOTE_PREPARE_CANDIDATE_DIR" ]]; then
    rm -rf -- "$REMOTE_PREPARE_CANDIDATE_DIR"
  fi
  if [[ "$REMOTE_PREPARE_ADOPTION_VERIFIED" == 'false' && -n "$REMOTE_PREPARE_ADOPTION_DIR" &&
    "$REMOTE_PREPARE_ADOPTION_DIR" == */.releases/* && -d "$REMOTE_PREPARE_ADOPTION_DIR" &&
    ! -L "$REMOTE_PREPARE_ADOPTION_DIR" ]]; then
    rm -rf -- "$REMOTE_PREPARE_ADOPTION_DIR"
  fi
}

remote_prepare_abort() {
  local message="$1"

  remote_prepare_cleanup_attempt || true
  remote_fail "$message" prepare_failed
}

REMOTE_PRODUCTION_ENV_SHA=''
remote_validate_production_env_copy() {
  local app_path="$1"
  local candidate_release="$2"
  local env_file="$app_path/.env.production"
  local helper="$candidate_release/source/scripts/ensure-production-object-storage-env.sh"
  local temporary copy helper_log changes

  release_record_require_private_file "$env_file" || return 1
  [[ -x "$helper" && -f "$helper" && ! -L "$helper" ]] || return 1
  temporary="$(mktemp -d /tmp/chatwoot-client-portal-v2-env-check.XXXXXX)" || return 1
  REMOTE_PREPARE_ENV_TEMP="$temporary"
  chmod 0700 "$temporary" || {
    remote_cleanup_env_temp || true
    return 1
  }
  copy="$temporary/.env.production"
  helper_log="$temporary/helper.log"
  cp -- "$env_file" "$copy" || {
    remote_cleanup_env_temp
    return 1
  }
  chmod 0600 "$copy" || {
    remote_cleanup_env_temp || true
    return 1
  }
  if remote_is_test_mode && [[ "${STAGED_TEST_INTERRUPT_AFTER_ENV_COPY:-false}" == 'true' ]]; then
    local marker="${STAGED_TEST_ENV_TEMP_MARKER:-}"
    [[ -n "$marker" && "$marker" == "${STAGED_TEST_ROOT%/}/"* &&
      -d "$(dirname -- "$marker")" && ! -L "$(dirname -- "$marker")" ]] || return 1
    printf '%s\n' "$temporary" >"$marker"
    chmod 0600 "$marker"
    kill -TERM "$$"
    return 1
  fi
  if ! "$helper" "--env-file=$copy" >"$helper_log" 2>&1; then
    remote_cleanup_env_temp
    return 1
  fi
  if ! cmp -s -- "$env_file" "$copy"; then
    changes="$("$REMOTE_PYTHON_BIN" - "$env_file" "$copy" <<'PY'
import pathlib
import re
import sys

def parse(path):
    result = {}
    for raw in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#"):
            continue
        if "=" not in raw:
            raise SystemExit(1)
        key, value = raw.split("=", 1)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in result:
            raise SystemExit(1)
        result[key] = value
    return result

before, after = parse(sys.argv[1]), parse(sys.argv[2])
missing = sorted(set(after) - set(before))
removed = sorted(set(before) - set(after))
changed = sorted(key for key in set(before) & set(after) if before[key] != after[key])
if missing:
    print("Missing production env keys: " + ", ".join(missing))
if removed:
    print("Production env keys requiring removal: " + ", ".join(removed))
if changed:
    print("Production env keys requiring changed values: " + ", ".join(changed))
PY
)" || {
      remote_cleanup_env_temp
      return 1
    }
    remote_cleanup_env_temp || return 1
    [[ -n "$changes" ]] && printf '%s\n' "$changes" >&2
    return 1
  fi
  remote_cleanup_env_temp || return 1
  REMOTE_PRODUCTION_ENV_SHA="$(sha256sum "$env_file" | awk '{print $1}')" || return 1
  release_record_is_checksum "$REMOTE_PRODUCTION_ENV_SHA"
}

REMOTE_MIGRATION_CLASSIFICATION='none'
remote_classify_migrations() {
  local current_source="$1"
  local candidate_source="$2"
  local relative current_path candidate_path diff_exit
  local -a paths=(backend/drizzle backend/drizzle.config.ts backend/src/db/migrate.ts)

  REMOTE_MIGRATION_CLASSIFICATION='none'
  for relative in "${paths[@]}"; do
    current_path="$current_source/$relative"
    candidate_path="$candidate_source/$relative"
    if [[ ! -e "$current_path" && ! -L "$current_path" && ! -e "$candidate_path" && ! -L "$candidate_path" ]]; then
      continue
    fi
    if [[ (! -e "$current_path" && ! -L "$current_path") ||
      (! -e "$candidate_path" && ! -L "$candidate_path") ]]; then
      REMOTE_MIGRATION_CLASSIFICATION='migration'
      continue
    fi
    set +e
    diff -qr --no-dereference -- "$current_path" "$candidate_path" >/dev/null 2>&1
    diff_exit=$?
    set -e
    case "$diff_exit" in
      0) ;;
      1) REMOTE_MIGRATION_CLASSIFICATION='migration' ;;
      *) return 1 ;;
    esac
  done
}

remote_validate_disk_budget() {
  local releases_dir="$1"
  shift
  local image_id size current_bytes=0 required_bytes available_bytes available_kb

  (( $# == 3 )) || return 1
  for image_id in "$@"; do
    size="$("${REMOTE_DOCKER[@]}" image inspect --format '{{.Size}}' "$image_id" 2>/dev/null)" || return 1
    [[ "$size" =~ ^[0-9]+$ && "$size" != '0' ]] || return 1
    current_bytes="$("$REMOTE_PYTHON_BIN" - "$current_bytes" "$size" <<'PY'
import sys
print(int(sys.argv[1]) + int(sys.argv[2]))
PY
)" || return 1
  done
  required_bytes="$("$REMOTE_PYTHON_BIN" - "$current_bytes" <<'PY'
import sys
print(max(8 * 1024 * 1024 * 1024, 2 * int(sys.argv[1])))
PY
)" || return 1

  if remote_is_test_mode && [[ -n "${STAGED_TEST_AVAILABLE_BYTES:-}" ]]; then
    available_bytes="$STAGED_TEST_AVAILABLE_BYTES"
  else
    [[ -z "${STAGED_TEST_AVAILABLE_BYTES:-}" ]] || return 1
    available_kb="$(df -Pk -- "$releases_dir" | awk 'NR == 2 {print $4}')" || return 1
    [[ "$available_kb" =~ ^[0-9]+$ ]] || return 1
    available_bytes="$("$REMOTE_PYTHON_BIN" - "$available_kb" <<'PY'
import sys
print(int(sys.argv[1]) * 1024)
PY
)" || return 1
  fi
  [[ "$available_bytes" =~ ^[0-9]+$ ]] || return 1
  "$REMOTE_PYTHON_BIN" - "$available_bytes" "$required_bytes" <<'PY'
import sys
raise SystemExit(0 if int(sys.argv[1]) >= int(sys.argv[2]) else 1)
PY
}

REMOTE_EXTERNAL_REFS=()
REMOTE_EXTERNAL_IDS=()
remote_validate_image_reference() {
  local reference="$1"
  local byte_count

  byte_count="$(LC_ALL=C printf '%s' "$reference" | wc -c | tr -d ' ')" || return 1
  [[ "$byte_count" =~ ^[0-9]+$ ]] || return 1
  (( byte_count >= 1 && byte_count <= 255 )) || return 1
  [[ "$reference" != -* ]] || return 1
  if LC_ALL=C grep -q '[[:space:][:cntrl:]]' < <(printf '%s' "$reference"); then
    return 1
  fi
}

remote_resolve_external_images() {
  local candidate_commit="$1"
  local images_output="$2"
  local reference image_id count
  local -a all_refs=() built_refs=(
    "$(remote_release_tag portal-backend "$candidate_commit")"
    "$(remote_release_tag portal-web "$candidate_commit")"
    "$(remote_release_tag telegram-bridge "$candidate_commit")"
  )

  mapfile -t all_refs < <(LC_ALL=C sort -u <<<"$images_output")
  REMOTE_EXTERNAL_REFS=()
  REMOTE_EXTERNAL_IDS=()
  for reference in "${all_refs[@]}"; do
    [[ -n "$reference" ]] || return 1
    remote_validate_image_reference "$reference" || return 1
    if [[ "$reference" == "${built_refs[0]}" || "$reference" == "${built_refs[1]}" ||
      "$reference" == "${built_refs[2]}" ]]; then
      continue
    fi
    REMOTE_EXTERNAL_REFS+=("$reference")
  done
  count=${#REMOTE_EXTERNAL_REFS[@]}
  (( count <= 32 )) || return 1
  for reference in "${REMOTE_EXTERNAL_REFS[@]}"; do
    if ! image_id="$(remote_image_id "$reference" 2>/dev/null)"; then
      "${REMOTE_DOCKER[@]}" pull "$reference" >/dev/null || return 1
      image_id="$(remote_image_id "$reference")" || return 1
    fi
    REMOTE_EXTERNAL_IDS+=("$image_id")
  done
}

remote_revalidate_all_images() {
  local candidate_commit="$1"
  local rollback_commit="$2"
  local candidate_backend_id="$3"
  local candidate_web_id="$4"
  local candidate_telegram_id="$5"
  local index

  [[ "$(remote_image_id "$(remote_release_tag portal-backend "$candidate_commit")")" == "$candidate_backend_id" ]] || return 1
  [[ "$(remote_image_id "$(remote_release_tag portal-web "$candidate_commit")")" == "$candidate_web_id" ]] || return 1
  [[ "$(remote_image_id "$(remote_release_tag telegram-bridge "$candidate_commit")")" == "$candidate_telegram_id" ]] || return 1
  [[ "$(remote_image_id "$(remote_release_tag portal-backend "$rollback_commit")")" == "$REMOTE_ROLLBACK_BACKEND_ID" ]] || return 1
  [[ "$(remote_image_id "$(remote_release_tag portal-web "$rollback_commit")")" == "$REMOTE_ROLLBACK_WEB_ID" ]] || return 1
  [[ "$(remote_image_id "$(remote_release_tag telegram-bridge "$rollback_commit")")" == "$REMOTE_ROLLBACK_TELEGRAM_ID" ]] || return 1
  for index in "${!REMOTE_EXTERNAL_REFS[@]}"; do
    [[ "$(remote_image_id "${REMOTE_EXTERNAL_REFS[$index]}")" == "${REMOTE_EXTERNAL_IDS[$index]}" ]] || return 1
  done
}

REMOTE_TENANT_COUNT=''
REMOTE_TENANT_MATRIX_SHA=''
readonly REMOTE_TENANT_SQL="SELECT
  CASE WHEN octet_length(slug) <= 63 THEN slug ELSE repeat('x', 64) END,
  CASE WHEN octet_length(public_base_url) <= 2048 THEN public_base_url ELSE repeat('x', 2049) END
FROM portal_tenants
WHERE status = 'active'
ORDER BY portal_tenants.slug
LIMIT 101;"
remote_query_tenant_matrix() {
  local output_path="$1"
  local raw_path="$2"

  "${REMOTE_COMPOSE[@]}" exec -T portal-db sh -ceu \
    'exec psql -X -v ON_ERROR_STOP=1 -A -t -F "$(printf "\t")" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' \
    sh "$REMOTE_TENANT_SQL" >"$raw_path" || return 1
  "$REMOTE_PYTHON_BIN" - "$raw_path" "$output_path" <<'PY' || return 1
import pathlib
import re
import sys
import urllib.parse

source, destination = map(pathlib.Path, sys.argv[1:])
if source.stat().st_size > 262144:
    raise SystemExit(1)
raw = source.read_text(encoding="utf-8")
if "\r" in raw or any(ord(char) < 9 or (13 < ord(char) < 32) or ord(char) == 127 for char in raw):
    raise SystemExit(1)
rows = []
seen = set()
for line in raw.splitlines():
    parts = line.split("\t")
    if len(parts) != 2:
        raise SystemExit(1)
    slug, origin = parts
    if len(slug) > 63 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug in seen:
        raise SystemExit(1)
    if len(origin.encode("utf-8")) > 2048:
        raise SystemExit(1)
    try:
        parsed = urllib.parse.urlsplit(origin)
        port = parsed.port
    except ValueError:
        raise SystemExit(1)
    if port is not None and not (1 <= port <= 65535):
        raise SystemExit(1)
    if (
        parsed.scheme != "https" or not parsed.hostname or parsed.username is not None or
        parsed.password is not None or parsed.query or parsed.fragment or parsed.path not in {"", "/"}
    ):
        raise SystemExit(1)
    host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
    canonical = f"https://{host}" + (f":{port}" if port is not None else "")
    if origin not in {canonical, canonical + "/"}:
        raise SystemExit(1)
    seen.add(slug)
    rows.append((slug, origin))
if not (1 <= len(rows) <= 100):
    raise SystemExit(1)
rows.sort()
serialized = "".join(f"{slug}\t{origin}\n" for slug, origin in rows).encode("utf-8")
if len(serialized) > 262144:
    raise SystemExit(1)
destination.write_bytes(serialized)
PY
  chmod 0600 "$output_path" || return 1
  REMOTE_TENANT_COUNT="$(wc -l <"$output_path" | tr -d ' ')" || return 1
  [[ "$REMOTE_TENANT_COUNT" =~ ^[0-9]+$ ]] || return 1
  (( REMOTE_TENANT_COUNT >= 1 && REMOTE_TENANT_COUNT <= 100 )) || return 1
  REMOTE_TENANT_MATRIX_SHA="$(sha256sum "$output_path" | awk '{print $1}')" || return 1
  release_record_is_checksum "$REMOTE_TENANT_MATRIX_SHA"
}

remote_now_epoch() {
  local value

  if remote_is_test_mode && [[ -n "${STAGED_TEST_NOW_EPOCH:-}" ]]; then
    value="$STAGED_TEST_NOW_EPOCH"
  else
    [[ -z "${STAGED_TEST_NOW_EPOCH:-}" ]] || return 1
    value="$(date -u +%s)" || return 1
  fi
  [[ "$value" =~ ^[0-9]+$ && "$value" != '0' ]] || return 1
  printf '%s\n' "$value"
}

remote_cutover_now_epoch() {
  local value="${STAGED_TEST_CUTOVER_NOW_EPOCH:-}"

  if remote_is_test_mode && [[ -n "$value" ]]; then
    [[ "$value" =~ ^[0-9]+$ && "$value" != '0' ]] || return 1
    printf '%s\n' "$value"
    return
  fi
  [[ -z "$value" ]] || return 1
  remote_now_epoch
}

remote_epoch_to_utc() {
  local epoch="$1"

  [[ "$epoch" =~ ^[0-9]+$ ]] || return 1
  date -u -d "@$epoch" +%Y-%m-%dT%H:%M:%SZ
}

remote_history_blocks_candidate_cleanup() {
  local history_dir="$1"
  local candidate="$2"
  local path record_candidate status
  local -a entries=()

  remote_require_private_directory "$history_dir" || return 2
  remote_find_paths entries "$history_dir" -mindepth 1 -maxdepth 1 || return 2
  for path in "${entries[@]}"; do
    [[ -f "$path" && ! -L "$path" ]] || return 2
    record_candidate="$(release_record_get_unique "$path" candidate_commit 2>/dev/null)" || continue
    [[ "$record_candidate" == "$candidate" ]] || continue
    status="$(release_record_get_unique "$path" status 2>/dev/null)" || return 2
    case "$status" in
      candidate_failed_rollback_failed|candidate_failed_forward_only|activation_failed_publication)
        return 0
        ;;
    esac
  done
  return 1
}

remote_remove_expired_candidate() {
  local app_path="$1"
  local now_epoch="$2"
  local state_dir="$app_path/.release-state"
  local releases_dir="$app_path/.releases"
  local prepared_path="$state_dir/prepared"
  local candidate manifest expires pointer value service tag_key id_key tag image_id index history_result
  local decision policy approval
  local -a tags=() image_ids=()

  [[ -e "$prepared_path" || -L "$prepared_path" ]] || return 0
  candidate="$(remote_pointer_read "$prepared_path")" || return 1
  manifest="$releases_dir/$candidate/manifest.txt"
  remote_validate_prepared_manifest "$manifest" "$candidate" || return 1
  expires="$(release_record_get_unique "$manifest" expires_at_epoch)" || return 1
  [[ "$expires" =~ ^[0-9]+$ ]] || return 1
  (( now_epoch >= expires )) || return 2
  for pointer in current previous adoption; do
    if [[ -e "$state_dir/$pointer" || -L "$state_dir/$pointer" ]]; then
      value="$(remote_pointer_read "$state_dir/$pointer")" || return 1
      [[ "$value" != "$candidate" ]] || return 1
    fi
  done
  set +e
  remote_history_blocks_candidate_cleanup "$state_dir/history" "$candidate"
  history_result=$?
  set -e
  case "$history_result" in
    0) return 1 ;;
    1) ;;
    *) return 1 ;;
  esac
  [[ -d "$releases_dir/$candidate" && ! -L "$releases_dir/$candidate" ]] || return 1

  decision="$state_dir/decisions/$candidate.txt"
  if [[ -e "$decision" || -L "$decision" ]]; then
    policy="$(release_record_get_unique "$decision" migration_policy)" || return 1
    approval="$(release_record_get_unique "$decision" approval_ref)" || return 1
    remote_validate_activation_decision "$decision" "$candidate" "$policy" "$approval" || return 1
  fi

  for service in backend web telegram; do
    tag_key="${service}_image_tag"
    id_key="${service}_image_id"
    tag="$(release_record_get_unique "$manifest" "$tag_key")" || return 1
    image_id="$(release_record_get_unique "$manifest" "$id_key")" || return 1
    [[ "$(remote_image_id "$tag")" == "$image_id" ]] || return 1
    tags+=("$tag")
    image_ids+=("$image_id")
  done
  for index in "${!tags[@]}"; do
    remote_remove_exact_tag "${tags[$index]}" "${image_ids[$index]}" || return 1
  done
  rm -rf -- "$releases_dir/$candidate" || return 1
  rm -f -- "$prepared_path" || return 1
  [[ ! -e "$decision" && ! -L "$decision" ]] || rm -f -- "$decision" || return 1
}

remote_import_or_validate_current_release() {
  local app_path="$1"
  local current_archive="$2"
  local current_archive_sha="$3"
  local current_commit="$4"
  local now_utc="$5"
  local state_dir="$app_path/.release-state"
  local releases_dir="$app_path/.releases"
  local release_dir="$releases_dir/$current_commit"
  local pointer_kind='' pointer current_checksum service container_id running_id tag
  local backend_id='' web_id='' telegram_id=''

  if [[ -e "$state_dir/current" || -L "$state_dir/current" ]]; then
    pointer_kind='current'
  elif [[ -e "$state_dir/adoption" || -L "$state_dir/adoption" ]]; then
    pointer_kind='adoption'
  fi

  if [[ -n "$pointer_kind" ]]; then
    pointer="$(remote_pointer_read "$state_dir/$pointer_kind")" || return 1
    [[ "$pointer" == "$current_commit" ]] || return 1
    [[ -d "$release_dir/source" && -f "$release_dir/source.tar.gz" &&
      -f "$release_dir/compose.release.yaml" && -f "$release_dir/manifest.txt" ]] || return 1
    remote_load_release_evidence "$release_dir" "$current_commit" || return 1
    [[ "$REMOTE_ROLLBACK_ARCHIVE_SHA" == "$current_archive_sha" ]] || return 1
    if [[ "$pointer_kind" == 'current' ]]; then
      [[ "$REMOTE_INSPECT_ARCHIVE_SHA" == "$REMOTE_ROLLBACK_ARCHIVE_SHA" ]] || return 1
    fi
    current_checksum="$(sha256sum "$release_dir/source.tar.gz" | awk '{print $1}')" || return 1
    [[ "$current_checksum" == "$current_archive_sha" ]] || return 1
    [[ "$(sha256sum "$current_archive" | awk '{print $1}')" == "$current_archive_sha" ]] || return 1
    remote_validate_archive "$current_archive" || return 1
    [[ "$(remote_image_id "$(remote_release_tag portal-backend "$current_commit")")" == "$REMOTE_ROLLBACK_BACKEND_ID" ]] || return 1
    [[ "$(remote_image_id "$(remote_release_tag portal-web "$current_commit")")" == "$REMOTE_ROLLBACK_WEB_ID" ]] || return 1
    [[ "$(remote_image_id "$(remote_release_tag telegram-bridge "$current_commit")")" == "$REMOTE_ROLLBACK_TELEGRAM_ID" ]] || return 1
    [[ "$pointer_kind" != 'adoption' ]] || REMOTE_PREPARE_ADOPTION_VERIFIED='true'
    return 0
  fi

  [[ ! -e "$release_dir" && ! -L "$release_dir" ]] || return 1
  REMOTE_PREPARE_ADOPTION_DIR="$release_dir"
  remote_extract_release_archive "$current_archive" "$current_archive_sha" "$release_dir" || return 1
  remote_write_release_override "$release_dir" "$current_commit" || return 1
  remote_configure_compose "$app_path" "$release_dir" || return 1

  for service in portal-backend portal-web telegram-bridge; do
    container_id="$("${REMOTE_COMPOSE[@]}" ps -q "$service")" || return 1
    [[ "$container_id" =~ ^[A-Za-z0-9][A-Za-z0-9_.:-]*$ ]] || return 1
    running_id="$("${REMOTE_DOCKER[@]}" inspect --format '{{.Image}}' "$container_id" 2>/dev/null)" || return 1
    [[ "$running_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
    [[ "$(remote_image_id "$running_id")" == "$running_id" ]] || return 1
    tag="$(remote_release_tag "$service" "$current_commit")" || return 1
    remote_tag_exact_image "$running_id" "$tag" adoption || return 1
    case "$service" in
      portal-backend) backend_id="$running_id" ;;
      portal-web) web_id="$running_id" ;;
      telegram-bridge) telegram_id="$running_id" ;;
    esac
  done
  remote_write_imported_manifest \
    "$release_dir/manifest.txt" "$current_commit" "$current_archive_sha" "$now_utc" \
    "$backend_id" "$web_id" "$telegram_id" || return 1
  remote_pointer_write create "$state_dir/adoption" "$current_commit" || return 1
  REMOTE_ROLLBACK_ARCHIVE_SHA="$current_archive_sha"
  REMOTE_ROLLBACK_BACKEND_ID="$backend_id"
  REMOTE_ROLLBACK_WEB_ID="$web_id"
  REMOTE_ROLLBACK_TELEGRAM_ID="$telegram_id"
  REMOTE_PREPARE_ADOPTION_VERIFIED='true'
  REMOTE_PREPARE_ADOPTION_DIR=''
}

remote_manifest_write_prepared() {
  local path="$1"
  local orchestrator_commit="$2"
  local candidate_commit="$3"
  local candidate_archive_sha="$4"
  local rollback_commit="$5"
  local prepared_epoch="$6"
  local prepared_utc="$7"
  local expires_epoch="$8"
  local expires_utc="$9"
  local candidate_backend_id="${10}"
  local candidate_web_id="${11}"
  local candidate_telegram_id="${12}"
  local index key_index

  {
    printf '%s\n' \
      "protocol_version=$REMOTE_PROTOCOL_VERSION" \
      'record_kind=prepared_release' \
      "orchestrator_commit=$orchestrator_commit" \
      "orchestrator_protocol_version=$REMOTE_PROTOCOL_VERSION" \
      "candidate_commit=$candidate_commit" \
      "candidate_archive_sha256=$candidate_archive_sha" \
      "rollback_commit=$rollback_commit" \
      "rollback_archive_sha256=$REMOTE_ROLLBACK_ARCHIVE_SHA" \
      "prepared_at_utc=$prepared_utc" \
      "prepared_at_epoch=$prepared_epoch" \
      "expires_at_utc=$expires_utc" \
      "expires_at_epoch=$expires_epoch" \
      "observed_current_commit=$rollback_commit" \
      "production_env_sha256=$REMOTE_PRODUCTION_ENV_SHA" \
      "migration_classification=$REMOTE_MIGRATION_CLASSIFICATION" \
      "backend_image_tag=$(remote_release_tag portal-backend "$candidate_commit")" \
      "backend_image_id=$candidate_backend_id" \
      "web_image_tag=$(remote_release_tag portal-web "$candidate_commit")" \
      "web_image_id=$candidate_web_id" \
      "telegram_image_tag=$(remote_release_tag telegram-bridge "$candidate_commit")" \
      "telegram_image_id=$candidate_telegram_id" \
      "rollback_backend_image_tag=$(remote_release_tag portal-backend "$rollback_commit")" \
      "rollback_backend_image_id=$REMOTE_ROLLBACK_BACKEND_ID" \
      "rollback_web_image_tag=$(remote_release_tag portal-web "$rollback_commit")" \
      "rollback_web_image_id=$REMOTE_ROLLBACK_WEB_ID" \
      "rollback_telegram_image_tag=$(remote_release_tag telegram-bridge "$rollback_commit")" \
      "rollback_telegram_image_id=$REMOTE_ROLLBACK_TELEGRAM_ID" \
      "tenant_count=$REMOTE_TENANT_COUNT" \
      "tenant_matrix_sha256=$REMOTE_TENANT_MATRIX_SHA" \
      "external_image_count=${#REMOTE_EXTERNAL_REFS[@]}"
    for index in "${!REMOTE_EXTERNAL_REFS[@]}"; do
      printf -v key_index '%03d' "$((index + 1))"
      printf 'external_image_%s_ref=%s\n' "$key_index" "${REMOTE_EXTERNAL_REFS[$index]}"
      printf 'external_image_%s_id=%s\n' "$key_index" "${REMOTE_EXTERNAL_IDS[$index]}"
    done
  } | release_record_write_atomic create "$path" || return 1
  remote_validate_prepared_manifest "$path" "$candidate_commit"
}

remote_locked_prepare() {
  local app_path="$1"
  local candidate_archive="$2"
  local candidate_archive_sha="$3"
  local candidate_commit="$4"
  local current_archive="$5"
  local current_archive_sha="$6"
  local current_commit="$7"
  local orchestrator_commit="$8"
  local state_dir="$app_path/.release-state"
  local releases_dir="$app_path/.releases"
  local candidate_dir="$releases_dir/$candidate_commit"
  local current_dir="$releases_dir/$current_commit"
  local now_epoch now_utc expires_epoch expires_utc release_count service tag image_id
  local candidate_backend_id='' candidate_web_id='' candidate_telegram_id=''
  local help_output images_output raw_tenants real_env_sha_after
  local -a retained_releases=()

  REMOTE_FAILURE_STATUS='prepare_failed'
  REMOTE_PREPARE_CANDIDATE_COMMIT="$candidate_commit"
  REMOTE_PREPARE_CANDIDATE_DIR=''
  REMOTE_PREPARE_PUBLISHED='false'
  REMOTE_PREPARE_CREATED_TAGS=()
  REMOTE_PREPARE_ADOPTION_DIR=''
  REMOTE_PREPARE_ADOPTION_VERIFIED='false'
  REMOTE_PREPARE_ADOPTION_CREATED_TAGS=()

  remote_select_docker || remote_prepare_abort 'Docker access is unavailable.'
  REMOTE_PYTHON_BIN="$(remote_select_python)" || remote_prepare_abort 'Python 3 is unavailable.'
  for required in tar sha256sum find stat flock diff cmp date df awk sort wc tr grep mktemp chmod cp rm; do
    command -v "$required" >/dev/null || remote_prepare_abort "Required command is missing: $required"
  done
  remote_block_on_critical_state "$app_path" prepare ||
    remote_prepare_abort 'Critical deployment evidence is invalid.'
  remote_validate_state_layout "$app_path" || remote_prepare_abort 'Release state layout is invalid or unresolved.'
  remote_inspect_current "$app_path" || remote_prepare_abort 'Active release evidence is invalid.'
  [[ "$REMOTE_INSPECT_CURRENT" == "$current_commit" ]] ||
    remote_prepare_abort 'Active release changed after inspection.'
  [[ "$candidate_commit" != "$current_commit" ]] ||
    remote_prepare_abort 'Candidate commit already identifies the active release.'

  now_epoch="$(remote_now_epoch)" || remote_prepare_abort 'Unable to determine preparation time.'
  now_utc="$(remote_epoch_to_utc "$now_epoch")" || remote_prepare_abort 'Unable to format preparation time.'
  if ! remote_remove_expired_candidate "$app_path" "$now_epoch"; then
    remote_prepare_abort 'Another prepared candidate exists or cannot be cleaned safely.'
  fi

  remote_import_or_validate_current_release \
    "$app_path" "$current_archive" "$current_archive_sha" "$current_commit" "$now_utc" ||
    remote_prepare_abort 'Exact rollback release evidence could not be established.'
  [[ -d "$current_dir" && ! -L "$current_dir" ]] || remote_prepare_abort 'Rollback release directory is missing.'

  remote_find_paths retained_releases "$releases_dir" -mindepth 1 -maxdepth 1 -type d ||
    remote_prepare_abort 'Unable to enumerate retained releases.'
  release_count="${#retained_releases[@]}"
  (( release_count <= 2 )) || remote_prepare_abort 'Release retention is already at its safe bound.'
  [[ ! -e "$candidate_dir" && ! -L "$candidate_dir" ]] || remote_prepare_abort 'Candidate release directory already exists.'
  REMOTE_PREPARE_CANDIDATE_DIR="$candidate_dir"
  remote_extract_release_archive "$candidate_archive" "$candidate_archive_sha" "$candidate_dir" ||
    remote_prepare_abort 'Candidate archive validation or extraction failed.'
  remote_write_release_override "$candidate_dir" "$candidate_commit" ||
    remote_prepare_abort 'Candidate Compose override could not be written.'

  remote_validate_production_env_copy "$app_path" "$candidate_dir" ||
    remote_prepare_abort 'Production env requires a separate operator update.'
  remote_classify_migrations "$current_dir/source" "$candidate_dir/source" ||
    remote_prepare_abort 'Migration-sensitive source comparison failed.'
  remote_configure_compose "$app_path" "$candidate_dir" ||
    remote_prepare_abort 'Candidate Compose inputs are incomplete.'
  "${REMOTE_COMPOSE[@]}" config --quiet >/dev/null 2>&1 ||
    remote_prepare_abort 'Candidate Compose config validation failed.'
  help_output="$("${REMOTE_COMPOSE[@]}" up --help 2>/dev/null)" ||
    remote_prepare_abort 'Docker Compose up help is unavailable.'
  for required in --no-build --pull --wait --wait-timeout; do
    grep -Eq -- "(^|[[:space:],])${required}([[:space:],]|$)" <<<"$help_output" ||
      remote_prepare_abort "Docker Compose lacks required activation flag: $required"
  done
  remote_validate_disk_budget \
    "$releases_dir" "$REMOTE_ROLLBACK_BACKEND_ID" "$REMOTE_ROLLBACK_WEB_ID" "$REMOTE_ROLLBACK_TELEGRAM_ID" ||
    remote_prepare_abort 'Available disk space is below the staged-release budget.'

  for service in portal-backend portal-web telegram-bridge; do
    tag="$(remote_release_tag "$service" "$candidate_commit")"
    if remote_image_id "$tag" >/dev/null 2>&1; then
      remote_prepare_abort 'A candidate full-SHA image tag already exists.'
    fi
  done
  "${REMOTE_COMPOSE[@]}" build portal-backend portal-web telegram-bridge >/dev/null 2>&1 ||
    remote_prepare_abort 'Candidate portal image build failed.'
  for service in portal-backend portal-web telegram-bridge; do
    tag="$(remote_release_tag "$service" "$candidate_commit")"
    image_id="$(remote_image_id "$tag")" || remote_prepare_abort 'A built candidate image ID is unavailable.'
    REMOTE_PREPARE_CREATED_TAGS+=("$tag=$image_id")
    case "$service" in
      portal-backend) candidate_backend_id="$image_id" ;;
      portal-web) candidate_web_id="$image_id" ;;
      telegram-bridge) candidate_telegram_id="$image_id" ;;
    esac
  done

  [[ "$(remote_image_id "$(remote_release_tag portal-backend "$current_commit")")" == "$REMOTE_ROLLBACK_BACKEND_ID" ]] ||
    remote_prepare_abort 'Rollback backend tag changed during candidate build.'
  [[ "$(remote_image_id "$(remote_release_tag portal-web "$current_commit")")" == "$REMOTE_ROLLBACK_WEB_ID" ]] ||
    remote_prepare_abort 'Rollback web tag changed during candidate build.'
  [[ "$(remote_image_id "$(remote_release_tag telegram-bridge "$current_commit")")" == "$REMOTE_ROLLBACK_TELEGRAM_ID" ]] ||
    remote_prepare_abort 'Rollback Telegram tag changed during candidate build.'

  images_output="$("${REMOTE_COMPOSE[@]}" config --images 2>/dev/null)" ||
    remote_prepare_abort 'Candidate Compose image list is unavailable.'
  remote_resolve_external_images "$candidate_commit" "$images_output" ||
    remote_prepare_abort 'External image references are invalid or unavailable.'

  raw_tenants="$(mktemp /tmp/chatwoot-client-portal-v2-tenants.XXXXXX)" ||
    remote_prepare_abort 'Unable to create tenant matrix temporary file.'
  chmod 0600 "$raw_tenants"
  if ! remote_query_tenant_matrix "$candidate_dir/tenants.tsv" "$raw_tenants"; then
    rm -f -- "$raw_tenants"
    remote_prepare_abort 'Active tenant smoke matrix is invalid or outside the 1..100 bound.'
  fi
  rm -f -- "$raw_tenants"

  real_env_sha_after="$(sha256sum "$app_path/.env.production" | awk '{print $1}')" ||
    remote_prepare_abort 'Production env could not be re-hashed.'
  [[ "$real_env_sha_after" == "$REMOTE_PRODUCTION_ENV_SHA" ]] ||
    remote_prepare_abort 'Production env changed during preparation.'
  remote_inspect_current "$app_path" || remote_prepare_abort 'Active release evidence disappeared during preparation.'
  [[ "$REMOTE_INSPECT_CURRENT" == "$current_commit" ]] ||
    remote_prepare_abort 'Active release changed during preparation.'
  remote_revalidate_all_images \
    "$candidate_commit" "$current_commit" \
    "$candidate_backend_id" "$candidate_web_id" "$candidate_telegram_id" ||
    remote_prepare_abort 'Prepared image identity changed before manifest publication.'

  expires_epoch="$("$REMOTE_PYTHON_BIN" - "$now_epoch" <<'PY'
import sys
print(int(sys.argv[1]) + 86400)
PY
)" || remote_prepare_abort 'Unable to calculate candidate expiry.'
  expires_utc="$(remote_epoch_to_utc "$expires_epoch")" || remote_prepare_abort 'Unable to format candidate expiry.'
  remote_manifest_write_prepared \
    "$candidate_dir/manifest.txt" "$orchestrator_commit" "$candidate_commit" "$candidate_archive_sha" \
    "$current_commit" "$now_epoch" "$now_utc" "$expires_epoch" "$expires_utc" \
    "$candidate_backend_id" "$candidate_web_id" "$candidate_telegram_id" ||
    remote_prepare_abort 'Immutable prepared manifest publication failed.'
  remote_pointer_write create "$state_dir/prepared" "$candidate_commit" ||
    remote_prepare_abort 'Prepared pointer publication failed.'
  REMOTE_PREPARE_PUBLISHED='true'

  printf 'Prepared candidate: %s\n' "$candidate_commit"
  printf 'Observed current release: %s\n' "$current_commit"
  printf 'Migration classification: %s\n' "$REMOTE_MIGRATION_CLASSIFICATION"
  printf 'Prepared candidate expires: %s\n' "$expires_utc"
  printf 'Candidate portal image IDs: %s %s %s\n' \
    "$candidate_backend_id" "$candidate_web_id" "$candidate_telegram_id"
  remote_emit_status prepared
}

remote_run_prepare_with_lock() {
  local app_path="$1"
  shift
  local state_dir="$app_path/.release-state"
  local lock_path="$state_dir/deploy.lock"
  local lock_exit

  REMOTE_FAILURE_STATUS='prepare_failed'
  remote_prepare_initialize_layout "$app_path" ||
    remote_fail 'Application root or production env is unsafe.' prepare_failed
  remote_lock_file_is_safe "$lock_path" || remote_fail 'Release lock file is unsafe.' prepare_failed

  set +e
  flock --nonblock --close --conflict-exit-code 75 "$lock_path" \
    "$SELF_PATH" __locked-prepare \
    "--app-path=$REMOTE_APP_PATH" \
    "$@"
  lock_exit=$?
  set -e
  if (( lock_exit == 75 )); then
    remote_fail 'Another staged release operation is already running.' prepare_failed
  fi
  return "$lock_exit"
}

remote_validate_release_source_snapshot() {
  local release_dir="$1"
  local expected_checksum="$2"
  local archive="$release_dir/source.tar.gz"
  local source_dir="$release_dir/source"
  local actual_checksum

  [[ -f "$archive" && ! -L "$archive" && -d "$source_dir" && ! -L "$source_dir" ]] || return 1
  actual_checksum="$(sha256sum "$archive" | awk '{print $1}')" || return 1
  [[ "$actual_checksum" == "$expected_checksum" ]] || return 1
  remote_validate_archive "$archive" || return 1
  "$REMOTE_PYTHON_BIN" - "$archive" "$source_dir" <<'PY'
import hashlib
import os
import pathlib
import stat
import sys
import tarfile

archive_path, source_path = sys.argv[1:]
source_root = pathlib.Path(source_path)

def digest_stream(stream):
    digest = hashlib.sha256()
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            return digest.hexdigest()
        digest.update(chunk)

expected = {}
with tarfile.open(archive_path, "r:gz") as archive:
    for member in archive.getmembers():
        relative = pathlib.PurePosixPath(member.name)
        if member.isdir():
            expected[str(relative)] = ("dir", None)
        elif member.isfile():
            body = archive.extractfile(member)
            if body is None:
                raise SystemExit(1)
            digest = digest_stream(body)
            expected[str(relative)] = ("file", bool(member.mode & 0o111), digest)
        else:
            raise SystemExit(1)

actual = {}
for root, directories, files in os.walk(source_root, followlinks=False):
    root_path = pathlib.Path(root)
    for name in directories:
        path = root_path / name
        if path.is_symlink():
            raise SystemExit(1)
        relative = path.relative_to(source_root).as_posix()
        actual[relative] = ("dir", None)
    for name in files:
        path = root_path / name
        if path.is_symlink() or not path.is_file():
            raise SystemExit(1)
        relative = path.relative_to(source_root).as_posix()
        with path.open("rb") as body:
            digest = digest_stream(body)
        actual[relative] = ("file", bool(stat.S_IMODE(path.stat().st_mode) & 0o111), digest)

if expected != actual:
    raise SystemExit(1)
PY
}

remote_activation_refuse() {
  local message="$1"
  local status="${2:-activation_refused_state_changed}"

  remote_fail "$message" "$status"
}

remote_validate_activation_decision() {
  local path="$1"
  local expected_candidate="$2"
  local expected_policy="$3"
  local expected_approval="$4"
  local protocol kind candidate policy approval recorded_at

  release_record_validate_keys "$path" \
    protocol_version record_kind candidate_commit migration_policy approval_ref recorded_at_utc || return 1
  protocol="$(release_record_get_unique "$path" protocol_version)" || return 1
  kind="$(release_record_get_unique "$path" record_kind)" || return 1
  candidate="$(release_record_get_unique "$path" candidate_commit)" || return 1
  policy="$(release_record_get_unique "$path" migration_policy)" || return 1
  approval="$(release_record_get_unique "$path" approval_ref)" || return 1
  recorded_at="$(release_record_get_unique "$path" recorded_at_utc)" || return 1
  [[ "$protocol" == "$REMOTE_PROTOCOL_VERSION" && "$kind" == 'activation_decision' &&
    "$candidate" == "$expected_candidate" && "$policy" == "$expected_policy" &&
    "$approval" == "$expected_approval" ]] || return 1
  [[ "$policy" == 'backward-compatible' || "$policy" == 'forward-only' ]] || return 1
  release_record_is_sha "$candidate" && release_record_is_approval_ref "$approval" &&
    release_record_is_timestamp "$recorded_at"
}

remote_fsync_activation_decision() {
  local path="$1"
  local fail_fsync="${STAGED_TEST_FAIL_DECISION_FSYNC:-false}"

  [[ "$fail_fsync" == 'false' || "$fail_fsync" == 'true' ]] || return 1
  if [[ "$fail_fsync" == 'true' ]]; then
    remote_is_test_mode || return 1
    return 1
  fi
  remote_fsync_path_and_parent "$path"
}

remote_ensure_activation_decision() {
  local state_dir="$1"
  local candidate="$2"
  local policy="$3"
  local approval="$4"
  local path="$state_dir/decisions/$candidate.txt"
  local epoch recorded_at

  REMOTE_ACTIVATION_DECISION_PATH="$path"
  if [[ -e "$path" || -L "$path" ]]; then
    remote_validate_activation_decision "$path" "$candidate" "$policy" "$approval" || return 1
    remote_fsync_activation_decision "$path" || return 1
    remote_record_test_event decision_reuse "$policy"
    return
  fi
  epoch="$(remote_now_epoch)" || return 1
  recorded_at="$(remote_epoch_to_utc "$epoch")" || return 1
  printf '%s\n' \
    "protocol_version=$REMOTE_PROTOCOL_VERSION" \
    'record_kind=activation_decision' \
    "candidate_commit=$candidate" \
    "migration_policy=$policy" \
    "approval_ref=$approval" \
    "recorded_at_utc=$recorded_at" |
    release_record_write_atomic create "$path" || return 1
  remote_validate_activation_decision "$path" "$candidate" "$policy" "$approval" || return 1
  remote_fsync_activation_decision "$path" || return 1
  remote_record_test_event decision_write "$policy"
}

remote_activation_preflight() {
  local app_path="$1"
  local candidate_commit="$2"
  local prepared_orchestrator="$3"
  local current_orchestrator="$4"
  local orchestrator_protocol="$5"
  local migration_policy="$6"
  local approval_ref="$7"
  local state_dir="$app_path/.release-state"
  local candidate_dir="$app_path/.releases/$candidate_commit"
  local manifest="$candidate_dir/manifest.txt"
  local prepared_pointer manifest_orchestrator manifest_protocol expires_epoch now_epoch
  local observed_current rollback_dir marker_archive_sha actual_env_sha raw_tenants recomputed_tenants
  local manifest_tag manifest_id actual_id service key_prefix external_count index key_index
  local expected_rollback_id migration_classification images_output

  remote_block_on_critical_state "$app_path" activate ||
    remote_activation_refuse 'Critical deployment evidence is invalid.'
  remote_validate_state_layout "$app_path" ||
    remote_activation_refuse 'Release state is incomplete or an earlier transaction is unresolved.'
  prepared_pointer="$(remote_pointer_read "$state_dir/prepared")" ||
    remote_activation_refuse 'Prepared release pointer is missing or invalid.'
  [[ "$prepared_pointer" == "$candidate_commit" ]] ||
    remote_activation_refuse 'Requested candidate is not the prepared release.'
  remote_validate_prepared_manifest "$manifest" "$candidate_commit" ||
    remote_activation_refuse 'Prepared release manifest is invalid.'

  manifest_orchestrator="$(release_record_get_unique "$manifest" orchestrator_commit)" ||
    remote_activation_refuse 'Prepared orchestrator evidence is missing.'
  manifest_protocol="$(release_record_get_unique "$manifest" orchestrator_protocol_version)" ||
    remote_activation_refuse 'Prepared protocol evidence is missing.'
  [[ "$manifest_orchestrator" == "$prepared_orchestrator" ]] ||
    remote_activation_refuse 'Prepared orchestrator evidence changed after inspection.'
  [[ "$manifest_protocol" == "$REMOTE_PROTOCOL_VERSION" &&
    "$orchestrator_protocol" == "$REMOTE_PROTOCOL_VERSION" ]] ||
    remote_activation_refuse 'Prepared and current orchestrator protocols are incompatible.'
  release_record_is_sha "$current_orchestrator" ||
    remote_activation_refuse 'Current orchestrator identity is invalid.'

  now_epoch="$(remote_now_epoch)" || remote_activation_refuse 'Unable to determine activation time.'
  expires_epoch="$(release_record_get_unique "$manifest" expires_at_epoch)" ||
    remote_activation_refuse 'Prepared expiry evidence is missing.'
  [[ "$expires_epoch" =~ ^[0-9]+$ ]] || remote_activation_refuse 'Prepared expiry evidence is invalid.'
  (( now_epoch < expires_epoch )) ||
    remote_activation_refuse 'Prepared release has expired.' activation_refused_expired

  observed_current="$(release_record_get_unique "$manifest" observed_current_commit)" ||
    remote_activation_refuse 'Observed current release evidence is missing.'
  remote_inspect_current "$app_path" || remote_activation_refuse 'Active release evidence is invalid.'
  [[ "$REMOTE_INSPECT_CURRENT" == "$observed_current" ]] ||
    remote_activation_refuse 'Active release changed after preparation.'
  REMOTE_ACTIVATION_PREVIOUS_COMMIT="$observed_current"
  rollback_dir="$app_path/.releases/$observed_current"
  remote_load_release_evidence "$rollback_dir" "$observed_current" ||
    remote_activation_refuse 'Rollback release evidence is invalid.'

  REMOTE_ACTIVATION_CANDIDATE_COMMIT="$candidate_commit"
  REMOTE_ACTIVATION_CANDIDATE_ARCHIVE_SHA="$(release_record_get_unique "$manifest" candidate_archive_sha256)" ||
    remote_activation_refuse 'Candidate archive evidence is missing.'
  REMOTE_ACTIVATION_PREVIOUS_ARCHIVE_SHA="$(release_record_get_unique "$manifest" rollback_archive_sha256)" ||
    remote_activation_refuse 'Rollback archive evidence is missing.'
  [[ "$REMOTE_ROLLBACK_ARCHIVE_SHA" == "$REMOTE_ACTIVATION_PREVIOUS_ARCHIVE_SHA" ]] ||
    remote_activation_refuse 'Rollback archive evidence changed.'
  if [[ "$REMOTE_INSPECT_STAGED" == 'true' ]]; then
    marker_archive_sha="$REMOTE_INSPECT_ARCHIVE_SHA"
    [[ "$marker_archive_sha" == "$REMOTE_ACTIVATION_PREVIOUS_ARCHIVE_SHA" ]] ||
      remote_activation_refuse 'Active source marker checksum disagrees with rollback evidence.'
  else
    [[ ! -e "$state_dir/current" && -f "$state_dir/adoption" ]] ||
      remote_activation_refuse 'First activation adoption pointers are incomplete.'
    [[ "$(remote_pointer_read "$state_dir/adoption")" == "$observed_current" ]] ||
      remote_activation_refuse 'First activation adoption pointer changed.'
    [[ "$(release_marker_read_active_commit "$app_path/DEPLOY_SOURCE.txt" true)" == "$observed_current" ]] ||
      remote_activation_refuse 'First activation legacy marker changed.'
  fi

  remote_validate_release_source_snapshot "$candidate_dir" "$REMOTE_ACTIVATION_CANDIDATE_ARCHIVE_SHA" ||
    remote_activation_refuse 'Candidate source no longer matches its exact archive.'
  remote_validate_release_source_snapshot "$rollback_dir" "$REMOTE_ACTIVATION_PREVIOUS_ARCHIVE_SHA" ||
    remote_activation_refuse 'Rollback source no longer matches its exact archive.'

  REMOTE_ACTIVATION_ENV_SHA="$(release_record_get_unique "$manifest" production_env_sha256)" ||
    remote_activation_refuse 'Production env evidence is missing.'
  release_record_require_private_file "$app_path/.env.production" ||
    remote_activation_refuse 'Production env permissions or ownership changed after preparation.'
  actual_env_sha="$(sha256sum "$app_path/.env.production" | awk '{print $1}')" ||
    remote_activation_refuse 'Production env cannot be re-hashed.'
  [[ "$actual_env_sha" == "$REMOTE_ACTIVATION_ENV_SHA" ]] ||
    remote_activation_refuse 'Production env changed after preparation.'

  remote_configure_compose "$app_path" "$candidate_dir" ||
    remote_activation_refuse 'Candidate Compose inputs are incomplete.'
  remote_validate_release_override "$candidate_dir" "$candidate_commit" ||
    remote_activation_refuse 'Candidate Compose override changed after preparation.'
  "${REMOTE_COMPOSE[@]}" config --quiet >/dev/null 2>&1 ||
    remote_activation_refuse 'Candidate Compose config is no longer valid.'
  images_output="$("${REMOTE_COMPOSE[@]}" config --images 2>/dev/null)" ||
    remote_activation_refuse 'Candidate Compose image list is unavailable.'
  remote_validate_compose_images "$manifest" "$images_output" ||
    remote_activation_refuse 'Candidate Compose image set changed after preparation.'

  REMOTE_ACTIVATION_CANDIDATE_IDS=()
  REMOTE_ACTIVATION_PREVIOUS_IDS=()
  for service in backend web telegram; do
    case "$service" in
      backend) key_prefix='backend'; expected_rollback_id="$REMOTE_ROLLBACK_BACKEND_ID" ;;
      web) key_prefix='web'; expected_rollback_id="$REMOTE_ROLLBACK_WEB_ID" ;;
      telegram) key_prefix='telegram'; expected_rollback_id="$REMOTE_ROLLBACK_TELEGRAM_ID" ;;
    esac
    manifest_tag="$(release_record_get_unique "$manifest" "${key_prefix}_image_tag")" ||
      remote_activation_refuse 'Candidate image tag evidence is missing.'
    manifest_id="$(release_record_get_unique "$manifest" "${key_prefix}_image_id")" ||
      remote_activation_refuse 'Candidate image ID evidence is missing.'
    actual_id="$(remote_image_id "$manifest_tag")" ||
      remote_activation_refuse 'Candidate image tag is unavailable.'
    [[ "$actual_id" == "$manifest_id" ]] || remote_activation_refuse 'Candidate image identity changed.'
    REMOTE_ACTIVATION_CANDIDATE_IDS+=("$manifest_id")

    manifest_tag="$(release_record_get_unique "$manifest" "rollback_${key_prefix}_image_tag")" ||
      remote_activation_refuse 'Rollback image tag evidence is missing.'
    manifest_id="$(release_record_get_unique "$manifest" "rollback_${key_prefix}_image_id")" ||
      remote_activation_refuse 'Rollback image ID evidence is missing.'
    actual_id="$(remote_image_id "$manifest_tag")" ||
      remote_activation_refuse 'Rollback image tag is unavailable.'
    [[ "$actual_id" == "$manifest_id" && "$manifest_id" == "$expected_rollback_id" ]] ||
      remote_activation_refuse 'Rollback image identity changed.'
    REMOTE_ACTIVATION_PREVIOUS_IDS+=("$manifest_id")
  done

  REMOTE_EXTERNAL_REFS=()
  REMOTE_EXTERNAL_IDS=()
  external_count="$(release_record_get_unique "$manifest" external_image_count)" ||
    remote_activation_refuse 'External image count is missing.'
  for (( index = 1; index <= external_count; index++ )); do
    printf -v key_index '%03d' "$index"
    manifest_tag="$(release_record_get_unique "$manifest" "external_image_${key_index}_ref")" ||
      remote_activation_refuse 'External image reference is missing.'
    manifest_id="$(release_record_get_unique "$manifest" "external_image_${key_index}_id")" ||
      remote_activation_refuse 'External image ID is missing.'
    actual_id="$(remote_image_id "$manifest_tag")" ||
      remote_activation_refuse 'External image is unavailable.'
    [[ "$actual_id" == "$manifest_id" ]] || remote_activation_refuse 'External image identity changed.'
    REMOTE_EXTERNAL_REFS+=("$manifest_tag")
    REMOTE_EXTERNAL_IDS+=("$manifest_id")
  done

  raw_tenants="$(mktemp /tmp/chatwoot-client-portal-v2-activate-tenants.XXXXXX)" ||
    remote_activation_refuse 'Unable to create tenant verification input.'
  REMOTE_ACTIVATION_RAW_TENANTS="$raw_tenants"
  recomputed_tenants="$(mktemp /tmp/chatwoot-client-portal-v2-activate-matrix.XXXXXX)" || {
    rm -f -- "$raw_tenants"
    REMOTE_ACTIVATION_RAW_TENANTS=''
    remote_activation_refuse 'Unable to create tenant verification matrix.'
  }
  REMOTE_ACTIVATION_RECOMPUTED_TENANTS="$recomputed_tenants"
  chmod 0600 "$raw_tenants" "$recomputed_tenants"
  if ! remote_query_tenant_matrix "$recomputed_tenants" "$raw_tenants"; then
    rm -f -- "$raw_tenants" "$recomputed_tenants"
    REMOTE_ACTIVATION_RAW_TENANTS=''
    REMOTE_ACTIVATION_RECOMPUTED_TENANTS=''
    remote_activation_refuse 'Active tenant matrix is invalid or outside the 1..100 bound.'
  fi
  rm -f -- "$raw_tenants"
  REMOTE_ACTIVATION_RAW_TENANTS=''
  REMOTE_ACTIVATION_TENANT_COUNT="$(release_record_get_unique "$manifest" tenant_count)" || {
    rm -f -- "$recomputed_tenants"
    REMOTE_ACTIVATION_RECOMPUTED_TENANTS=''
    remote_activation_refuse 'Prepared tenant count is missing.'
  }
  REMOTE_ACTIVATION_TENANT_SHA="$(release_record_get_unique "$manifest" tenant_matrix_sha256)" || {
    rm -f -- "$recomputed_tenants"
    REMOTE_ACTIVATION_RECOMPUTED_TENANTS=''
    remote_activation_refuse 'Prepared tenant checksum is missing.'
  }
  if [[ "$REMOTE_TENANT_COUNT" != "$REMOTE_ACTIVATION_TENANT_COUNT" ||
    "$REMOTE_TENANT_MATRIX_SHA" != "$REMOTE_ACTIVATION_TENANT_SHA" ]] ||
    ! cmp -s -- "$candidate_dir/tenants.tsv" "$recomputed_tenants"; then
    rm -f -- "$recomputed_tenants"
    REMOTE_ACTIVATION_RECOMPUTED_TENANTS=''
    remote_activation_refuse 'Active tenant matrix changed after preparation.'
  fi
  rm -f -- "$recomputed_tenants"
  REMOTE_ACTIVATION_RECOMPUTED_TENANTS=''

  migration_classification="$(release_record_get_unique "$manifest" migration_classification)" ||
    remote_activation_refuse 'Migration classification is missing.'
  REMOTE_ACTIVATION_MIGRATION="$migration_classification"
  REMOTE_ACTIVATION_POLICY='automatic'
  REMOTE_ACTIVATION_APPROVAL_REF=''
  REMOTE_ACTIVATION_DECISION_PATH=''
  case "$migration_classification" in
    none)
      [[ -z "$migration_policy" && -z "$approval_ref" ]] ||
        remote_activation_refuse 'Nonmigration activation forbids migration decision fields.' \
          activation_refused_migration_policy
      ;;
    migration)
      [[ "$migration_policy" == 'backward-compatible' || "$migration_policy" == 'forward-only' ]] ||
        remote_activation_refuse 'Migration activation requires an explicit policy.' \
          activation_refused_migration_policy
      release_record_is_approval_ref "$approval_ref" ||
        remote_activation_refuse 'Migration activation requires a valid approval reference.' \
          activation_refused_migration_policy
      remote_ensure_activation_decision "$state_dir" "$candidate_commit" "$migration_policy" "$approval_ref" ||
        remote_activation_refuse 'Activation decision conflicts with immutable evidence.' \
          activation_refused_migration_policy
      REMOTE_ACTIVATION_POLICY="$migration_policy"
      REMOTE_ACTIVATION_APPROVAL_REF="$approval_ref"
      ;;
    *)
      remote_activation_refuse 'Migration classification is invalid.'
      ;;
  esac
}

remote_revalidate_activation_cutover_inputs() {
  local app_path="$1"
  local candidate_commit="$2"
  local candidate_dir="$app_path/.releases/$candidate_commit"
  local actual_env_sha actual_tenant_sha images_output

  (( ${#REMOTE_ACTIVATION_CANDIDATE_IDS[@]} == 3 )) || return 1
  release_record_require_private_file "$app_path/.env.production" || return 1
  actual_env_sha="$(sha256sum "$app_path/.env.production" | awk '{print $1}')" || return 1
  [[ "$actual_env_sha" == "$REMOTE_ACTIVATION_ENV_SHA" ]] || return 1
  remote_validate_release_source_snapshot "$candidate_dir" "$REMOTE_ACTIVATION_CANDIDATE_ARCHIVE_SHA" || return 1
  release_record_require_private_file "$candidate_dir/tenants.tsv" || return 1
  actual_tenant_sha="$(sha256sum "$candidate_dir/tenants.tsv" | awk '{print $1}')" || return 1
  [[ "$actual_tenant_sha" == "$REMOTE_ACTIVATION_TENANT_SHA" ]] || return 1
  remote_validate_release_override "$candidate_dir" "$candidate_commit" || return 1
  "${REMOTE_COMPOSE[@]}" config --quiet >/dev/null 2>&1 || return 1
  images_output="$("${REMOTE_COMPOSE[@]}" config --images 2>/dev/null)" || return 1
  remote_validate_compose_images "$candidate_dir/manifest.txt" "$images_output" || return 1
  remote_revalidate_all_images \
    "$candidate_commit" "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" \
    "${REMOTE_ACTIVATION_CANDIDATE_IDS[0]}" \
    "${REMOTE_ACTIVATION_CANDIDATE_IDS[1]}" \
    "${REMOTE_ACTIVATION_CANDIDATE_IDS[2]}"
}

remote_validate_transaction() {
  local path="$1"
  local expected_candidate="$2"
  local expected_previous="$3"
  local expected_policy="$4"
  local protocol kind candidate previous policy phase started updated

  release_record_validate_keys "$path" \
    protocol_version record_kind candidate_commit previous_commit migration_policy \
    phase started_at_utc updated_at_utc || return 1
  protocol="$(release_record_get_unique "$path" protocol_version)" || return 1
  kind="$(release_record_get_unique "$path" record_kind)" || return 1
  candidate="$(release_record_get_unique "$path" candidate_commit)" || return 1
  previous="$(release_record_get_unique "$path" previous_commit)" || return 1
  policy="$(release_record_get_unique "$path" migration_policy)" || return 1
  phase="$(release_record_get_unique "$path" phase)" || return 1
  started="$(release_record_get_unique "$path" started_at_utc)" || return 1
  updated="$(release_record_get_unique "$path" updated_at_utc)" || return 1
  [[ "$protocol" == "$REMOTE_PROTOCOL_VERSION" && "$kind" == 'activation_transaction' &&
    "$candidate" == "$expected_candidate" && "$previous" == "$expected_previous" &&
    "$policy" == "$expected_policy" ]] || return 1
  case "$policy" in automatic|backward-compatible|forward-only) ;; *) return 1 ;; esac
  case "$phase" in
    cutover_started|candidate_healthy|root_sync_started|root_sync_completed|markers_published|\
      rollback_recovered|rollback_cleanup_started|candidate_tags_removed|\
      candidate_artifact_removal_started|candidate_artifacts_removed|prepared_removed) ;;
    *) return 1 ;;
  esac
  release_record_is_timestamp "$started" && release_record_is_timestamp "$updated"
}

remote_write_transaction() {
  local mode="$1"
  local path="$2"
  local candidate="$3"
  local previous="$4"
  local policy="$5"
  local phase="$6"
  local started_at="$7"
  local updated_at="$8"

  case "$policy" in automatic|backward-compatible|forward-only) ;; *) return 2 ;; esac

  printf '%s\n' \
    "protocol_version=$REMOTE_PROTOCOL_VERSION" \
    'record_kind=activation_transaction' \
    "candidate_commit=$candidate" \
    "previous_commit=$previous" \
    "migration_policy=$policy" \
    "phase=$phase" \
    "started_at_utc=$started_at" \
    "updated_at_utc=$updated_at" |
    release_record_write_atomic "$mode" "$path" || return 1
  remote_validate_transaction "$path" "$candidate" "$previous" "$policy" || return 1
  remote_fsync_path_and_parent "$path" || return 1
  remote_record_test_event journal_write "$phase"
}

remote_update_transaction() {
  local path="$1"
  local candidate="$2"
  local previous="$3"
  local expected_policy="$4"
  local phase="$5"
  local current_phase started_at updated_epoch updated_at

  remote_validate_transaction "$path" "$candidate" "$previous" "$expected_policy" || return 1
  current_phase="$(release_record_get_unique "$path" phase)" || return 1
  case "$current_phase:$phase" in
    cutover_started:candidate_healthy|\
      candidate_healthy:root_sync_started|\
      root_sync_started:root_sync_completed|\
      root_sync_completed:markers_published|\
      cutover_started:rollback_recovered|\
      candidate_healthy:rollback_recovered|\
      root_sync_started:rollback_recovered|\
      root_sync_completed:rollback_recovered|\
      markers_published:rollback_recovered|\
      rollback_recovered:rollback_cleanup_started|\
      rollback_cleanup_started:candidate_tags_removed|\
      candidate_tags_removed:candidate_artifact_removal_started|\
      candidate_artifact_removal_started:candidate_artifacts_removed|\
      candidate_artifacts_removed:prepared_removed) ;;
    *) return 1 ;;
  esac
  started_at="$(release_record_get_unique "$path" started_at_utc)" || return 1
  updated_epoch="$(remote_now_epoch)" || return 1
  updated_at="$(remote_epoch_to_utc "$updated_epoch")" || return 1
  remote_write_transaction replace "$path" "$candidate" "$previous" \
    "$expected_policy" "$phase" "$started_at" "$updated_at"
}

remote_resolve_single_service_container() {
  local service="$1"
  local include_stopped="${2:-false}"
  local output line
  local -a container_ids=()
  local -a compose_ps=("${REMOTE_COMPOSE[@]}" ps)

  case "$include_stopped" in
    false) ;;
    true) compose_ps+=(--all) ;;
    *) return 1 ;;
  esac
  compose_ps+=(-q "$service")
  output="$("${compose_ps[@]}" 2>/dev/null)" || return 1
  while IFS= read -r line; do
    [[ -n "$line" ]] && container_ids+=("$line")
  done <<<"$output"
  (( ${#container_ids[@]} == 1 )) || return 1
  [[ "${container_ids[0]}" =~ ^[A-Za-z0-9][A-Za-z0-9_.:-]*$ ]] || return 1
  REMOTE_RESOLVED_CONTAINER_ID="${container_ids[0]}"
}

remote_capture_candidate_services() {
  local service index container_id details image running health restarts started

  REMOTE_ACTIVATION_CONTAINER_IDS=()
  REMOTE_ACTIVATION_CONTAINER_IMAGES=()
  REMOTE_ACTIVATION_CONTAINER_RESTARTS=()
  REMOTE_ACTIVATION_CONTAINER_STARTED=()
  index=0
  for service in portal-backend portal-web telegram-bridge; do
    remote_resolve_single_service_container "$service" || return 1
    container_id="$REMOTE_RESOLVED_CONTAINER_ID"
    details="$("${REMOTE_DOCKER[@]}" inspect --format \
      '{{.Image}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.StartedAt}}' \
      "$container_id" 2>/dev/null)" || return 1
    IFS='|' read -r image running health restarts started <<<"$details"
    [[ "$image" == "${REMOTE_ACTIVATION_CANDIDATE_IDS[$index]}" && "$running" == 'true' ]] || return 1
    [[ "$health" == 'healthy' || "$health" == 'none' ]] || return 1
    [[ "$restarts" =~ ^[0-9]+$ && "$restarts" == '0' ]] || return 1
    [[ "$started" =~ ^[0-9][0-9T:._+-]*Z$ ]] || return 1
    REMOTE_ACTIVATION_CONTAINER_IDS+=("$container_id")
    REMOTE_ACTIVATION_CONTAINER_IMAGES+=("$image")
    REMOTE_ACTIVATION_CONTAINER_RESTARTS+=("$restarts")
    REMOTE_ACTIVATION_CONTAINER_STARTED+=("$started")
    index=$((index + 1))
  done
}

remote_recheck_candidate_services() {
  local index service container_id details image running health restarts started

  (( ${#REMOTE_ACTIVATION_CONTAINER_IDS[@]} == 3 )) || return 1
  for index in 0 1 2; do
    case "$index" in
      0) service='portal-backend' ;;
      1) service='portal-web' ;;
      2) service='telegram-bridge' ;;
    esac
    container_id="${REMOTE_ACTIVATION_CONTAINER_IDS[$index]}"
    remote_resolve_single_service_container "$service" || return 1
    [[ "$REMOTE_RESOLVED_CONTAINER_ID" == "$container_id" ]] || return 1
    details="$("${REMOTE_DOCKER[@]}" inspect --format \
      '{{.Image}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.StartedAt}}' \
      "$container_id" 2>/dev/null)" || return 1
    IFS='|' read -r image running health restarts started <<<"$details"
    [[ "$image" == "${REMOTE_ACTIVATION_CONTAINER_IMAGES[$index]}" && "$running" == 'true' ]] || return 1
    [[ "$health" == 'healthy' || "$health" == 'none' ]] || return 1
    [[ "$restarts" == "${REMOTE_ACTIVATION_CONTAINER_RESTARTS[$index]}" ]] || return 1
    [[ "$started" == "${REMOTE_ACTIVATION_CONTAINER_STARTED[$index]}" ]] || return 1
  done
}

remote_write_smoke_result() {
  local result_dir="$1"
  local slug="$2"
  local status="$3"
  local path="$result_dir/result.$slug"

  [[ "$status" == 'pass' || "$status" == 'fail' ]] || return 1
  [[ ! -e "$path" && ! -L "$path" ]] || return 1
  umask 077
  printf '%s\t%s\n' "$slug" "$status" >"$path"
  chmod 0600 "$path"
}

remote_smoke_one() {
  local expected_slug="$1"
  local origin="$2"
  local result_dir="$3"
  local base_origin health_size tenant_size

  [[ "$expected_slug" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || return 2
  [[ "$origin" != *$'\n'* && "$origin" != *$'\r'* && "$origin" != *$'\t'* ]] || return 2
  [[ "$result_dir" == /tmp/chatwoot-client-portal-v2-smoke.* ]] || return 2
  remote_require_private_directory "$result_dir" || return 2
  REMOTE_PYTHON_BIN="$(remote_select_python)" || return 2
  REMOTE_CURL_BIN="$(remote_select_command STAGED_CURL_BIN curl)" || return 2
  if remote_is_test_mode; then
    REMOTE_EVENT_RECORDER="${STAGED_TEST_EVENT_RECORDER:-}"
    [[ -n "$REMOTE_EVENT_RECORDER" && "$REMOTE_EVENT_RECORDER" == /tmp/* &&
      -f "$REMOTE_EVENT_RECORDER" && ! -L "$REMOTE_EVENT_RECORDER" && -x "$REMOTE_EVENT_RECORDER" ]] || return 2
  else
    [[ -z "${STAGED_TEST_EVENT_RECORDER:-}" && -z "${STAGED_TEST_EVENT_LOG:-}" ]] || return 2
  fi
  "$REMOTE_PYTHON_BIN" - "$origin" <<'PY' || return 2
import sys
import urllib.parse

value = sys.argv[1]
if len(value.encode("utf-8")) > 2048:
    raise SystemExit(1)
parsed = urllib.parse.urlsplit(value)
if (
    parsed.scheme != "https"
    or not parsed.hostname
    or parsed.username is not None
    or parsed.password is not None
    or parsed.path not in {"", "/"}
    or parsed.query
    or parsed.fragment
):
    raise SystemExit(1)
try:
    port = parsed.port
except ValueError:
    raise SystemExit(1)
if port is not None and not (1 <= port <= 65535):
    raise SystemExit(1)
PY
  base_origin="${origin%/}"

  REMOTE_SMOKE_HEALTH_BODY="$(mktemp "$result_dir/.health.$expected_slug.XXXXXX")" || return 1
  REMOTE_SMOKE_TENANT_BODY="$(mktemp "$result_dir/.tenant.$expected_slug.XXXXXX")" || {
    remote_cleanup_smoke_bodies
    return 1
  }
  chmod 0600 "$REMOTE_SMOKE_HEALTH_BODY" "$REMOTE_SMOKE_TENANT_BODY" || {
    remote_cleanup_smoke_bodies
    return 1
  }

  if ! ( ulimit -f 64 && "$REMOTE_CURL_BIN" --fail --silent --show-error \
    --connect-timeout 5 --max-time 15 --retry 2 --retry-delay 3 --retry-all-errors \
    --max-filesize 65536 \
    --output "$REMOTE_SMOKE_HEALTH_BODY" "$base_origin/api/health" >/dev/null ); then
    remote_cleanup_smoke_bodies
    remote_write_smoke_result "$result_dir" "$expected_slug" fail || true
    return 1
  fi
  health_size="$(stat -c '%s' -- "$REMOTE_SMOKE_HEALTH_BODY")" || health_size='invalid'
  [[ "$health_size" =~ ^[0-9]+$ ]] && (( health_size <= 65536 )) || {
    remote_cleanup_smoke_bodies
    remote_write_smoke_result "$result_dir" "$expected_slug" fail || true
    return 1
  }
  if ! ( ulimit -f 64 && "$REMOTE_CURL_BIN" --fail --silent --show-error \
    --connect-timeout 5 --max-time 15 --retry 2 --retry-delay 3 --retry-all-errors \
    --max-filesize 65536 \
    --output "$REMOTE_SMOKE_TENANT_BODY" "$base_origin/api/tenant" >/dev/null ); then
    remote_cleanup_smoke_bodies
    remote_write_smoke_result "$result_dir" "$expected_slug" fail || true
    return 1
  fi
  tenant_size="$(stat -c '%s' -- "$REMOTE_SMOKE_TENANT_BODY")" || tenant_size='invalid'
  [[ "$tenant_size" =~ ^[0-9]+$ ]] && (( tenant_size <= 65536 )) || {
    remote_cleanup_smoke_bodies
    remote_write_smoke_result "$result_dir" "$expected_slug" fail || true
    return 1
  }
  if ! "$REMOTE_PYTHON_BIN" - "$REMOTE_SMOKE_TENANT_BODY" "$expected_slug" <<'PY'
import json
import pathlib
import sys

path, expected = sys.argv[1:]
try:
    payload = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
except (OSError, UnicodeError, json.JSONDecodeError):
    raise SystemExit(1)
if not isinstance(payload, dict):
    raise SystemExit(1)
tenant = payload.get("tenant")
if not isinstance(tenant, dict) or tenant.get("slug") != expected:
    raise SystemExit(1)
PY
  then
    remote_cleanup_smoke_bodies
    remote_write_smoke_result "$result_dir" "$expected_slug" fail || true
    return 1
  fi
  remote_cleanup_smoke_bodies || return 1
  remote_write_smoke_result "$result_dir" "$expected_slug" pass
}

remote_run_tenant_smoke() {
  local tenant_file="$1"
  local expected_count="$2"
  local tenant_file_size result_dir pairs_file bash_bin slug origin result_file result_slug result_status
  local pair_count=0 result_count=0
  local -a result_files=()

  release_record_require_private_file "$tenant_file" || return 1
  [[ "$expected_count" =~ ^[0-9]+$ ]] || return 1
  (( expected_count >= 1 && expected_count <= 100 )) || return 1
  tenant_file_size="$(stat -c '%s' -- "$tenant_file")" || return 1
  [[ "$tenant_file_size" =~ ^[0-9]+$ ]] || return 1
  (( tenant_file_size <= 262144 )) || return 1
  result_dir="$(mktemp -d /tmp/chatwoot-client-portal-v2-smoke.XXXXXX)" || return 1
  REMOTE_SMOKE_RESULT_DIR="$result_dir"
  chmod 0700 "$result_dir" || {
    remote_cleanup_activation_temps
    return 1
  }
  pairs_file="$result_dir/pairs.bin"
  : >"$pairs_file" || {
    remote_cleanup_activation_temps
    return 1
  }
  chmod 0600 "$pairs_file" || {
    remote_cleanup_activation_temps
    return 1
  }
  while IFS=$'\t' read -r slug origin; do
    [[ -n "$slug" && -n "$origin" ]] || {
      remote_cleanup_activation_temps
      return 1
    }
    pair_count=$((pair_count + 1))
    (( pair_count <= expected_count )) || {
      remote_cleanup_activation_temps
      return 1
    }
    printf '%s\0%s\0' "$slug" "$origin" >>"$pairs_file" || {
      remote_cleanup_activation_temps
      return 1
    }
  done <"$tenant_file" || {
    remote_cleanup_activation_temps
    return 1
  }
  (( pair_count == expected_count )) || {
    remote_cleanup_activation_temps
    return 1
  }
  bash_bin="$(command -v bash)" || {
    remote_cleanup_activation_temps
    return 1
  }
  if ! "$REMOTE_TIMEOUT_BIN" 600 "$REMOTE_XARGS_BIN" -0 -n 2 -P 5 \
    "$bash_bin" -c 'exec "$1" __smoke-one "$3" "$4" "$2"' \
    _ "$SELF_PATH" "$result_dir" <"$pairs_file"; then
    remote_cleanup_activation_temps
    return 1
  fi
  remote_find_paths result_files "$result_dir" -mindepth 1 -maxdepth 1 -type f -name 'result.*' || {
    remote_cleanup_activation_temps
    return 1
  }
  result_count="${#result_files[@]}"
  if (( result_count != expected_count )); then
    remote_cleanup_activation_temps
    return 1
  fi
  for result_file in "${result_files[@]}"; do
    IFS=$'\t' read -r result_slug result_status <"$result_file" || {
      remote_cleanup_activation_temps
      return 1
    }
    [[ "$result_slug" =~ ^[a-z0-9][a-z0-9-]{0,62}$ && "$result_status" == 'pass' ]] || {
      remote_cleanup_activation_temps
      return 1
    }
  done
  remote_cleanup_activation_temps
}

remote_root_rsync_arguments() {
  local output_name="$1"
  local -n output_arguments="$output_name"

  output_arguments=(
    -a
    --delete
    --checksum
    --no-owner
    --no-group
    --exclude=/.env
    --exclude=/.env.production
    '--exclude=/.env.production.backup.*'
    --exclude=/.git
    --exclude=/.codex
    --exclude=/.install
    --exclude=/.release-state
    --exclude=/.releases
    --exclude=/logs
    --exclude=/backups
    --exclude=/BOOTSTRAP_SOURCE.txt
    --exclude=/DEPLOY_SOURCE.txt
  )
}

remote_sync_root_source() {
  local app_path="$1"
  local candidate_dir="$2"
  local root_mode root_uid root_gid
  local -a rsync_arguments=()

  if remote_is_test_mode && [[ -n "${STAGED_TEST_FAIL_PUBLICATION_AT:-}" ]]; then
    case "$STAGED_TEST_FAIL_PUBLICATION_AT" in
      root_sync) return 1 ;;
      marker|previous|current|marker_after_deploy) ;;
      *) return 1 ;;
    esac
  elif [[ -n "${STAGED_TEST_FAIL_PUBLICATION_AT:-}" ]]; then
    return 1
  fi

  root_mode="$(stat -c '%a' -- "$app_path")" || return 1
  root_uid="$(stat -c '%u' -- "$app_path")" || return 1
  root_gid="$(stat -c '%g' -- "$app_path")" || return 1
  [[ "$root_mode" =~ ^[0-7]{3,4}$ && "$root_uid" =~ ^[0-9]+$ && "$root_gid" =~ ^[0-9]+$ ]] || return 1

  remote_root_rsync_arguments rsync_arguments
  if ! "$REMOTE_RSYNC_BIN" "${rsync_arguments[@]}" "$candidate_dir/source/" "$app_path/"; then
    chmod "$root_mode" "$app_path" >/dev/null 2>&1 || true
    return 1
  fi
  chmod "$root_mode" "$app_path" || return 1
  [[ "$(stat -c '%a' -- "$app_path")" == "$root_mode" &&
    "$(stat -c '%u' -- "$app_path")" == "$root_uid" &&
    "$(stat -c '%g' -- "$app_path")" == "$root_gid" ]]
}

remote_verify_root_source() {
  local app_path="$1"
  local release_dir="$2"
  local differences line
  local -a rsync_arguments=()

  remote_root_rsync_arguments rsync_arguments
  differences="$(
    "$REMOTE_RSYNC_BIN" "${rsync_arguments[@]}" --dry-run --itemize-changes \
      "$release_dir/source/" "$app_path/"
  )" || return 1
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    [[ "${line#* }" == './' ]] || return 1
  done <<<"$differences"
}

remote_stage_active_marker() {
  local app_path="$1"
  local candidate_commit="$2"
  local archive_sha="$3"
  local activated_at="$4"

  REMOTE_PUBLICATION_MARKER_TEMP="$(mktemp "$app_path/.release-activation.marker.XXXXXX")" || return 1
  printf '%s\n' \
    "protocol_version=$REMOTE_PROTOCOL_VERSION" \
    'record_kind=active_source' \
    "app=$REMOTE_APP_NAME" \
    "source_commit=$candidate_commit" \
    "archive_sha256=$archive_sha" \
    "activated_at_utc=$activated_at" >"$REMOTE_PUBLICATION_MARKER_TEMP"
  chmod 0600 "$REMOTE_PUBLICATION_MARKER_TEMP"
  release_marker_validate_active "$REMOTE_PUBLICATION_MARKER_TEMP" || return 1
  remote_fsync_path_and_parent "$REMOTE_PUBLICATION_MARKER_TEMP"
}

remote_stage_pointer_temp() {
  local state_dir="$1"
  local commit="$2"
  local output_name="$3"
  local temporary

  release_record_is_sha "$commit" || return 1
  temporary="$(mktemp "$state_dir/.release-activation.pointer.XXXXXX")" || return 1
  printf '%s\n' "$commit" >"$temporary"
  chmod 0600 "$temporary"
  [[ "$(remote_pointer_read "$temporary")" == "$commit" ]] || {
    rm -f -- "$temporary"
    return 1
  }
  remote_fsync_path_and_parent "$temporary" || {
    rm -f -- "$temporary"
    return 1
  }
  printf -v "$output_name" '%s' "$temporary"
}

remote_publish_activation_markers() {
  local app_path="$1"
  local candidate_commit="$2"
  local previous_commit="$3"
  local archive_sha="$4"
  local activated_at="$5"
  local first_adoption="$6"
  local state_dir="$app_path/.release-state"

  remote_stage_active_marker "$app_path" "$candidate_commit" "$archive_sha" "$activated_at" || return 1
  remote_stage_pointer_temp "$state_dir" "$previous_commit" REMOTE_PUBLICATION_PREVIOUS_TEMP || return 1
  remote_stage_pointer_temp "$state_dir" "$candidate_commit" REMOTE_PUBLICATION_CURRENT_TEMP || return 1

  mv -T -- "$REMOTE_PUBLICATION_MARKER_TEMP" "$app_path/DEPLOY_SOURCE.txt" || return 1
  REMOTE_PUBLICATION_MARKER_TEMP=''
  remote_fsync_path_and_parent "$app_path/DEPLOY_SOURCE.txt" || return 1
  remote_record_test_event marker_rename DEPLOY_SOURCE.txt || return 1
  if remote_is_test_mode && [[ "${STAGED_TEST_FAIL_PUBLICATION_AT:-}" == 'marker' ||
    "${STAGED_TEST_FAIL_PUBLICATION_AT:-}" == 'marker_after_deploy' ]]; then
    return 1
  fi

  mv -T -- "$REMOTE_PUBLICATION_PREVIOUS_TEMP" "$state_dir/previous" || return 1
  REMOTE_PUBLICATION_PREVIOUS_TEMP=''
  remote_fsync_path_and_parent "$state_dir/previous" || return 1
  remote_record_test_event marker_rename previous || return 1
  if remote_is_test_mode && [[ "${STAGED_TEST_FAIL_PUBLICATION_AT:-}" == 'previous' ]]; then
    return 1
  fi

  mv -T -- "$REMOTE_PUBLICATION_CURRENT_TEMP" "$state_dir/current" || return 1
  REMOTE_PUBLICATION_CURRENT_TEMP=''
  remote_fsync_path_and_parent "$state_dir/current" || return 1
  remote_record_test_event marker_rename current || return 1
  if remote_is_test_mode && [[ "${STAGED_TEST_FAIL_PUBLICATION_AT:-}" == 'current' ]]; then
    return 1
  fi

  if [[ "$first_adoption" == 'true' ]]; then
    [[ "$(remote_pointer_read "$state_dir/adoption")" == "$previous_commit" ]] || return 1
    rm -f -- "$state_dir/adoption" || return 1
    if remote_is_test_mode && [[ "${STAGED_TEST_FAIL_ADOPTION_AFTER_UNLINK:-false}" == 'true' ]]; then
      return 1
    elif [[ "${STAGED_TEST_FAIL_ADOPTION_AFTER_UNLINK:-false}" != 'false' ]]; then
      return 1
    fi
    remote_fsync_path_and_parent "$state_dir" || return 1
  fi
}

remote_validate_outcome() {
  local path="$1"
  local expected_candidate="$2"
  local expected_status="$3"
  local expected_previous="${4:-}"
  local expected_started="${5:-}"
  local protocol kind candidate previous status stage started timestamp epoch key
  local compose_wait_key_count=0 compose_wait_exit_code
  local compose_wait_portal_backend compose_wait_portal_web compose_wait_telegram_bridge

  release_record_validate_keys "$path" protocol_version record_kind candidate_commit previous_commit \
    status failure_stage transaction_started_at_utc recorded_at_utc recorded_at_epoch \
    compose_wait_exit_code compose_wait_portal_backend compose_wait_portal_web \
    compose_wait_telegram_bridge || return 1
  protocol="$(release_record_get_unique "$path" protocol_version)" || return 1
  kind="$(release_record_get_unique "$path" record_kind)" || return 1
  candidate="$(release_record_get_unique "$path" candidate_commit)" || return 1
  previous="$(release_record_get_unique "$path" previous_commit)" || return 1
  status="$(release_record_get_unique "$path" status)" || return 1
  stage="$(release_record_get_unique "$path" failure_stage)" || return 1
  started="$(release_record_get_unique "$path" transaction_started_at_utc)" || return 1
  timestamp="$(release_record_get_unique "$path" recorded_at_utc)" || return 1
  epoch="$(release_record_get_unique "$path" recorded_at_epoch)" || return 1
  [[ "$protocol" == "$REMOTE_PROTOCOL_VERSION" && "$kind" == 'deployment_outcome' &&
    "$candidate" == "$expected_candidate" && "$status" == "$expected_status" ]] || return 1
  [[ -z "$expected_previous" || "$previous" == "$expected_previous" ]] || return 1
  [[ -z "$expected_started" || "$started" == "$expected_started" ]] || return 1
  release_record_is_sha "$previous" || [[ "$previous" == 'none' ]] || return 1
  case "$status" in
    activation_succeeded|candidate_failed_rollback_succeeded|candidate_failed_rollback_failed|candidate_failed_forward_only) ;;
    *) return 1 ;;
  esac
  case "$status" in
    activation_succeeded) [[ "$stage" == 'none' ]] || return 1 ;;
    *)
      case "$stage" in compose_wait|service_state|tenant_smoke|root_sync|marker_publish) ;;
        *) return 1 ;;
      esac
      ;;
  esac
  release_record_is_timestamp "$started" || return 1
  release_record_is_timestamp "$timestamp" || return 1
  [[ "$started" > "$timestamp" ]] && return 1
  [[ "$epoch" =~ ^[0-9]+$ && "$epoch" -ge 1 ]] || return 1

  for key in compose_wait_exit_code compose_wait_portal_backend compose_wait_portal_web \
    compose_wait_telegram_bridge; do
    if grep -Eq "^${key}=" "$path"; then
      compose_wait_key_count=$((compose_wait_key_count + 1))
    fi
  done
  if [[ "$stage" != 'compose_wait' ]]; then
    (( compose_wait_key_count == 0 )) || return 1
    return 0
  fi
  (( compose_wait_key_count == 0 || compose_wait_key_count == 4 )) || return 1
  (( compose_wait_key_count == 0 )) && return 0
  compose_wait_exit_code="$(release_record_get_unique "$path" compose_wait_exit_code)" || return 1
  compose_wait_portal_backend="$(release_record_get_unique "$path" compose_wait_portal_backend)" || return 1
  compose_wait_portal_web="$(release_record_get_unique "$path" compose_wait_portal_web)" || return 1
  compose_wait_telegram_bridge="$(release_record_get_unique "$path" compose_wait_telegram_bridge)" || return 1
  [[ "$compose_wait_exit_code" =~ ^[1-9][0-9]*$ ]] || return 1
  remote_compose_wait_snapshot_is_safe "$compose_wait_portal_backend" || return 1
  remote_compose_wait_snapshot_is_safe "$compose_wait_portal_web" || return 1
  remote_compose_wait_snapshot_is_safe "$compose_wait_telegram_bridge"
}

remote_outcome_transaction_started_at() {
  local state_dir="$1"
  local candidate="$2"
  local previous="$3"
  local transaction="$state_dir/transaction"
  local transaction_candidate transaction_previous started

  release_record_require_private_file "$transaction" || return 1
  transaction_candidate="$(release_record_get_unique "$transaction" candidate_commit)" || return 1
  transaction_previous="$(release_record_get_unique "$transaction" previous_commit)" || return 1
  started="$(release_record_get_unique "$transaction" started_at_utc)" || return 1
  [[ "$transaction_candidate" == "$candidate" && "$transaction_previous" == "$previous" ]] || return 1
  release_record_is_timestamp "$started" || return 1
  printf '%s\n' "$started"
}

remote_success_outcome_tail_checkpoint() {
  local checkpoint="$1"
  local requested="${STAGED_TEST_FAIL_SUCCESS_OUTCOME_AT:-}"

  [[ -n "$requested" ]] || return 0
  case "$requested" in validation|fsync|event) ;; *) return 1 ;; esac
  remote_is_test_mode || return 1
  [[ "$requested" != "$checkpoint" ]]
}

remote_visible_success_outcome_is_exact() {
  local state_dir="$1"
  local candidate="$2"
  local previous="$3"
  local path="$REMOTE_VISIBLE_SUCCESS_OUTCOME_PATH"
  local started epoch expected_path

  [[ -n "$path" && -n "$REMOTE_VISIBLE_SUCCESS_OUTCOME_STARTED" ]] || return 1
  started="$(remote_outcome_transaction_started_at "$state_dir" "$candidate" "$previous")" || return 1
  [[ "$REMOTE_VISIBLE_SUCCESS_OUTCOME_STARTED" == "$started" ]] || return 1
  epoch="$(release_record_get_unique "$path" recorded_at_epoch)" || return 1
  expected_path="$state_dir/history/$epoch-$candidate-activation_succeeded.txt"
  [[ "$path" == "$expected_path" ]] || return 1
  remote_validate_outcome "$path" "$candidate" activation_succeeded "$previous" "$started"
}

remote_write_success_outcome() {
  local state_dir="$1"
  local candidate="$2"
  local previous="$3"
  local epoch timestamp started path

  REMOTE_VISIBLE_SUCCESS_OUTCOME_PATH=''
  REMOTE_VISIBLE_SUCCESS_OUTCOME_STARTED=''
  started="$(remote_outcome_transaction_started_at "$state_dir" "$candidate" "$previous")" || return 1
  epoch="$(remote_now_epoch)" || return 1
  timestamp="$(remote_epoch_to_utc "$epoch")" || return 1
  path="$state_dir/history/$epoch-$candidate-activation_succeeded.txt"
  printf '%s\n' \
    "protocol_version=$REMOTE_PROTOCOL_VERSION" \
    'record_kind=deployment_outcome' \
    "candidate_commit=$candidate" \
    "previous_commit=$previous" \
    'status=activation_succeeded' \
    'failure_stage=none' \
    "transaction_started_at_utc=$started" \
    "recorded_at_utc=$timestamp" \
    "recorded_at_epoch=$epoch" |
    release_record_write_atomic create "$path" || return 1
  REMOTE_VISIBLE_SUCCESS_OUTCOME_PATH="$path"
  REMOTE_VISIBLE_SUCCESS_OUTCOME_STARTED="$started"
  remote_success_outcome_tail_checkpoint validation || return 1
  remote_validate_outcome "$path" "$candidate" activation_succeeded "$previous" "$started" || return 1
  remote_success_outcome_tail_checkpoint fsync || return 1
  remote_fsync_path_and_parent "$path" || return 1
  remote_success_outcome_tail_checkpoint event || return 1
  remote_record_test_event outcome_write activation_succeeded
}

remote_cleanup_superseded_release() {
  local app_path="$1"
  local superseded="$2"
  local current="$3"
  local previous="$4"
  local release_dir="$app_path/.releases/$superseded"
  local index
  local -a tags=() ids=()

  remote_validate_superseded_release_cleanup "$app_path" "$superseded" "$current" "$previous" || return 1
  [[ -n "$superseded" ]] || return 0
  tags=(
    "$(remote_release_tag portal-backend "$superseded")"
    "$(remote_release_tag portal-web "$superseded")"
    "$(remote_release_tag telegram-bridge "$superseded")"
  )
  ids=("$REMOTE_SUPERSEDED_BACKEND_ID" "$REMOTE_SUPERSEDED_WEB_ID" "$REMOTE_SUPERSEDED_TELEGRAM_ID")
  for index in 0 1 2; do
    remote_remove_exact_tag "${tags[$index]}" "${ids[$index]}" || return 1
  done
  rm -rf -- "$release_dir"
}

remote_validate_superseded_release_cleanup() {
  local app_path="$1"
  local superseded="$2"
  local current="$3"
  local previous="$4"
  local release_dir="$app_path/.releases/$superseded"
  local saved_archive saved_backend saved_web saved_telegram actual_id index
  local -a tags=() ids=()

  [[ -n "$superseded" ]] || return 0
  release_record_is_sha "$superseded" || return 1
  [[ "$superseded" != "$current" && "$superseded" != "$previous" ]] || return 1
  remote_require_private_directory "$release_dir" || return 1
  saved_archive="$REMOTE_ROLLBACK_ARCHIVE_SHA"
  saved_backend="$REMOTE_ROLLBACK_BACKEND_ID"
  saved_web="$REMOTE_ROLLBACK_WEB_ID"
  saved_telegram="$REMOTE_ROLLBACK_TELEGRAM_ID"
  if ! remote_load_release_evidence "$release_dir" "$superseded"; then
    REMOTE_ROLLBACK_ARCHIVE_SHA="$saved_archive"
    REMOTE_ROLLBACK_BACKEND_ID="$saved_backend"
    REMOTE_ROLLBACK_WEB_ID="$saved_web"
    REMOTE_ROLLBACK_TELEGRAM_ID="$saved_telegram"
    return 1
  fi
  REMOTE_SUPERSEDED_ARCHIVE_SHA="$REMOTE_ROLLBACK_ARCHIVE_SHA"
  REMOTE_SUPERSEDED_BACKEND_ID="$REMOTE_ROLLBACK_BACKEND_ID"
  REMOTE_SUPERSEDED_WEB_ID="$REMOTE_ROLLBACK_WEB_ID"
  REMOTE_SUPERSEDED_TELEGRAM_ID="$REMOTE_ROLLBACK_TELEGRAM_ID"
  REMOTE_ROLLBACK_ARCHIVE_SHA="$saved_archive"
  REMOTE_ROLLBACK_BACKEND_ID="$saved_backend"
  REMOTE_ROLLBACK_WEB_ID="$saved_web"
  REMOTE_ROLLBACK_TELEGRAM_ID="$saved_telegram"
  remote_validate_release_source_snapshot "$release_dir" "$REMOTE_SUPERSEDED_ARCHIVE_SHA" || return 1
  tags=(
    "$(remote_release_tag portal-backend "$superseded")"
    "$(remote_release_tag portal-web "$superseded")"
    "$(remote_release_tag telegram-bridge "$superseded")"
  )
  ids=("$REMOTE_SUPERSEDED_BACKEND_ID" "$REMOTE_SUPERSEDED_WEB_ID" "$REMOTE_SUPERSEDED_TELEGRAM_ID")
  for index in 0 1 2; do
    actual_id="$(remote_image_id "${tags[$index]}")" || return 1
    [[ "$actual_id" == "${ids[$index]}" ]] || return 1
  done
}

remote_cleanup_history() {
  local history_dir="$1"
  local entry epoch candidate status index sorted_output
  local -a entries=() sorted=()

  remote_find_paths entries "$history_dir" -mindepth 1 -maxdepth 1 -type f || return 1
  for entry in "${entries[@]}"; do
    [[ "$(basename -- "$entry")" =~ ^([0-9]+)-([0-9a-f]{40})-([a-z_]+)\.txt$ ]] || return 1
    epoch="${BASH_REMATCH[1]}"
    candidate="${BASH_REMATCH[2]}"
    status="${BASH_REMATCH[3]}"
    remote_validate_outcome "$entry" "$candidate" "$status" || return 1
    [[ "$(release_record_get_unique "$entry" recorded_at_epoch)" == "$epoch" ]] || return 1
    sorted+=("$epoch"$'\t'"$entry")
  done
  (( ${#sorted[@]} <= 20 )) && return 0
  sorted_output="$(printf '%s\n' "${sorted[@]}" | sort -t $'\t' -k1,1nr)" || return 1
  mapfile -t sorted <<<"$sorted_output"
  for (( index = 20; index < ${#sorted[@]}; index++ )); do
    entry="${sorted[$index]#*$'\t'}"
    rm -f -- "$entry" || return 1
  done
  remote_fsync_path_and_parent "$history_dir"
}

remote_write_failure_outcome() {
  local state_dir="$1"
  local candidate="$2"
  local previous="$3"
  local status="$4"
  local stage="$5"
  local epoch timestamp started path

  case "$status" in
    candidate_failed_rollback_succeeded|candidate_failed_rollback_failed|candidate_failed_forward_only) ;;
    *) return 2 ;;
  esac
  case "$stage" in compose_wait|service_state|tenant_smoke|root_sync|marker_publish) ;; *) return 2 ;; esac
  started="$(remote_outcome_transaction_started_at "$state_dir" "$candidate" "$previous")" || return 1
  epoch="$(remote_now_epoch)" || return 1
  timestamp="$(remote_epoch_to_utc "$epoch")" || return 1
  path="$state_dir/history/$epoch-$candidate-$status.txt"
  {
    printf '%s\n' \
      "protocol_version=$REMOTE_PROTOCOL_VERSION" \
      'record_kind=deployment_outcome' \
      "candidate_commit=$candidate" \
      "previous_commit=$previous" \
      "status=$status" \
      "failure_stage=$stage" \
      "transaction_started_at_utc=$started" \
      "recorded_at_utc=$timestamp" \
      "recorded_at_epoch=$epoch"
    if [[ "$stage" == 'compose_wait' ]]; then
      printf '%s\n' \
        "compose_wait_exit_code=$REMOTE_COMPOSE_WAIT_EXIT_CODE" \
        "compose_wait_portal_backend=$REMOTE_COMPOSE_WAIT_PORTAL_BACKEND" \
        "compose_wait_portal_web=$REMOTE_COMPOSE_WAIT_PORTAL_WEB" \
        "compose_wait_telegram_bridge=$REMOTE_COMPOSE_WAIT_TELEGRAM_BRIDGE"
    fi
  } |
    release_record_write_atomic create "$path" || return 1
  remote_validate_outcome "$path" "$candidate" "$status" "$previous" "$started" || return 1
  remote_fsync_path_and_parent "$path" || return 1
  remote_record_test_event outcome_write "$status"
}

REMOTE_CRITICAL_STATUS=''
REMOTE_CRITICAL_OUTCOME_PATH=''
remote_find_critical_outcome() {
  local state_dir="$1"
  local candidate="$2"
  local expected_previous="${3:-}"
  local expected_started="${4:-}"
  local transaction="$state_dir/transaction"
  local entry status record_candidate record_started
  local -a entries=() matches=()

  REMOTE_CRITICAL_STATUS=''
  REMOTE_CRITICAL_OUTCOME_PATH=''
  if [[ -f "$transaction" ]]; then
    [[ -n "$expected_previous" ]] ||
      expected_previous="$(release_record_get_unique "$transaction" previous_commit)" || return 1
    [[ -n "$expected_started" ]] ||
      expected_started="$(release_record_get_unique "$transaction" started_at_utc)" || return 1
  fi
  [[ -n "$expected_started" ]] || return 0
  release_record_is_sha "$expected_previous" || [[ "$expected_previous" == 'none' ]] || return 1
  release_record_is_timestamp "$expected_started" || return 1
  remote_require_private_directory "$state_dir/history" || return 1
  remote_find_paths entries "$state_dir/history" -mindepth 1 -maxdepth 1 -type f || return 1
  for entry in "${entries[@]}"; do
    record_candidate="$(release_record_get_unique "$entry" candidate_commit 2>/dev/null)" || continue
    [[ "$record_candidate" == "$candidate" ]] || continue
    record_started="$(release_record_get_unique "$entry" transaction_started_at_utc 2>/dev/null)" || continue
    [[ "$record_started" == "$expected_started" ]] || continue
    status="$(release_record_get_unique "$entry" status 2>/dev/null)" || return 1
    case "$status" in
      activation_succeeded|candidate_failed_rollback_succeeded|\
        candidate_failed_rollback_failed|candidate_failed_forward_only)
        remote_validate_outcome \
          "$entry" "$candidate" "$status" "$expected_previous" "$expected_started" || return 1
        matches+=("$status"$'\t'"$entry")
        ;;
    esac
  done
  (( ${#matches[@]} <= 1 )) || return 1
  if (( ${#matches[@]} == 1 )); then
    REMOTE_CRITICAL_STATUS="${matches[0]%%$'\t'*}"
    REMOTE_CRITICAL_OUTCOME_PATH="${matches[0]#*$'\t'}"
  fi
  return 0
}

remote_find_standalone_critical_outcome() {
  local state_dir="$1"
  local candidate="$2"
  local entry status record_candidate
  local -a entries=() matches=()

  REMOTE_CRITICAL_STATUS=''
  REMOTE_CRITICAL_OUTCOME_PATH=''
  remote_require_private_directory "$state_dir/history" || return 1
  remote_find_paths entries "$state_dir/history" -mindepth 1 -maxdepth 1 -type f || return 1
  for entry in "${entries[@]}"; do
    record_candidate="$(release_record_get_unique "$entry" candidate_commit 2>/dev/null)" || continue
    [[ "$record_candidate" == "$candidate" ]] || continue
    status="$(release_record_get_unique "$entry" status 2>/dev/null)" || return 1
    case "$status" in
      candidate_failed_rollback_failed|candidate_failed_forward_only)
        remote_validate_outcome "$entry" "$candidate" "$status" || return 1
        matches+=("$status"$'\t'"$entry")
        ;;
    esac
  done
  (( ${#matches[@]} <= 1 )) || return 1
  if (( ${#matches[@]} == 1 )); then
    REMOTE_CRITICAL_STATUS="${matches[0]%%$'\t'*}"
    REMOTE_CRITICAL_OUTCOME_PATH="${matches[0]#*$'\t'}"
  fi
  return 0
}

remote_print_critical_evidence() {
  local app_path="$1"
  local candidate="$2"
  local status="$3"
  local state_dir="$app_path/.release-state"
  local current='none' previous='none'

  if [[ -f "$state_dir/current" ]]; then
    current="$(remote_pointer_read "$state_dir/current")" || current='invalid'
  elif [[ -f "$state_dir/adoption" ]]; then
    current="$(remote_pointer_read "$state_dir/adoption")" || current='invalid'
  fi
  [[ ! -f "$state_dir/previous" ]] || previous="$(remote_pointer_read "$state_dir/previous")" || previous='invalid'
  printf 'critical_status=%s\n' "$status"
  printf 'critical_candidate_commit=%s\n' "$candidate"
  printf 'critical_current_commit=%s\n' "$current"
  printf 'critical_previous_commit=%s\n' "$previous"
  [[ ! -f "$state_dir/transaction" ]] || printf 'manual_transaction_path=%s\n' "$state_dir/transaction"
  [[ ! -f "$state_dir/prepared" ]] || printf 'manual_prepared_path=%s\n' "$state_dir/prepared"
  [[ ! -f "$state_dir/decisions/$candidate.txt" ]] ||
    printf 'manual_decision_path=%s\n' "$state_dir/decisions/$candidate.txt"
  [[ -z "$REMOTE_CRITICAL_OUTCOME_PATH" ]] || printf 'manual_outcome_path=%s\n' "$REMOTE_CRITICAL_OUTCOME_PATH"
  printf 'manual_candidate_path=%s\n' "$app_path/.releases/$candidate"
}

remote_block_on_critical_state() {
  local app_path="$1"
  local operation="$2"
  local state_dir="$app_path/.release-state"
  local transaction="$state_dir/transaction"
  local candidate='' prepared_candidate='' transaction_candidate='' transaction_previous=''
  local transaction_policy='' transaction_started='' status=''
  local prepared_valid='true' transaction_present='false' transaction_valid='false'

  [[ "$operation" == 'prepare' || "$operation" == 'activate' ]] || return 2
  if [[ -e "$state_dir/prepared" || -L "$state_dir/prepared" ]]; then
    if prepared_candidate="$(remote_pointer_read "$state_dir/prepared" 2>/dev/null)"; then
      candidate="$prepared_candidate"
    else
      prepared_valid='false'
    fi
  fi
  if [[ -e "$transaction" || -L "$transaction" ]]; then
    transaction_present='true'
    if release_record_require_private_file "$transaction"; then
      transaction_candidate="$(release_record_get_unique "$transaction" candidate_commit 2>/dev/null || true)"
      transaction_previous="$(release_record_get_unique "$transaction" previous_commit 2>/dev/null || true)"
      transaction_policy="$(release_record_get_unique "$transaction" migration_policy 2>/dev/null || true)"
      transaction_started="$(release_record_get_unique "$transaction" started_at_utc 2>/dev/null || true)"
      if release_record_is_sha "$transaction_candidate"; then
        candidate="$transaction_candidate"
      fi
      if release_record_is_sha "$transaction_candidate" &&
        release_record_is_sha "$transaction_previous" &&
        release_record_is_timestamp "$transaction_started" &&
        remote_validate_transaction "$transaction" "$transaction_candidate" \
          "$transaction_previous" "$transaction_policy" &&
        [[ "$prepared_valid" == 'true' &&
          ( -z "$prepared_candidate" || "$prepared_candidate" == "$transaction_candidate" ) ]]; then
        transaction_valid='true'
      fi
    fi
  fi
  if [[ "$transaction_present" == 'false' ]]; then
    [[ "$prepared_valid" == 'true' ]] || return 1
    [[ -n "$candidate" ]] || return 0
    if remote_find_standalone_critical_outcome "$state_dir" "$candidate"; then
      status="$REMOTE_CRITICAL_STATUS"
    else
      status='critical_outcome_ambiguous'
    fi
    [[ -n "$status" ]] || return 0
    remote_print_critical_evidence "$app_path" "$candidate" "$status"
    if [[ "$operation" == 'prepare' ]]; then
      remote_fail 'Prepared candidate has unresolved critical deployment evidence.' prepare_failed
    fi
    remote_activation_refuse 'Prepared candidate has unresolved critical deployment evidence.'
  fi
  [[ -n "$candidate" ]] || return 1
  if release_record_is_sha "$transaction_previous" &&
    release_record_is_timestamp "$transaction_started"; then
    if remote_find_critical_outcome \
      "$state_dir" "$candidate" "$transaction_previous" "$transaction_started"; then
      status="$REMOTE_CRITICAL_STATUS"
    else
      transaction_valid='false'
    fi
  fi
  if [[ -z "$status" ]]; then
    if [[ "$transaction_valid" == 'true' ]]; then
      status='transaction_unresolved'
    else
      status='transaction_invalid'
    fi
  fi
  remote_print_critical_evidence "$app_path" "$candidate" "$status"
  if [[ "$operation" == 'prepare' ]]; then
    remote_fail 'Prepared candidate has unresolved critical deployment evidence.' prepare_failed
  fi
  remote_activation_refuse 'Prepared candidate has unresolved critical deployment evidence.'
}

remote_print_candidate_evidence() {
  local app_path="$1"
  local status="$2"
  local stage="$3"
  local state_dir="$app_path/.release-state"
  local service details='unavailable' current='none' previous='none'

  [[ ! -f "$state_dir/current" ]] || current="$(remote_pointer_read "$state_dir/current" 2>/dev/null || printf invalid)"
  [[ ! -f "$state_dir/previous" ]] || previous="$(remote_pointer_read "$state_dir/previous" 2>/dev/null || printf invalid)"
  printf 'failure_status=%s\n' "$status"
  printf 'failure_stage=%s\n' "$stage"
  printf 'candidate_commit=%s\n' "$REMOTE_ACTIVATION_CANDIDATE_COMMIT"
  printf 'current_commit=%s\n' "$current"
  printf 'previous_commit=%s\n' "$previous"
  printf 'candidate_backend_image_id=%s\n' "${REMOTE_ACTIVATION_CANDIDATE_IDS[0]:-unavailable}"
  printf 'candidate_web_image_id=%s\n' "${REMOTE_ACTIVATION_CANDIDATE_IDS[1]:-unavailable}"
  printf 'candidate_telegram_image_id=%s\n' "${REMOTE_ACTIVATION_CANDIDATE_IDS[2]:-unavailable}"
  if [[ "$stage" == 'compose_wait' ]]; then
    printf 'compose_wait_exit_code=%s\n' "$REMOTE_COMPOSE_WAIT_EXIT_CODE"
    printf 'compose_wait_portal_backend=%s\n' "$REMOTE_COMPOSE_WAIT_PORTAL_BACKEND"
    printf 'compose_wait_portal_web=%s\n' "$REMOTE_COMPOSE_WAIT_PORTAL_WEB"
    printf 'compose_wait_telegram_bridge=%s\n' "$REMOTE_COMPOSE_WAIT_TELEGRAM_BRIDGE"
  fi
  for service in portal-backend portal-web telegram-bridge; do
    if remote_resolve_single_service_container "$service" 2>/dev/null; then
      details="$("${REMOTE_DOCKER[@]}" inspect --format \
        '{{.Image}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.StartedAt}}' \
        "$REMOTE_RESOLVED_CONTAINER_ID" 2>/dev/null || printf unavailable)"
    else
      details='unavailable'
    fi
    printf 'container_%s=%s\n' "${service//-/_}" "$details"
  done
}

remote_compose_wait_snapshot_is_safe() {
  local value="${1:-}"

  [[ "$value" == 'unavailable' || "$value" =~ ^sha256:[0-9a-f]{64}\|(true|false)\|(healthy|unhealthy|starting|none)\|[0-9]+$ ]]
}

remote_capture_pre_cutover_service_container_ids() {
  local service

  REMOTE_COMPOSE_WAIT_PRE_CUTOVER_CONTAINER_IDS=()
  for service in portal-backend portal-web telegram-bridge; do
    if remote_resolve_single_service_container "$service" 2>/dev/null; then
      REMOTE_COMPOSE_WAIT_PRE_CUTOVER_CONTAINER_IDS+=("$REMOTE_RESOLVED_CONTAINER_ID")
    fi
  done
}

remote_capture_compose_wait_failure_evidence() {
  local exit_code="$1"
  local service details expected_image captured_image container_id pre_cutover_container_id

  REMOTE_COMPOSE_WAIT_EXIT_CODE='unavailable'
  REMOTE_COMPOSE_WAIT_PORTAL_BACKEND='unavailable'
  REMOTE_COMPOSE_WAIT_PORTAL_WEB='unavailable'
  REMOTE_COMPOSE_WAIT_TELEGRAM_BRIDGE='unavailable'
  [[ "$exit_code" =~ ^[1-9][0-9]*$ ]] && REMOTE_COMPOSE_WAIT_EXIT_CODE="$exit_code"

  for service in portal-backend portal-web telegram-bridge; do
    details='unavailable'
    case "$service" in
      portal-backend) expected_image="${REMOTE_ACTIVATION_CANDIDATE_IDS[0]:-}" ;;
      portal-web) expected_image="${REMOTE_ACTIVATION_CANDIDATE_IDS[1]:-}" ;;
      telegram-bridge) expected_image="${REMOTE_ACTIVATION_CANDIDATE_IDS[2]:-}" ;;
    esac
    if remote_resolve_single_service_container "$service" true 2>/dev/null; then
      container_id="$REMOTE_RESOLVED_CONTAINER_ID"
      details="$("${REMOTE_DOCKER[@]}" inspect --format \
        '{{.Image}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}' \
        "$container_id" 2>/dev/null || printf unavailable)"
      if remote_compose_wait_snapshot_is_safe "$details"; then
        captured_image="${details%%|*}"
        [[ "$captured_image" == "$expected_image" ]] || details='unavailable'
      else
        details='unavailable'
      fi
      for pre_cutover_container_id in "${REMOTE_COMPOSE_WAIT_PRE_CUTOVER_CONTAINER_IDS[@]}"; do
        [[ "$container_id" != "$pre_cutover_container_id" ]] || details='unavailable'
      done
    fi
    case "$service" in
      portal-backend) REMOTE_COMPOSE_WAIT_PORTAL_BACKEND="$details" ;;
      portal-web) REMOTE_COMPOSE_WAIT_PORTAL_WEB="$details" ;;
      telegram-bridge) REMOTE_COMPOSE_WAIT_TELEGRAM_BRIDGE="$details" ;;
    esac
  done
}

remote_restore_previous_markers() {
  local app_path="$1"
  local previous_commit="$2"
  local archive_sha="$3"
  local previous_before="$4"
  local first_adoption="$5"
  local state_dir="$app_path/.release-state"
  local epoch activated_at adoption_missing='false'
  local tamper_archive="${STAGED_TEST_TAMPER_ROLLBACK_MARKER_ARCHIVE:-false}"
  local marker_path="$app_path/DEPLOY_SOURCE.txt"
  local tamper_temp wrong_archive

  if [[ "$first_adoption" == 'true' ]]; then
    if [[ -f "$state_dir/adoption" ]]; then
      [[ "$(remote_pointer_read "$state_dir/adoption")" == "$previous_commit" ]] || return 1
    else
      [[ ! -e "$state_dir/adoption" && ! -L "$state_dir/adoption" ]] || return 1
      remote_validate_failure_policy_evidence "$app_path" || return 1
      [[ "$(remote_pointer_read "$state_dir/current")" == "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" ]] || return 1
      [[ "$(remote_pointer_read "$state_dir/previous")" == "$previous_commit" ]] || return 1
      [[ "$(release_marker_read_active_commit "$app_path/DEPLOY_SOURCE.txt")" == \
        "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" ]] || return 1
      adoption_missing='true'
    fi
  fi

  epoch="$(remote_now_epoch)" || return 1
  activated_at="$(remote_epoch_to_utc "$epoch")" || return 1
  remote_stage_active_marker "$app_path" "$previous_commit" "$archive_sha" "$activated_at" || return 1
  if [[ -n "$previous_before" ]]; then
    remote_stage_pointer_temp "$state_dir" "$previous_before" REMOTE_PUBLICATION_PREVIOUS_TEMP || return 1
  fi
  remote_stage_pointer_temp "$state_dir" "$previous_commit" REMOTE_PUBLICATION_CURRENT_TEMP || return 1

  mv -T -- "$REMOTE_PUBLICATION_MARKER_TEMP" "$app_path/DEPLOY_SOURCE.txt" || return 1
  REMOTE_PUBLICATION_MARKER_TEMP=''
  remote_fsync_path_and_parent "$app_path/DEPLOY_SOURCE.txt" || return 1
  remote_record_test_event rollback_marker_rename DEPLOY_SOURCE.txt || return 1
  if [[ -n "$previous_before" ]]; then
    mv -T -- "$REMOTE_PUBLICATION_PREVIOUS_TEMP" "$state_dir/previous" || return 1
    REMOTE_PUBLICATION_PREVIOUS_TEMP=''
    remote_fsync_path_and_parent "$state_dir/previous" || return 1
  else
    rm -f -- "$state_dir/previous" || return 1
    remote_fsync_path_and_parent "$state_dir" || return 1
  fi
  mv -T -- "$REMOTE_PUBLICATION_CURRENT_TEMP" "$state_dir/current" || return 1
  REMOTE_PUBLICATION_CURRENT_TEMP=''
  remote_fsync_path_and_parent "$state_dir/current" || return 1
  remote_record_test_event rollback_marker_rename current || return 1
  if [[ "$first_adoption" == 'true' ]]; then
    if [[ "$adoption_missing" == 'false' ]]; then
      [[ "$(remote_pointer_read "$state_dir/adoption")" == "$previous_commit" ]] || return 1
      rm -f -- "$state_dir/adoption" || return 1
      remote_fsync_path_and_parent "$state_dir" || return 1
    fi
  fi
  [[ "$tamper_archive" == 'false' || "$tamper_archive" == 'true' ]] || return 1
  if [[ "$tamper_archive" == 'true' ]]; then
    remote_is_test_mode || return 1
    wrong_archive="$(printf 'f%.0s' {1..64})"
    [[ "$wrong_archive" != "$archive_sha" ]] || return 1
    tamper_temp="$(mktemp "$app_path/.rollback-marker-tamper.XXXXXX")" || return 1
    if ! awk -F= -v checksum="$wrong_archive" \
      '$1 == "archive_sha256" { print "archive_sha256=" checksum; next } { print }' \
      "$marker_path" >"$tamper_temp"; then
      rm -f -- "$tamper_temp"
      return 1
    fi
    chmod 0600 "$tamper_temp" || {
      rm -f -- "$tamper_temp"
      return 1
    }
    mv -T -- "$tamper_temp" "$marker_path" || {
      rm -f -- "$tamper_temp"
      return 1
    }
    remote_fsync_path_and_parent "$marker_path" || return 1
    remote_record_test_event rollback_marker_archive_tamper "$wrong_archive" || return 1
  fi
  [[ "$(remote_pointer_read "$state_dir/current")" == "$previous_commit" ]] || return 1
  [[ "$(release_marker_read_active_commit "$marker_path")" == "$previous_commit" ]] || return 1
  [[ "$(release_record_get_unique "$marker_path" archive_sha256)" == "$archive_sha" ]] || return 1
  if [[ -n "$previous_before" ]]; then
    [[ "$(remote_pointer_read "$state_dir/previous")" == "$previous_before" ]] || return 1
  else
    [[ ! -e "$state_dir/previous" && ! -L "$state_dir/previous" ]] || return 1
  fi
}

remote_run_exact_rollback() {
  local app_path="$1"
  local stage="$2"
  local previous_commit="$REMOTE_ACTIVATION_PREVIOUS_COMMIT"
  local previous_dir="$app_path/.releases/$previous_commit"
  local candidate_tenants="$app_path/.releases/$REMOTE_ACTIVATION_CANDIDATE_COMMIT/tenants.tsv"
  local actual_tenant_sha actual_tenant_count saved_candidate_ids

  release_record_require_private_file "$candidate_tenants" || return 1
  actual_tenant_sha="$(sha256sum "$candidate_tenants" | awk '{print $1}')" || return 1
  actual_tenant_count="$(wc -l <"$candidate_tenants" | tr -d ' ')" || return 1
  [[ "$actual_tenant_sha" == "$REMOTE_ACTIVATION_TENANT_SHA" &&
    "$actual_tenant_count" == "$REMOTE_ACTIVATION_TENANT_COUNT" ]] || return 1
  remote_load_release_evidence "$previous_dir" "$previous_commit" || return 1
  [[ "$REMOTE_ROLLBACK_ARCHIVE_SHA" == "$REMOTE_ACTIVATION_PREVIOUS_ARCHIVE_SHA" &&
    "$REMOTE_ROLLBACK_BACKEND_ID" == "${REMOTE_ACTIVATION_PREVIOUS_IDS[0]}" &&
    "$REMOTE_ROLLBACK_WEB_ID" == "${REMOTE_ACTIVATION_PREVIOUS_IDS[1]}" &&
    "$REMOTE_ROLLBACK_TELEGRAM_ID" == "${REMOTE_ACTIVATION_PREVIOUS_IDS[2]}" ]] || return 1
  remote_validate_release_source_snapshot "$previous_dir" "$REMOTE_ACTIVATION_PREVIOUS_ARCHIVE_SHA" || return 1
  remote_validate_release_override "$previous_dir" "$previous_commit" || return 1
  [[ "$(remote_image_id "$(remote_release_tag portal-backend "$previous_commit")")" == "${REMOTE_ACTIVATION_PREVIOUS_IDS[0]}" ]] || return 1
  [[ "$(remote_image_id "$(remote_release_tag portal-web "$previous_commit")")" == "${REMOTE_ACTIVATION_PREVIOUS_IDS[1]}" ]] || return 1
  [[ "$(remote_image_id "$(remote_release_tag telegram-bridge "$previous_commit")")" == "${REMOTE_ACTIVATION_PREVIOUS_IDS[2]}" ]] || return 1
  remote_configure_compose "$app_path" "$previous_dir" || return 1
  "${REMOTE_COMPOSE[@]}" config --quiet >/dev/null 2>&1 || return 1
  "${REMOTE_COMPOSE[@]}" up -d --no-build --pull never --wait --wait-timeout 120 >/dev/null 2>&1 || return 1

  saved_candidate_ids="$(printf '%s\n' "${REMOTE_ACTIVATION_CANDIDATE_IDS[@]}")"
  REMOTE_ACTIVATION_CANDIDATE_IDS=("${REMOTE_ACTIVATION_PREVIOUS_IDS[@]}")
  if ! remote_capture_candidate_services ||
    ! remote_run_tenant_smoke \
      "$app_path/.releases/$REMOTE_ACTIVATION_CANDIDATE_COMMIT/tenants.tsv" \
      "$REMOTE_ACTIVATION_TENANT_COUNT" ||
    ! remote_recheck_candidate_services; then
    mapfile -t REMOTE_ACTIVATION_CANDIDATE_IDS <<<"$saved_candidate_ids"
    return 1
  fi
  mapfile -t REMOTE_ACTIVATION_CANDIDATE_IDS <<<"$saved_candidate_ids"

  if [[ "$stage" == 'root_sync' || "$stage" == 'marker_publish' ||
    "$REMOTE_ACTIVATION_FIRST_ADOPTION" == 'true' ]]; then
    remote_sync_root_source "$app_path" "$previous_dir" || return 1
    remote_verify_root_source "$app_path" "$previous_dir" || return 1
    remote_restore_previous_markers \
      "$app_path" "$previous_commit" "$REMOTE_ACTIVATION_PREVIOUS_ARCHIVE_SHA" \
      "$REMOTE_ACTIVATION_OLD_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_FIRST_ADOPTION" || return 1
  fi
  remote_record_test_event rollback_runtime_healthy "$previous_commit"
}

remote_cleanup_failed_candidate() {
  local app_path="$1"
  local candidate="$2"
  local state_dir="$app_path/.release-state"
  local release_dir="$app_path/.releases/$candidate"
  local manifest="$release_dir/manifest.txt"
  local transaction="$state_dir/transaction"
  local service tag image_id index removed_count=0
  local -a tags=() ids=()

  release_record_is_sha "$candidate" || return 2
  [[ "$release_dir" == "$app_path/.releases/$candidate" &&
    "$release_dir" == "$app_path/.releases/"* && -d "$release_dir" && ! -L "$release_dir" ]] || return 1
  [[ "$(remote_pointer_read "$state_dir/prepared")" == "$candidate" ]] || return 1
  remote_validate_prepared_manifest "$manifest" "$candidate" || return 1
  for service in backend web telegram; do
    tag="$(release_record_get_unique "$manifest" "${service}_image_tag")" || return 1
    image_id="$(release_record_get_unique "$manifest" "${service}_image_id")" || return 1
    [[ "$(remote_image_id "$tag")" == "$image_id" ]] || return 1
    tags+=("$tag")
    ids+=("$image_id")
  done
  remote_update_transaction "$transaction" "$candidate" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" rollback_cleanup_started || return 1
  for index in 0 1 2; do
    if ! remote_remove_exact_tag "${tags[$index]}" "${ids[$index]}"; then
      while (( removed_count > 0 )); do
        removed_count=$((removed_count - 1))
        remote_tag_exact_image "${ids[$removed_count]}" "${tags[$removed_count]}" || true
      done
      return 1
    fi
    removed_count=$((removed_count + 1))
  done
  if ! remote_update_transaction "$transaction" "$candidate" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" candidate_tags_removed; then
    for index in 0 1 2; do
      remote_tag_exact_image "${ids[$index]}" "${tags[$index]}" || true
    done
    return 1
  fi
  if ! remote_update_transaction "$transaction" "$candidate" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" candidate_artifact_removal_started; then
    for index in 0 1 2; do
      remote_tag_exact_image "${ids[$index]}" "${tags[$index]}" || true
    done
    return 1
  fi
  if ! rm -rf -- "$release_dir"; then
    for index in 0 1 2; do
      remote_tag_exact_image "${ids[$index]}" "${tags[$index]}" || true
    done
    return 1
  fi
  remote_fsync_path_and_parent "$app_path/.releases" || return 1
  if [[ -n "${STAGED_TEST_FAIL_ROLLBACK_CLEANUP_AT:-}" ]]; then
    remote_is_test_mode || return 1
    [[ "$STAGED_TEST_FAIL_ROLLBACK_CLEANUP_AT" == 'after_candidate_artifact_remove' ]] || return 1
    return 1
  fi
  remote_update_transaction "$transaction" "$candidate" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" candidate_artifacts_removed || return 1
  rm -f -- "$state_dir/prepared" || return 1
  remote_fsync_path_and_parent "$state_dir" || return 1
  remote_record_test_event prepared_remove "$candidate" || return 1
  remote_update_transaction "$transaction" "$candidate" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" prepared_removed
}

remote_validate_failure_policy_evidence() {
  local app_path="$1"
  local state_dir="$app_path/.release-state"
  local decision="$state_dir/decisions/$REMOTE_ACTIVATION_CANDIDATE_COMMIT.txt"
  local phase

  remote_validate_transaction \
    "$state_dir/transaction" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" || return 1
  phase="$(release_record_get_unique "$state_dir/transaction" phase)" || return 1
  case "$phase" in
    cutover_started|candidate_healthy|root_sync_started|root_sync_completed|markers_published) ;;
    *) return 1 ;;
  esac
  case "$REMOTE_ACTIVATION_MIGRATION" in
    none)
      [[ "$REMOTE_ACTIVATION_POLICY" == 'automatic' &&
        -z "$REMOTE_ACTIVATION_APPROVAL_REF" &&
        ! -e "$decision" && ! -L "$decision" ]] || return 1
      ;;
    migration)
      [[ "$REMOTE_ACTIVATION_POLICY" == 'backward-compatible' ||
        "$REMOTE_ACTIVATION_POLICY" == 'forward-only' ]] || return 1
      [[ "$REMOTE_ACTIVATION_DECISION_PATH" == "$decision" ]] || return 1
      remote_validate_activation_decision \
        "$decision" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
        "$REMOTE_ACTIVATION_POLICY" "$REMOTE_ACTIVATION_APPROVAL_REF" || return 1
      ;;
    *) return 1 ;;
  esac
}

handle_candidate_failure() {
  local stage="$1"
  local app_path="$REMOTE_EFFECTIVE_APP_PATH"
  local state_dir="$app_path/.release-state"
  local status

  case "$stage" in compose_wait|service_state|tenant_smoke|root_sync|marker_publish) ;; *) return 2 ;; esac
  REMOTE_ACTIVATION_FAILURE_STAGE="$stage"

  if ! remote_validate_failure_policy_evidence "$app_path"; then
    status='candidate_failed_rollback_failed'
    remote_write_failure_outcome "$state_dir" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
      "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$status" "$stage" || true
    remote_cleanup_history "$state_dir/history" || true
    remote_print_candidate_evidence "$app_path" "$status" "$stage"
    remote_fail 'Activation policy evidence changed after cutover; previous code was not started.' "$status"
  fi

  if [[ "$REMOTE_ACTIVATION_POLICY" == 'forward-only' ]]; then
    status='candidate_failed_forward_only'
    remote_write_failure_outcome "$state_dir" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
      "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$status" "$stage" ||
      remote_fail 'Forward-only failure outcome could not be persisted.' activation_failed_publication
    if ! remote_cleanup_history "$state_dir/history"; then
      printf 'Warning: forward-only history cleanup requires operator review.\n' >&2
    fi
    remote_print_candidate_evidence "$app_path" "$status" "$stage"
    remote_fail 'Candidate failed under forward-only policy; preserved evidence requires operator action.' "$status"
  fi

  if ! remote_run_exact_rollback "$app_path" "$stage"; then
    status='candidate_failed_rollback_failed'
    remote_write_failure_outcome "$state_dir" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
      "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$status" "$stage" || true
    remote_cleanup_history "$state_dir/history" || true
    remote_print_candidate_evidence "$app_path" "$status" "$stage"
    remote_fail 'Candidate and automatic exact rollback both failed; preserved evidence requires operator action.' "$status"
  fi

  status='candidate_failed_rollback_succeeded'
  remote_write_failure_outcome "$state_dir" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$status" "$stage" ||
    remote_fail 'Recovered runtime, but rollback outcome could not be persisted.' candidate_failed_rollback_failed
  if ! remote_update_transaction "$state_dir/transaction" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" rollback_recovered; then
    remote_find_critical_outcome "$state_dir" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" || true
    remote_print_candidate_evidence "$app_path" "$status" "$stage"
    printf 'Warning: recovered runtime journal finalization requires operator review.\n' >&2
    remote_fail 'Candidate failed; exact previous runtime was restored.' "$status"
  fi
  if ! remote_cleanup_history "$state_dir/history"; then
    remote_find_critical_outcome "$state_dir" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" || true
    remote_print_candidate_evidence "$app_path" "$status" "$stage"
    printf 'Warning: recovered runtime history cleanup requires operator review.\n' >&2
    remote_fail 'Candidate failed; exact previous runtime was restored.' "$status"
  fi
  if ! remote_cleanup_failed_candidate "$app_path" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT"; then
    remote_find_critical_outcome "$state_dir" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" || true
    remote_print_candidate_evidence "$app_path" "$status" "$stage"
    printf 'Warning: recovered runtime candidate cleanup requires operator review.\n' >&2
    remote_fail 'Candidate failed; exact previous runtime was restored.' "$status"
  fi
  remote_validate_transaction "$state_dir/transaction" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" || {
      remote_print_candidate_evidence "$app_path" "$status" "$stage"
      printf 'Warning: recovered runtime journal validation requires operator review.\n' >&2
      remote_fail 'Candidate failed; exact previous runtime was restored.' "$status"
    }
  if ! rm -f -- "$state_dir/transaction" || ! remote_fsync_path_and_parent "$state_dir" ||
    ! remote_record_test_event journal_remove "$status"; then
    remote_print_candidate_evidence "$app_path" "$status" "$stage"
    printf 'Warning: recovered runtime journal cleanup requires operator review.\n' >&2
    remote_fail 'Candidate failed; exact previous runtime was restored.' "$status"
  fi
  remote_print_candidate_evidence "$app_path" "$status" "$stage"
  remote_fail 'Candidate failed; exact previous runtime was restored.' "$status"
}

remote_validate_activation_commit_point() {
  local app_path="$1"
  local state_dir="$app_path/.release-state"
  local transaction="$state_dir/transaction"

  remote_validate_transaction "$transaction" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" || return 1
  [[ "$(release_record_get_unique "$transaction" phase)" == 'markers_published' ]] || return 1
  [[ "$(remote_pointer_read "$state_dir/current")" == "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" ]] || return 1
  [[ "$(remote_pointer_read "$state_dir/previous")" == "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" ]] || return 1
  [[ "$(release_marker_read_active_commit "$app_path/DEPLOY_SOURCE.txt")" == \
    "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" ]] || return 1
  [[ "$(release_record_get_unique "$app_path/DEPLOY_SOURCE.txt" archive_sha256)" == \
    "$REMOTE_ACTIVATION_CANDIDATE_ARCHIVE_SHA" ]] || return 1
  remote_verify_root_source "$app_path" "$app_path/.releases/$REMOTE_ACTIVATION_CANDIDATE_COMMIT"
}

remote_finalization_checkpoint() {
  local checkpoint="$1"
  local requested="${STAGED_TEST_FAIL_FINALIZATION_AT:-}"

  [[ -n "$requested" ]] || return 0
  case "$requested" in
    before_prepared_validation|before_prepared_remove|after_prepared_remove|\
      after_prepared_durable|after_prepared_event|before_transaction_validation|\
      before_transaction_remove|after_transaction_remove|after_transaction_durable|\
      after_transaction_event) ;;
    *) return 1 ;;
  esac
  remote_is_test_mode || return 1
  [[ "$requested" != "$checkpoint" ]]
}

remote_cleanup_committed_activation() {
  local app_path="$1"
  local state_dir="$app_path/.release-state"
  local transaction="$state_dir/transaction"

  remote_finalization_checkpoint before_prepared_validation || return 1
  [[ "$(remote_pointer_read "$state_dir/prepared")" == "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" ]] || return 1
  remote_finalization_checkpoint before_prepared_remove || return 1
  rm -f -- "$state_dir/prepared" || return 1
  remote_finalization_checkpoint after_prepared_remove || return 1
  remote_fsync_path_and_parent "$state_dir" || return 1
  remote_finalization_checkpoint after_prepared_durable || return 1
  remote_record_test_event prepared_remove "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" || return 1
  remote_finalization_checkpoint after_prepared_event || return 1

  remote_finalization_checkpoint before_transaction_validation || return 1
  remote_validate_transaction "$transaction" "$REMOTE_ACTIVATION_CANDIDATE_COMMIT" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" || return 1
  remote_finalization_checkpoint before_transaction_remove || return 1
  rm -f -- "$transaction" || return 1
  remote_finalization_checkpoint after_transaction_remove || return 1
  remote_fsync_path_and_parent "$state_dir" || return 1
  remote_finalization_checkpoint after_transaction_durable || return 1
  remote_record_test_event journal_remove activation_succeeded || return 1
  remote_finalization_checkpoint after_transaction_event || return 1
}

remote_locked_activate() {
  local app_path="$1"
  local candidate_commit="$2"
  local prepared_orchestrator="$3"
  local current_orchestrator="$4"
  local orchestrator_protocol="$5"
  local migration_policy="$6"
  local approval_ref="$7"
  local state_dir="$app_path/.release-state"
  local candidate_dir="$app_path/.releases/$candidate_commit"
  local transaction="$state_dir/transaction"
  local old_previous='' first_adoption='false'
  local expires_epoch started_epoch started_at activated_epoch activated_at compose_exit

  REMOTE_FAILURE_STATUS='activation_refused_state_changed'
  remote_select_docker || remote_activation_refuse 'Docker access is unavailable.'
  REMOTE_PYTHON_BIN="$(remote_select_python)" || remote_activation_refuse 'Python 3 is unavailable.'
  remote_select_activation_tools || remote_activation_refuse 'Activation tools are unavailable or unsafe.'
  for required in tar sha256sum find stat flock cmp date awk sort grep mktemp chmod cp rm mv; do
    command -v "$required" >/dev/null || remote_activation_refuse "Required activation command is missing: $required"
  done

  remote_activation_preflight \
    "$app_path" "$candidate_commit" "$prepared_orchestrator" "$current_orchestrator" \
    "$orchestrator_protocol" "$migration_policy" "$approval_ref"

  if [[ -f "$state_dir/previous" ]]; then
    old_previous="$(remote_pointer_read "$state_dir/previous")" ||
      remote_activation_refuse 'Previous release pointer is invalid.'
  fi
  remote_validate_superseded_release_cleanup \
    "$app_path" "$old_previous" "$candidate_commit" "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" ||
    remote_activation_refuse 'Superseded release cleanup evidence is invalid.'
  remote_revalidate_activation_cutover_inputs "$app_path" "$candidate_commit" ||
    remote_activation_refuse 'Activation inputs changed before cutover.'
  [[ -f "$state_dir/current" ]] || first_adoption='true'
  REMOTE_ACTIVATION_OLD_PREVIOUS_COMMIT="$old_previous"
  REMOTE_ACTIVATION_FIRST_ADOPTION="$first_adoption"
  expires_epoch="$(release_record_get_unique "$candidate_dir/manifest.txt" expires_at_epoch)" ||
    remote_activation_refuse 'Prepared expiry evidence changed before cutover.'
  [[ "$expires_epoch" =~ ^[0-9]+$ ]] ||
    remote_activation_refuse 'Prepared expiry evidence is invalid.'
  started_epoch="$(remote_cutover_now_epoch)" || remote_activation_refuse 'Unable to determine transaction time.'
  (( started_epoch < expires_epoch )) ||
    remote_activation_refuse 'Prepared release expired before cutover.' activation_refused_expired
  started_at="$(remote_epoch_to_utc "$started_epoch")" || remote_activation_refuse 'Unable to format transaction time.'
  REMOTE_FAILURE_STATUS='activation_failed_publication'
  remote_write_transaction create "$transaction" "$candidate_commit" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" \
    cutover_started "$started_at" "$started_at" ||
    remote_activation_refuse 'Activation transaction could not be persisted.'

  remote_capture_pre_cutover_service_container_ids
  if "${REMOTE_COMPOSE[@]}" up -d --no-build --pull never --wait --wait-timeout 120 >/dev/null 2>&1; then
    :
  else
    compose_exit=$?
    remote_capture_compose_wait_failure_evidence "$compose_exit"
    handle_candidate_failure compose_wait
  fi
  remote_capture_candidate_services ||
    handle_candidate_failure service_state
  [[ "$(sha256sum "$candidate_dir/tenants.tsv" | awk '{print $1}')" == "$REMOTE_ACTIVATION_TENANT_SHA" ]] ||
    handle_candidate_failure tenant_smoke
  remote_run_tenant_smoke "$candidate_dir/tenants.tsv" "$REMOTE_ACTIVATION_TENANT_COUNT" ||
    handle_candidate_failure tenant_smoke
  remote_recheck_candidate_services ||
    handle_candidate_failure service_state

  remote_update_transaction "$transaction" "$candidate_commit" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" candidate_healthy ||
    handle_candidate_failure service_state
  remote_validate_release_source_snapshot "$candidate_dir" "$REMOTE_ACTIVATION_CANDIDATE_ARCHIVE_SHA" ||
    handle_candidate_failure root_sync
  remote_update_transaction "$transaction" "$candidate_commit" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" root_sync_started ||
    handle_candidate_failure root_sync
  remote_sync_root_source "$app_path" "$candidate_dir" ||
    handle_candidate_failure root_sync
  remote_update_transaction "$transaction" "$candidate_commit" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" root_sync_completed ||
    handle_candidate_failure root_sync

  activated_epoch="$(remote_now_epoch)" || handle_candidate_failure marker_publish
  activated_at="$(remote_epoch_to_utc "$activated_epoch")" ||
    handle_candidate_failure marker_publish
  remote_publish_activation_markers \
    "$app_path" "$candidate_commit" "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" \
    "$REMOTE_ACTIVATION_CANDIDATE_ARCHIVE_SHA" "$activated_at" "$first_adoption" ||
    handle_candidate_failure marker_publish
  remote_update_transaction "$transaction" "$candidate_commit" \
    "$REMOTE_ACTIVATION_PREVIOUS_COMMIT" "$REMOTE_ACTIVATION_POLICY" markers_published ||
    handle_candidate_failure marker_publish

  remote_validate_activation_commit_point "$app_path" ||
    handle_candidate_failure marker_publish
  if ! remote_write_success_outcome \
    "$state_dir" "$candidate_commit" "$REMOTE_ACTIVATION_PREVIOUS_COMMIT"; then
    if remote_visible_success_outcome_is_exact \
      "$state_dir" "$candidate_commit" "$REMOTE_ACTIVATION_PREVIOUS_COMMIT"; then
      REMOTE_CRITICAL_STATUS='activation_succeeded'
      REMOTE_CRITICAL_OUTCOME_PATH="$REMOTE_VISIBLE_SUCCESS_OUTCOME_PATH"
      remote_print_critical_evidence "$app_path" "$candidate_commit" activation_succeeded
      printf 'Warning: activation is committed, but outcome finalization requires operator review.\n' >&2
      remote_emit_status activation_succeeded
      return 0
    fi
    handle_candidate_failure marker_publish
  fi

  if ! remote_cleanup_committed_activation "$app_path"; then
    remote_find_critical_outcome "$state_dir" "$candidate_commit" || true
    remote_print_critical_evidence "$app_path" "$candidate_commit" activation_succeeded
    printf 'Warning: activation is committed, but cleanup requires operator review.\n' >&2
    remote_emit_status activation_succeeded
    return 0
  fi

  if ! remote_cleanup_superseded_release \
    "$app_path" "$old_previous" "$candidate_commit" "$REMOTE_ACTIVATION_PREVIOUS_COMMIT"; then
    printf 'Warning: activation succeeded, but bounded cleanup requires operator review.\n' >&2
  fi
  if ! remote_cleanup_history "$state_dir/history"; then
    printf 'Warning: activation succeeded but bounded history cleanup requires operator review.\n' >&2
  fi
  remote_emit_status activation_succeeded
}

remote_run_activate_with_lock() {
  local app_path="$1"
  shift
  local state_dir="$app_path/.release-state"
  local lock_path="$state_dir/deploy.lock"
  local lock_exit

  REMOTE_FAILURE_STATUS='activation_refused_state_changed'
  remote_require_private_directory "$state_dir" ||
    remote_fail 'Release state directory is unavailable or unsafe.' activation_refused_state_changed
  remote_require_private_directory "$app_path/.releases" ||
    remote_fail 'Release directory is unavailable or unsafe.' activation_refused_state_changed
  remote_lock_file_is_safe "$lock_path" ||
    remote_fail 'Release lock file is unsafe.' activation_refused_state_changed

  REMOTE_FAILURE_STATUS='activation_failed_publication'
  set +e
  flock --nonblock --close --conflict-exit-code 75 "$lock_path" \
    "$SELF_PATH" __locked-activate \
    "--app-path=$REMOTE_APP_PATH" \
    "$@"
  lock_exit=$?
  set -e
  if (( lock_exit == 75 )); then
    remote_fail 'Another staged release operation is already running.' activation_refused_state_changed
  fi
  return "$lock_exit"
}

remote_parse_activate_options() {
  local prefix="$1"
  shift
  local argument name value
  local app_path='' candidate_commit='' prepared_orchestrator='' current_orchestrator=''
  local orchestrator_protocol='' migration_policy='' approval_ref=''
  local -A seen=()
  local -a locked_arguments=()

  for argument in "$@"; do
    [[ "$argument" == --*=* ]] || return 2
    name="${argument%%=*}"
    name="${name#--}"
    value="${argument#*=}"
    [[ -n "$value" && -z "${seen[$name]:-}" ]] || return 2
    seen[$name]='true'
    case "$name" in
      app-path) app_path="$value" ;;
      candidate-commit) candidate_commit="$value" ;;
      prepared-orchestrator-commit) prepared_orchestrator="$value" ;;
      orchestrator-commit) current_orchestrator="$value" ;;
      orchestrator-protocol-version) orchestrator_protocol="$value" ;;
      migration-policy) migration_policy="$value" ;;
      approval-ref) approval_ref="$value" ;;
      *) return 2 ;;
    esac
  done
  [[ "$app_path" == "$REMOTE_APP_PATH" ]] || return 2
  release_record_is_sha "$candidate_commit" || return 2
  release_record_is_sha "$prepared_orchestrator" || return 2
  release_record_is_sha "$current_orchestrator" || return 2
  [[ "$orchestrator_protocol" == "$REMOTE_PROTOCOL_VERSION" ]] || return 2
  if [[ -n "$migration_policy" || -n "$approval_ref" ]]; then
    [[ -n "$migration_policy" && -n "$approval_ref" ]] || return 2
    [[ "$migration_policy" == 'backward-compatible' || "$migration_policy" == 'forward-only' ]] || return 2
    release_record_is_approval_ref "$approval_ref" || return 2
  fi
  REMOTE_EFFECTIVE_APP_PATH="$(remote_resolve_app_path "$app_path")" || return 2

  if [[ "$prefix" == 'locked' ]]; then
    remote_locked_activate \
      "$REMOTE_EFFECTIVE_APP_PATH" "$candidate_commit" "$prepared_orchestrator" \
      "$current_orchestrator" "$orchestrator_protocol" "$migration_policy" "$approval_ref"
  else
    locked_arguments=(
      "--candidate-commit=$candidate_commit"
      "--prepared-orchestrator-commit=$prepared_orchestrator"
      "--orchestrator-commit=$current_orchestrator"
      "--orchestrator-protocol-version=$orchestrator_protocol"
    )
    if [[ -n "$migration_policy" ]]; then
      locked_arguments+=("--migration-policy=$migration_policy" "--approval-ref=$approval_ref")
    fi
    remote_run_activate_with_lock "$REMOTE_EFFECTIVE_APP_PATH" "${locked_arguments[@]}"
  fi
}

remote_parse_prepare_options() {
  local prefix="$1"
  shift
  local argument name value
  local app_path='' candidate_archive='' candidate_sha='' candidate_commit=''
  local current_archive='' current_sha='' current_commit='' orchestrator_commit='' orchestrator_protocol=''
  local candidate_parent current_parent
  local -A seen=()

  for argument in "$@"; do
    [[ "$argument" == --*=* ]] || return 2
    name="${argument%%=*}"
    name="${name#--}"
    value="${argument#*=}"
    [[ -n "$name" && -n "$value" && -z "${seen[$name]:-}" ]] || return 2
    seen[$name]='true'
    case "$name" in
      app-path) app_path="$value" ;;
      candidate-archive-path) candidate_archive="$value" ;;
      candidate-sha256) candidate_sha="$value" ;;
      candidate-commit) candidate_commit="$value" ;;
      current-archive-path) current_archive="$value" ;;
      current-sha256) current_sha="$value" ;;
      current-commit) current_commit="$value" ;;
      orchestrator-commit) orchestrator_commit="$value" ;;
      orchestrator-protocol-version) orchestrator_protocol="$value" ;;
      *) return 2 ;;
    esac
  done
  [[ "$app_path" == "$REMOTE_APP_PATH" ]] || return 2
  [[ "$candidate_archive" =~ ^/tmp/chatwoot-client-portal-v2-staged\.[A-Za-z0-9]+/candidate\.tar\.gz$ ]] || return 2
  [[ "$current_archive" =~ ^/tmp/chatwoot-client-portal-v2-staged\.[A-Za-z0-9]+/current\.tar\.gz$ ]] || return 2
  candidate_parent="$(dirname -- "$candidate_archive")"
  current_parent="$(dirname -- "$current_archive")"
  [[ "$candidate_parent" == "$current_parent" && "$candidate_archive" != "$current_archive" ]] || return 2
  release_record_is_checksum "$candidate_sha" || return 2
  release_record_is_checksum "$current_sha" || return 2
  release_record_is_sha "$candidate_commit" || return 2
  release_record_is_sha "$current_commit" || return 2
  release_record_is_sha "$orchestrator_commit" || return 2
  [[ "$candidate_commit" != "$current_commit" && "$orchestrator_protocol" == "$REMOTE_PROTOCOL_VERSION" ]] || return 2
  REMOTE_EFFECTIVE_APP_PATH="$(remote_resolve_app_path "$app_path")" || return 2

  if [[ "$prefix" == 'locked' ]]; then
    remote_locked_prepare \
      "$REMOTE_EFFECTIVE_APP_PATH" "$candidate_archive" "$candidate_sha" "$candidate_commit" \
      "$current_archive" "$current_sha" "$current_commit" "$orchestrator_commit"
  else
    remote_run_prepare_with_lock "$REMOTE_EFFECTIVE_APP_PATH" \
      "--candidate-archive-path=$candidate_archive" \
      "--candidate-sha256=$candidate_sha" \
      "--candidate-commit=$candidate_commit" \
      "--current-archive-path=$current_archive" \
      "--current-sha256=$current_sha" \
      "--current-commit=$current_commit" \
      "--orchestrator-commit=$orchestrator_commit" \
      "--orchestrator-protocol-version=$orchestrator_protocol"
  fi
}

remote_parse_inspect_options() {
  local argument="${1:-}"
  local app_path

  (( $# == 1 )) || return 2
  [[ "$argument" == --app-path=* ]] || return 2
  app_path="${argument#*=}"
  [[ "$app_path" == "$REMOTE_APP_PATH" ]] || return 2
  REMOTE_EFFECTIVE_APP_PATH="$(remote_resolve_app_path "$app_path")" || return 2
  remote_run_inspect "$REMOTE_EFFECTIVE_APP_PATH"
}

remote_parse_prepared_inspect_options() {
  local argument name value
  local app_path='' candidate_commit=''
  local -A seen=()

  (( $# == 2 )) || return 2
  for argument in "$@"; do
    [[ "$argument" == --*=* ]] || return 2
    name="${argument%%=*}"
    name="${name#--}"
    value="${argument#*=}"
    [[ -n "$value" && -z "${seen[$name]:-}" ]] || return 2
    seen[$name]='true'
    case "$name" in
      app-path) app_path="$value" ;;
      candidate-commit) candidate_commit="$value" ;;
      *) return 2 ;;
    esac
  done
  [[ "$app_path" == "$REMOTE_APP_PATH" ]] || return 2
  release_record_is_sha "$candidate_commit" || return 2
  REMOTE_EFFECTIVE_APP_PATH="$(remote_resolve_app_path "$app_path")" || return 2
  remote_run_prepared_inspect "$REMOTE_EFFECTIVE_APP_PATH" "$candidate_commit"
}

remote_parse_options() {
  local prefix="$1"
  shift
  local argument name value
  local app_path='' archive_path='' archive_sha='' commit='' approval_ref=''
  local -A seen=()

  for argument in "$@"; do
    [[ "$argument" == --*=* ]] || return 2
    name="${argument%%=*}"
    name="${name#--}"
    value="${argument#*=}"
    [[ -n "$name" && -n "$value" && -z "${seen[$name]:-}" ]] || return 2
    seen[$name]='true'
    case "$name" in
      app-path) app_path="$value" ;;
      archive-path) archive_path="$value" ;;
      archive-sha256) archive_sha="$value" ;;
      commit) commit="$value" ;;
      approval-ref) approval_ref="$value" ;;
      *) return 2 ;;
    esac
  done

  [[ "$app_path" == "$REMOTE_APP_PATH" ]] || return 2
  [[ "$archive_path" =~ ^/tmp/chatwoot-client-portal-v2-staged\.[A-Za-z0-9]+/source\.tar\.gz$ ]] || return 2
  release_record_is_checksum "$archive_sha" || return 2
  release_record_is_sha "$commit" || return 2
  release_record_is_approval_ref "$approval_ref" || return 2
  REMOTE_EFFECTIVE_APP_PATH="$(remote_resolve_app_path "$app_path")" || return 2

  if [[ "$prefix" == 'locked' ]]; then
    remote_locked_bootstrap "$REMOTE_EFFECTIVE_APP_PATH" "$archive_path" "$archive_sha" "$commit" "$approval_ref"
  else
    remote_run_bootstrap_with_lock "$REMOTE_EFFECTIVE_APP_PATH" \
      "--archive-path=$archive_path" \
      "--archive-sha256=$archive_sha" \
      "--commit=$commit" \
      "--approval-ref=$approval_ref"
  fi
}

remote_main() {
  local phase="${1:-}"
  local parse_exit
  shift || true

  case "$phase" in
    bootstrap)
      if remote_parse_options public "$@"; then
        :
      else
        parse_exit=$?
        if (( parse_exit == 2 )); then
          remote_fail 'Invalid remote bootstrap arguments.' bootstrap_failed 2
        fi
        exit "$parse_exit"
      fi
      ;;
    __locked-bootstrap)
      remote_parse_options locked "$@" || remote_fail 'Invalid locked bootstrap arguments.' bootstrap_failed 2
      ;;
    prepare)
      REMOTE_FAILURE_STATUS='prepare_failed'
      if remote_parse_prepare_options public "$@"; then
        :
      else
        parse_exit=$?
        if (( parse_exit == 2 )); then
          remote_fail 'Invalid remote prepare arguments.' prepare_failed 2
        fi
        exit "$parse_exit"
      fi
      ;;
    __locked-prepare)
      REMOTE_FAILURE_STATUS='prepare_failed'
      remote_parse_prepare_options locked "$@" || {
        parse_exit=$?
        if (( parse_exit == 2 )); then
          remote_fail 'Invalid locked prepare arguments.' prepare_failed 2
        fi
        exit "$parse_exit"
      }
      ;;
    inspect)
      trap - ERR
      if ! remote_parse_inspect_options "$@"; then
        printf 'Current release inspection failed.\n' >&2
        exit 1
      fi
      exit 0
      ;;
    inspect-prepared)
      trap - ERR
      if ! remote_parse_prepared_inspect_options "$@"; then
        printf 'Prepared release inspection failed.\n' >&2
        exit 1
      fi
      exit 0
      ;;
    activate)
      REMOTE_FAILURE_STATUS='activation_refused_state_changed'
      if remote_parse_activate_options public "$@"; then
        :
      else
        parse_exit=$?
        if (( parse_exit == 2 )); then
          remote_fail 'Invalid remote activation arguments.' activation_refused_state_changed 2
        fi
        exit "$parse_exit"
      fi
      ;;
    __locked-activate)
      REMOTE_FAILURE_STATUS='activation_refused_state_changed'
      remote_parse_activate_options locked "$@" || {
        parse_exit=$?
        if (( parse_exit == 2 )); then
          remote_fail 'Invalid locked activation arguments.' activation_refused_state_changed 2
        fi
        exit "$parse_exit"
      }
      ;;
    __smoke-one)
      trap - ERR
      trap 'remote_cleanup_smoke_bodies || true; exit 129' HUP
      trap 'remote_cleanup_smoke_bodies || true; exit 130' INT
      trap 'remote_cleanup_smoke_bodies || true; exit 143' TERM
      if (( $# != 3 )); then
        exit 2
      fi
      set +e
      remote_smoke_one "$1" "$2" "$3"
      parse_exit=$?
      set -e
      remote_cleanup_smoke_bodies || true
      exit "$parse_exit"
      ;;
    *)
      remote_fail 'Unknown remote staged phase.' bootstrap_failed 2
      ;;
  esac
}

trap 'remote_on_error "$?" "$LINENO"' ERR
trap 'remote_on_signal 129' HUP
trap 'remote_on_signal 130' INT
trap 'remote_on_signal 143' TERM
trap 'remote_exit_cleanup' EXIT
remote_main "$@"
