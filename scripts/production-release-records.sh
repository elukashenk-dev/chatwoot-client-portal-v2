#!/usr/bin/env bash
set -Eeuo pipefail

readonly RELEASE_APP_NAME='chatwoot-client-portal-v2'
readonly RELEASE_PROTOCOL_VERSION='1'
readonly RELEASE_RECORD_MAX_BYTES='65536'

release_record_is_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]
}

release_record_is_checksum() {
  [[ "${1:-}" =~ ^[0-9a-f]{64}$ ]]
}

release_record_is_timestamp() {
  [[ "${1:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]
}

release_record_is_approval_ref() {
  [[ "${1:-}" =~ ^[A-Za-z0-9._:/-]{1,128}$ ]]
}

release_record_require_owned_regular_file() {
  local path="${1:-}"
  local mode

  [[ -n "$path" && -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -c '%u' -- "$path")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' -- "$path")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 0022) == 0 ))
}

release_record_require_private_file() {
  local path="${1:-}"

  release_record_require_owned_regular_file "$path" || return 1
  [[ "$(stat -c '%a' -- "$path")" == '600' ]]
}

release_record_require_bounded_text() {
  local path="${1:-}"
  local size

  release_record_require_owned_regular_file "$path" || return 1
  size="$(stat -c '%s' -- "$path")"
  [[ "$size" =~ ^[0-9]+$ ]] || return 1
  (( size > 0 && size <= RELEASE_RECORD_MAX_BYTES )) || return 1
  [[ "$(tail -c 1 -- "$path")" == '' ]] || return 1
  ! LC_ALL=C grep -q $'[\001-\010\013\014\016-\037\177]' "$path" || return 1
  ! LC_ALL=C grep -q $'[\t\r]' "$path"
}

release_record_validate_structure() {
  local path="${1:-}"

  release_record_require_bounded_text "$path" || return 1
  release_record_require_private_file "$path" || return 1

  LC_ALL=C awk '
    BEGIN { valid = 1 }
    {
      if ($0 == "") { valid = 0; exit }
      separator = index($0, "=")
      if (separator < 2) { valid = 0; exit }
      key = substr($0, 1, separator - 1)
      if (key !~ /^[a-z][a-z0-9_]*$/ || seen[key]++) { valid = 0; exit }
    }
    END { exit valid ? 0 : 1 }
  ' "$path"
}

release_record_get_unique() {
  local path="${1:-}"
  local key="${2:-}"

  [[ "$key" =~ ^[a-z][a-z0-9_]*$ ]] || return 1
  release_record_validate_structure "$path" || return 1

  LC_ALL=C awk -v wanted="$key" '
    index($0, wanted "=") == 1 {
      count++
      value = substr($0, length(wanted) + 2)
    }
    END {
      if (count != 1) exit 1
      print value
    }
  ' "$path"
}

release_record_validate_keys() {
  local path="${1:-}"
  shift || return 1
  local allowed_file key

  (( $# > 0 )) || return 1
  release_record_validate_structure "$path" || return 1

  allowed_file="$(mktemp)"
  chmod 0600 "$allowed_file"
  for key in "$@"; do
    if [[ ! "$key" =~ ^[a-z][a-z0-9_]*$ ]]; then
      rm -f -- "$allowed_file"
      return 1
    fi
    printf '%s\n' "$key" >>"$allowed_file"
  done

  if ! LC_ALL=C awk -F= '
    NR == FNR { allowed[$1] = 1; next }
    !($1 in allowed) { exit 1 }
  ' "$allowed_file" "$path"; then
    rm -f -- "$allowed_file"
    return 1
  fi

  rm -f -- "$allowed_file"
}

release_record_write_atomic() {
  local mode="${1:-}"
  local path="${2:-}"
  local parent temporary

  [[ "$mode" == 'replace' || "$mode" == 'create' ]] || return 2
  [[ -n "$path" && "$path" != */ && "$(basename -- "$path")" != '.' ]] || return 2
  parent="$(dirname -- "$path")"
  [[ -d "$parent" && ! -L "$parent" ]] || return 1
  [[ "$(stat -c '%u' -- "$parent")" == "$(id -u)" ]] || return 1
  [[ ! -L "$path" ]] || return 1

  umask 077
  temporary="$(mktemp "$parent/.release-record.XXXXXX")"
  if ! cat >"$temporary"; then
    rm -f -- "$temporary"
    return 1
  fi
  chmod 0600 "$temporary"

  if ! release_record_validate_structure "$temporary"; then
    rm -f -- "$temporary"
    return 1
  fi

  if [[ "$mode" == 'create' ]]; then
    if ! ln -- "$temporary" "$path"; then
      rm -f -- "$temporary"
      return 1
    fi
    rm -f -- "$temporary"
  else
    if ! mv -T -- "$temporary" "$path"; then
      rm -f -- "$temporary"
      return 1
    fi
  fi
}

release_marker_validate_bootstrap() {
  local path="${1:-}"
  local protocol kind app commit checksum timestamp approval

  release_record_validate_keys "$path" \
    protocol_version record_kind app source_commit archive_sha256 created_at_utc approval_ref || return 1

  protocol="$(release_record_get_unique "$path" protocol_version)"
  kind="$(release_record_get_unique "$path" record_kind)"
  app="$(release_record_get_unique "$path" app)"
  commit="$(release_record_get_unique "$path" source_commit)"
  checksum="$(release_record_get_unique "$path" archive_sha256)"
  timestamp="$(release_record_get_unique "$path" created_at_utc)"
  approval="$(release_record_get_unique "$path" approval_ref)"

  [[ "$protocol" == "$RELEASE_PROTOCOL_VERSION" ]] || return 1
  [[ "$kind" == 'bootstrap_source' ]] || return 1
  [[ "$app" == "$RELEASE_APP_NAME" ]] || return 1
  release_record_is_sha "$commit" || return 1
  release_record_is_checksum "$checksum" || return 1
  release_record_is_timestamp "$timestamp" || return 1
  release_record_is_approval_ref "$approval"
}

release_marker_write_bootstrap() {
  local path="${1:-}"
  local commit="${2:-}"
  local checksum="${3:-}"
  local timestamp="${4:-}"
  local approval="${5:-}"

  release_record_is_sha "$commit" || return 2
  release_record_is_checksum "$checksum" || return 2
  release_record_is_timestamp "$timestamp" || return 2
  release_record_is_approval_ref "$approval" || return 2

  if ! printf '%s\n' \
    "protocol_version=$RELEASE_PROTOCOL_VERSION" \
    'record_kind=bootstrap_source' \
    "app=$RELEASE_APP_NAME" \
    "source_commit=$commit" \
    "archive_sha256=$checksum" \
    "created_at_utc=$timestamp" \
    "approval_ref=$approval" |
    release_record_write_atomic create "$path"; then
    return 1
  fi

  release_marker_validate_bootstrap "$path"
}

release_marker_validate_active() {
  local path="${1:-}"
  local protocol kind app commit checksum timestamp

  release_record_validate_keys "$path" \
    protocol_version record_kind app source_commit archive_sha256 activated_at_utc || return 1

  protocol="$(release_record_get_unique "$path" protocol_version)"
  kind="$(release_record_get_unique "$path" record_kind)"
  app="$(release_record_get_unique "$path" app)"
  commit="$(release_record_get_unique "$path" source_commit)"
  checksum="$(release_record_get_unique "$path" archive_sha256)"
  timestamp="$(release_record_get_unique "$path" activated_at_utc)"

  [[ "$protocol" == "$RELEASE_PROTOCOL_VERSION" ]] || return 1
  [[ "$kind" == 'active_source' ]] || return 1
  [[ "$app" == "$RELEASE_APP_NAME" ]] || return 1
  release_record_is_sha "$commit" || return 1
  release_record_is_checksum "$checksum" || return 1
  release_record_is_timestamp "$timestamp"
}

release_marker_promote_bootstrap() {
  local bootstrap_path="${1:-}"
  local active_path="${2:-}"
  local activated_at="${3:-}"
  local commit checksum

  release_marker_validate_bootstrap "$bootstrap_path" || return 1
  release_record_is_timestamp "$activated_at" || return 2
  [[ ! -e "$active_path" && ! -L "$active_path" ]] || return 1
  commit="$(release_record_get_unique "$bootstrap_path" source_commit)"
  checksum="$(release_record_get_unique "$bootstrap_path" archive_sha256)"

  if ! printf '%s\n' \
    "protocol_version=$RELEASE_PROTOCOL_VERSION" \
    'record_kind=active_source' \
    "app=$RELEASE_APP_NAME" \
    "source_commit=$commit" \
    "archive_sha256=$checksum" \
    "activated_at_utc=$activated_at" |
    release_record_write_atomic create "$active_path"; then
    return 1
  fi

  release_marker_validate_active "$active_path" || return 1
  rm -f -- "$bootstrap_path"
}

release_marker_read_legacy_commit() {
  local path="${1:-}"
  local -a lines=()
  local created_at commit

  release_record_require_bounded_text "$path" || return 1
  mapfile -t lines <"$path"
  (( ${#lines[@]} == 10 )) || return 1

  [[ "${lines[0]}" == "app=$RELEASE_APP_NAME" ]] || return 1
  [[ "${lines[1]}" == created_at_utc=* ]] || return 1
  [[ "${lines[2]}" == 'source_branch=main' ]] || return 1
  [[ "${lines[3]}" == source_commit=* ]] || return 1
  [[ "${lines[4]}" == 'source_dirty=false' ]] || return 1
  [[ "${lines[5]}" == 'allow_dirty_preview=false' ]] || return 1
  [[ "${lines[6]}" == 'preview_label=' ]] || return 1
  [[ -z "${lines[7]}" ]] || return 1
  [[ "${lines[8]}" == 'git_status_short:' ]] || return 1
  [[ "${lines[9]}" == '(clean)' ]] || return 1

  created_at="${lines[1]#created_at_utc=}"
  commit="${lines[3]#source_commit=}"
  release_record_is_timestamp "$created_at" || return 1
  release_record_is_sha "$commit" || return 1
  printf '%s\n' "$commit"
}

release_marker_read_active_commit() {
  local path="${1:-}"
  local allow_legacy="${2:-false}"

  [[ "$allow_legacy" == 'true' || "$allow_legacy" == 'false' ]] || return 2
  release_record_require_bounded_text "$path" || return 1

  if grep -Fxq 'record_kind=active_source' "$path"; then
    release_marker_validate_active "$path" || return 1
    release_record_get_unique "$path" source_commit
    return
  fi

  [[ "$allow_legacy" == 'true' ]] || return 1
  release_marker_read_legacy_commit "$path"
}
