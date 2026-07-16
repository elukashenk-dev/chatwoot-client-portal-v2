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
REMOTE_PREPARE_OWNED_TAG_REFS=()
REMOTE_PREPARE_ADOPTION_DIR=''
REMOTE_PREPARE_ADOPTION_VERIFIED='false'
REMOTE_PREPARE_ADOPTION_CREATED_TAGS=()
REMOTE_PREPARE_ENV_TEMP=''
REMOTE_EXIT_CLEANUP_RUNNING='false'

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
  if [[ -n "$REMOTE_PREPARE_ENV_TEMP" ]]; then
    if [[ "$REMOTE_PREPARE_ENV_TEMP" == /tmp/chatwoot-client-portal-v2-env-check.* &&
      -d "$REMOTE_PREPARE_ENV_TEMP" && ! -L "$REMOTE_PREPARE_ENV_TEMP" ]]; then
      rm -rf -- "$REMOTE_PREPARE_ENV_TEMP"
    fi
    REMOTE_PREPARE_ENV_TEMP=''
  fi
}

remote_exit_cleanup() {
  [[ "$REMOTE_EXIT_CLEANUP_RUNNING" == 'false' ]] || return 0
  REMOTE_EXIT_CLEANUP_RUNNING='true'
  remote_cleanup_env_temp || true
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

  actual="$(remote_image_id "$reference")" || return 1
  [[ "$actual" == "$expected_id" ]] || return 1
  "${REMOTE_DOCKER[@]}" image rm "$reference" >/dev/null || return 1
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

  remote_inspect_current "$app_path" || return 1
  printf '%s\n' \
    "protocol_version=$REMOTE_PROTOCOL_VERSION" \
    'record_kind=current_inspection' \
    "current_commit=$REMOTE_INSPECT_CURRENT" \
    "staged_current=$REMOTE_INSPECT_STAGED"
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
  [[ ! -e "$state_dir/transaction" && ! -L "$state_dir/transaction" ]] || return 1

  remote_find_paths state_entries "$state_dir" -mindepth 1 -maxdepth 1 || return 1
  for entry in "${state_entries[@]}"; do
    name="$(basename -- "$entry")"
    case "$name" in
      deploy.lock|adoption|current|previous|prepared) [[ -f "$entry" && ! -L "$entry" ]] || return 1 ;;
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
  if [[ -n "$current" ]]; then
    [[ -z "$adoption" ]] || return 1
  else
    [[ -z "$previous" ]] || return 1
  fi
  [[ -z "$current" || -z "$previous" || "$current" != "$previous" ]] || return 1

  remote_find_paths release_entries "$releases_dir" -mindepth 1 -maxdepth 1 || return 1
  for entry in "${release_entries[@]}"; do
    name="$(basename -- "$entry")"
    remote_require_private_directory "$entry" || return 1
    release_record_is_sha "$name" || return 1
    [[ "$name" == "$current" || "$name" == "$previous" || "$name" == "$adoption" ||
      "$name" == "$prepared" ]] || return 1
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
    for reference in "${REMOTE_PREPARE_OWNED_TAG_REFS[@]}"; do
      if remote_image_id "$reference" >/dev/null 2>&1; then
        "${REMOTE_DOCKER[@]}" image rm "$reference" >/dev/null 2>&1 || true
      fi
    done
    if [[ "$REMOTE_PREPARE_ADOPTION_VERIFIED" == 'false' ]]; then
      for item in "${REMOTE_PREPARE_ADOPTION_CREATED_TAGS[@]}"; do
        reference="${item%%=*}"
        expected_id="${item#*=}"
        if [[ "$(remote_image_id "$reference" 2>/dev/null || true)" == "$expected_id" ]]; then
          "${REMOTE_DOCKER[@]}" image rm "$reference" >/dev/null 2>&1 || true
        fi
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
  chmod 0700 "$temporary"
  REMOTE_PREPARE_ENV_TEMP="$temporary"
  copy="$temporary/.env.production"
  helper_log="$temporary/helper.log"
  cp -- "$env_file" "$copy" || {
    remote_cleanup_env_temp
    return 1
  }
  chmod 0600 "$copy"
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
    remote_cleanup_env_temp
    [[ -n "$changes" ]] && printf '%s\n' "$changes" >&2
    return 1
  fi
  remote_cleanup_env_temp
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
readonly REMOTE_TENANT_SQL="SELECT slug, public_base_url
FROM portal_tenants
WHERE status = 'active'
ORDER BY slug
LIMIT 101;"
remote_query_tenant_matrix() {
  local output_path="$1"
  local raw_path="$2"

  "${REMOTE_COMPOSE[@]}" exec -T portal-db sh -ceu \
    'exec psql -X -v ON_ERROR_STOP=1 -A -t -F "$(printf "\t")" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' \
    sh "$REMOTE_TENANT_SQL" >"$raw_path" || return 1
  "$REMOTE_PYTHON_BIN" - "$raw_path" "$output_path" <<'PY'
import pathlib
import re
import sys
import urllib.parse

source, destination = map(pathlib.Path, sys.argv[1:])
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
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug in seen:
        raise SystemExit(1)
    try:
        parsed = urllib.parse.urlsplit(origin)
        port = parsed.port
    except ValueError:
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
destination.write_text("".join(f"{slug}\t{origin}\n" for slug, origin in rows), encoding="utf-8")
PY
  chmod 0600 "$output_path"
  REMOTE_TENANT_COUNT="$(wc -l <"$output_path" | tr -d ' ')"
  [[ "$REMOTE_TENANT_COUNT" =~ ^[0-9]+$ ]] || return 1
  (( REMOTE_TENANT_COUNT >= 1 && REMOTE_TENANT_COUNT <= 100 )) || return 1
  REMOTE_TENANT_MATRIX_SHA="$(sha256sum "$output_path" | awk '{print $1}')"
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
  REMOTE_PREPARE_OWNED_TAG_REFS=()
  REMOTE_PREPARE_ADOPTION_DIR=''
  REMOTE_PREPARE_ADOPTION_VERIFIED='false'
  REMOTE_PREPARE_ADOPTION_CREATED_TAGS=()

  remote_select_docker || remote_prepare_abort 'Docker access is unavailable.'
  REMOTE_PYTHON_BIN="$(remote_select_python)" || remote_prepare_abort 'Python 3 is unavailable.'
  for required in tar sha256sum find stat flock diff cmp date df awk sort wc tr grep mktemp chmod cp rm; do
    command -v "$required" >/dev/null || remote_prepare_abort "Required command is missing: $required"
  done
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
    REMOTE_PREPARE_OWNED_TAG_REFS+=("$tag")
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
    activate|__locked-activate|__smoke-one)
      remote_fail "Remote phase is not available yet: $phase" activation_refused_state_changed
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
