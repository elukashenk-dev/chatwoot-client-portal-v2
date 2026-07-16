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
  if [[ "$REMOTE_STATUS_EMITTED" == 'false' ]]; then
    printf 'Remote staged helper stopped unexpectedly at line %s.\n' "$line" >&2
    remote_emit_status "$REMOTE_FAILURE_STATUS"
  fi
  exit "$exit_code"
}

remote_is_test_mode() {
  [[ "${STAGED_TEST_MODE:-false}" == '1' ]]
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

  if [[ -L "$app_path" ]]; then
    return 1
  fi
  if [[ -e "$app_path" && ! -d "$app_path" ]]; then
    return 1
  fi
  if [[ -d "$app_path" && -n "$(find "$app_path" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    return 1
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
    prepare|activate|inspect|__locked-prepare|__locked-activate|__smoke-one)
      remote_fail "Remote phase is not available yet: $phase" bootstrap_failed
      ;;
    *)
      remote_fail 'Unknown remote staged phase.' bootstrap_failed 2
      ;;
  esac
}

trap 'remote_on_error "$?" "$LINENO"' ERR
remote_main "$@"
