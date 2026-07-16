#!/usr/bin/env bash
set -Eeuo pipefail

readonly STAGED_APP_NAME='chatwoot-client-portal-v2'
readonly STAGED_APP_PATH='/opt/chatwoot-client-portal-v2'
readonly STAGED_PROTOCOL_VERSION='1'
readonly STAGED_REMOTE_PREFIX='/tmp/chatwoot-client-portal-v2-staged.'

STAGED_STATUS_EMITTED='false'
STAGED_FAILURE_STATUS='prepare_failed'
STAGED_LOCAL_TEMP=''
STAGED_REMOTE_TEMP=''
STAGED_SSH_TARGET=''
STAGED_SSH_BIN_RESOLVED=''
STAGED_SCP_BIN_RESOLVED=''
STAGED_SSH_KEYGEN_BIN_RESOLVED=''
STAGED_PYTHON_BIN_RESOLVED=''
STAGED_SSH_OPTIONS=()
STAGED_SCP_OPTIONS=()

staged_usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-production-staged.sh prepare --host=user@host --ssh-port=22 --identity-file=PATH --app-path=/opt/chatwoot-client-portal-v2 --commit=FULL_SHA --known-hosts-file=PATH
  scripts/deploy-production-staged.sh activate --host=user@host --ssh-port=22 --identity-file=PATH --app-path=/opt/chatwoot-client-portal-v2 --commit=FULL_SHA --known-hosts-file=PATH [--migration-policy=backward-compatible|forward-only --approval-ref=REFERENCE]
  scripts/deploy-production-staged.sh bootstrap --host=user@host --ssh-port=22 --identity-file=PATH --app-path=/opt/chatwoot-client-portal-v2 --commit=FULL_SHA --known-hosts-file=PATH --approval-ref=REFERENCE
EOF
}

staged_emit_status() {
  local status="$1"

  if [[ "$STAGED_STATUS_EMITTED" == 'false' ]]; then
    printf 'status=%s\n' "$status"
    STAGED_STATUS_EMITTED='true'
  fi
}

staged_fail() {
  local message="$1"
  local exit_code="${2:-1}"
  local status="${3:-$STAGED_FAILURE_STATUS}"

  printf '%s\n' "$message" >&2
  staged_emit_status "$status"
  exit "$exit_code"
}

staged_on_error() {
  local exit_code="$1"
  local line="$2"

  if [[ "$STAGED_STATUS_EMITTED" == 'false' ]]; then
    printf 'Staged deployment stopped unexpectedly at line %s.\n' "$line" >&2
    staged_emit_status "$STAGED_FAILURE_STATUS"
  fi
  exit "$exit_code"
}

staged_is_test_mode() {
  [[ "${STAGED_TEST_MODE:-false}" == '1' ]]
}

staged_validate_test_root() {
  local root="${STAGED_TEST_ROOT:-}"
  local resolved

  [[ -n "$root" && -d "$root" && ! -L "$root" ]] || return 1
  resolved="$(realpath -e -- "$root")"
  [[ "$resolved" == /tmp/* && "$resolved" != '/tmp' ]]
}

staged_resolve_tool() {
  local variable_name="$1"
  local default_name="$2"
  local override="${!variable_name:-}"
  local resolved

  if staged_is_test_mode; then
    staged_validate_test_root || return 1
    [[ -n "$override" && "$override" == /* && -f "$override" && ! -L "$override" && -x "$override" ]] || return 1
    printf '%s\n' "$override"
    return
  fi

  [[ -z "$override" ]] || return 1
  resolved="$(command -v "$default_name")"
  [[ -n "$resolved" && -x "$resolved" ]] || return 1
  printf '%s\n' "$resolved"
}

staged_validate_archive() {
  local archive_path="$1"
  local python_bin="${STAGED_PYTHON_BIN_RESOLVED:-${STAGED_PYTHON_BIN:-python3}}"

  [[ -f "$archive_path" && ! -L "$archive_path" ]] || return 1
  "$python_bin" - "$archive_path" <<'PY'
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

staged_create_archive() {
  local repo_root="$1"
  local commit="$2"
  local output_path="$3"

  git -C "$repo_root" archive \
    --format=tar.gz \
    --output="$output_path" \
    "$commit"
}

staged_shell_join() {
  local output_variable="$1"
  shift
  local argument encoded joined=''

  for argument in "$@"; do
    printf -v encoded '%q' "$argument"
    joined+="${joined:+ }$encoded"
  done
  printf -v "$output_variable" '%s' "$joined"
}

staged_validate_owned_file() {
  local path="$1"
  local permission_mask="$2"
  local mode

  [[ -s "$path" && -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -c '%u' -- "$path")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' -- "$path")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & permission_mask) == 0 ))
}

staged_cleanup_local() {
  if [[ -n "$STAGED_LOCAL_TEMP" && -d "$STAGED_LOCAL_TEMP" && "$STAGED_LOCAL_TEMP" == /tmp/* ]]; then
    rm -rf -- "$STAGED_LOCAL_TEMP"
  fi
  STAGED_LOCAL_TEMP=''
}

staged_remote_path_is_valid() {
  local path="$1"
  [[ "$path" =~ ^/tmp/chatwoot-client-portal-v2-staged\.[A-Za-z0-9]+$ ]]
}

staged_cleanup_remote() {
  local command_text

  [[ -n "$STAGED_REMOTE_TEMP" ]] || return 0
  staged_remote_path_is_valid "$STAGED_REMOTE_TEMP" || return 1
  staged_shell_join command_text rm -rf -- "$STAGED_REMOTE_TEMP"
  "$STAGED_SSH_BIN_RESOLVED" \
    "${STAGED_SSH_OPTIONS[@]}" \
    "$STAGED_SSH_TARGET" \
    "$command_text" >/dev/null
  STAGED_REMOTE_TEMP=''
}

staged_cleanup_all() {
  local cleanup_status=0

  if [[ -n "$STAGED_REMOTE_TEMP" ]]; then
    staged_cleanup_remote || cleanup_status=$?
  fi
  staged_cleanup_local
  return "$cleanup_status"
}

staged_print_remote_output_without_status() {
  local output="$1"
  local line

  while IFS= read -r line; do
    [[ "$line" == status=* ]] && continue
    printf '%s\n' "$line"
  done <<<"$output"
}

staged_count_remote_status() {
  local output="$1"
  grep -Ec '^status=' <<<"$output" || true
}

staged_main() {
  local phase="${1:-}"
  shift || true
  local repo_root script_dir
  local ssh_target='' ssh_port='' identity_file='' app_path='' commit=''
  local known_hosts_file='' migration_policy='' approval_ref=''
  local argument name value host lookup archive_path archive_sha
  local remote_output remote_exit remote_status remote_command
  local remote_script records_script remote_count
  local -A seen=()

  case "$phase" in
    prepare)
      STAGED_FAILURE_STATUS='prepare_failed'
      ;;
    activate)
      STAGED_FAILURE_STATUS='activation_refused_state_changed'
      ;;
    bootstrap)
      STAGED_FAILURE_STATUS='bootstrap_failed'
      ;;
    *)
      staged_usage >&2
      staged_fail 'Phase must be prepare, activate, or bootstrap.' 2
      ;;
  esac

  for argument in "$@"; do
    [[ "$argument" == --*=* ]] || staged_fail "Invalid option shape: $argument" 2
    name="${argument%%=*}"
    name="${name#--}"
    value="${argument#*=}"
    [[ -n "$name" && -n "$value" ]] || staged_fail "Empty option: $argument" 2
    [[ -z "${seen[$name]:-}" ]] || staged_fail "Duplicate option: --$name" 2
    seen[$name]='true'
    case "$name" in
      host) ssh_target="$value" ;;
      ssh-port) ssh_port="$value" ;;
      identity-file) identity_file="$value" ;;
      app-path) app_path="$value" ;;
      commit) commit="$value" ;;
      known-hosts-file) known_hosts_file="$value" ;;
      migration-policy) migration_policy="$value" ;;
      approval-ref) approval_ref="$value" ;;
      *) staged_fail "Unknown option: --$name" 2 ;;
    esac
  done

  [[ -n "$ssh_target" && -n "$ssh_port" && -n "$identity_file" && -n "$app_path" &&
    -n "$commit" && -n "$known_hosts_file" ]] || staged_fail 'Required deployment options are missing.' 2

  if [[ "$phase" == 'bootstrap' ]]; then
    [[ -z "$migration_policy" ]] || staged_fail 'Bootstrap does not accept a migration policy.' 2
    [[ -n "$approval_ref" ]] || staged_fail 'Bootstrap requires --approval-ref.' 2
  elif [[ "$phase" == 'prepare' ]]; then
    [[ -z "$migration_policy" && -z "$approval_ref" ]] || staged_fail 'Prepare does not accept activation decisions.' 2
    staged_fail 'Prepare is unavailable until its complete invariant set is installed.' 1 prepare_failed
  else
    staged_fail 'Activate is unavailable until its complete invariant set is installed.' 1 activation_refused_state_changed
  fi

  [[ "$app_path" == "$STAGED_APP_PATH" ]] || staged_fail "Application path must be $STAGED_APP_PATH." 2
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || staged_fail 'Commit must be a full lowercase SHA.' 2
  [[ "$ssh_port" =~ ^[0-9]+$ ]] && (( ssh_port >= 1 && ssh_port <= 65535 )) ||
    staged_fail 'SSH port must be in 1..65535.' 2
  [[ "$ssh_target" =~ ^[A-Za-z_][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*$ ]] ||
    staged_fail 'SSH target must use validated user@host form.' 2
  [[ "$approval_ref" =~ ^[A-Za-z0-9._:/-]{1,128}$ ]] || staged_fail 'Approval reference is invalid.' 2

  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
  repo_root="$(cd -- "$script_dir/.." >/dev/null 2>&1 && pwd)"
  [[ "$(git -C "$repo_root" branch --show-current)" == 'main' ]] || staged_fail 'Local branch must be main.'
  [[ -z "$(git -C "$repo_root" status --short)" ]] || staged_fail 'Local main worktree must be clean.'
  git -C "$repo_root" cat-file -e "${commit}^{commit}" 2>/dev/null || staged_fail 'Commit does not exist locally.'
  git -C "$repo_root" fetch --prune origin main >/dev/null 2>&1 || staged_fail 'Unable to fetch origin/main.'
  [[ "$(git -C "$repo_root" rev-parse HEAD)" == "$(git -C "$repo_root" rev-parse origin/main)" ]] ||
    staged_fail 'Local main HEAD must exactly equal fetched origin/main.'
  git -C "$repo_root" merge-base --is-ancestor "$commit" origin/main || staged_fail 'Commit is not contained in origin/main.'

  staged_validate_owned_file "$identity_file" 63 || staged_fail 'Identity file must be owned, private, regular, and non-empty.'
  staged_validate_owned_file "$known_hosts_file" 18 || staged_fail 'Known-hosts file must be owned, non-writable by group/other, regular, and non-empty.'

  STAGED_SSH_BIN_RESOLVED="$(staged_resolve_tool STAGED_SSH_BIN ssh)" || staged_fail 'SSH executable is unavailable or unsafe.'
  STAGED_SCP_BIN_RESOLVED="$(staged_resolve_tool STAGED_SCP_BIN scp)" || staged_fail 'SCP executable is unavailable or unsafe.'
  STAGED_SSH_KEYGEN_BIN_RESOLVED="$(staged_resolve_tool STAGED_SSH_KEYGEN_BIN ssh-keygen)" || staged_fail 'ssh-keygen executable is unavailable or unsafe.'
  if staged_is_test_mode; then
    STAGED_PYTHON_BIN_RESOLVED="${STAGED_PYTHON_BIN:-$(command -v python3)}"
  else
    [[ -z "${STAGED_PYTHON_BIN:-}" ]] || staged_fail 'Python override is test-only.'
    STAGED_PYTHON_BIN_RESOLVED="$(command -v python3)"
  fi
  [[ -x "$STAGED_PYTHON_BIN_RESOLVED" ]] || staged_fail 'Python 3 is required.'

  host="${ssh_target#*@}"
  lookup="$host"
  [[ "$ssh_port" == '22' ]] || lookup="[$host]:$ssh_port"
  "$STAGED_SSH_KEYGEN_BIN_RESOLVED" -F "$lookup" -f "$known_hosts_file" >/dev/null ||
    staged_fail 'Known-hosts file has no verified entry for the exact host and port.'

  STAGED_SSH_TARGET="$ssh_target"
  STAGED_SSH_OPTIONS=(
    -o BatchMode=yes
    -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=$known_hosts_file"
    -o IdentitiesOnly=yes
    -i "$identity_file"
    -p "$ssh_port"
  )
  STAGED_SCP_OPTIONS=(
    -o BatchMode=yes
    -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=$known_hosts_file"
    -o IdentitiesOnly=yes
    -i "$identity_file"
    -P "$ssh_port"
  )

  umask 077
  STAGED_LOCAL_TEMP="$(mktemp -d /tmp/chatwoot-client-portal-v2-local.XXXXXX)"
  archive_path="$STAGED_LOCAL_TEMP/source.tar.gz"
  staged_create_archive "$repo_root" "$commit" "$archive_path"
  staged_validate_archive "$archive_path" || staged_fail 'Candidate archive contains an unsafe member.'
  archive_sha="$(sha256sum "$archive_path" | awk '{print $1}')"
  [[ "$archive_sha" =~ ^[0-9a-f]{64}$ ]] || staged_fail 'Unable to calculate archive checksum.'

  STAGED_REMOTE_TEMP="$(
    "$STAGED_SSH_BIN_RESOLVED" \
      "${STAGED_SSH_OPTIONS[@]}" \
      "$STAGED_SSH_TARGET" \
      'umask 077; mktemp -d /tmp/chatwoot-client-portal-v2-staged.XXXXXX'
  )" || staged_fail 'Unable to create remote delivery directory.'
  staged_remote_path_is_valid "$STAGED_REMOTE_TEMP" || staged_fail 'Remote delivery directory response is invalid.'

  remote_script="$script_dir/production-staged-release-remote.sh"
  records_script="$script_dir/production-release-records.sh"
  "$STAGED_SCP_BIN_RESOLVED" \
    "${STAGED_SCP_OPTIONS[@]}" \
    "$archive_path" "$remote_script" "$records_script" \
    "$STAGED_SSH_TARGET:$STAGED_REMOTE_TEMP/" || staged_fail 'Unable to upload staged release inputs.'

  staged_shell_join remote_command \
    "$STAGED_REMOTE_TEMP/production-staged-release-remote.sh" \
    bootstrap \
    "--app-path=$app_path" \
    "--archive-path=$STAGED_REMOTE_TEMP/source.tar.gz" \
    "--archive-sha256=$archive_sha" \
    "--commit=$commit" \
    "--approval-ref=$approval_ref"

  if remote_output="$("$STAGED_SSH_BIN_RESOLVED" "${STAGED_SSH_OPTIONS[@]}" "$STAGED_SSH_TARGET" "$remote_command" 2>&1)"; then
    remote_exit=0
  else
    remote_exit=$?
  fi
  remote_count="$(staged_count_remote_status "$remote_output")"
  [[ "$remote_count" == '1' ]] || staged_fail 'Remote helper returned an invalid status record.'
  remote_status="$(grep -E '^status=' <<<"$remote_output" | cut -d= -f2-)"
  staged_print_remote_output_without_status "$remote_output"

  staged_cleanup_remote || staged_fail 'Remote delivery cleanup failed.'
  staged_cleanup_local

  if (( remote_exit == 0 )) && [[ "$remote_status" == 'bootstrap_completed' ]]; then
    staged_emit_status bootstrap_completed
    return 0
  fi

  case "$remote_status" in
    bootstrap_refused_nonempty|bootstrap_failed)
      staged_emit_status "$remote_status"
      ;;
    *)
      staged_emit_status bootstrap_failed
      ;;
  esac
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  trap 'staged_on_error "$?" "$LINENO"' ERR
  trap 'staged_cleanup_all || true' EXIT
  staged_main "$@"
fi
