#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
RECORDS_SCRIPT="$REPO_ROOT/scripts/production-release-records.sh"
INSTALL_SCRIPT="$REPO_ROOT/scripts/install-production.sh"
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

if [[ ! -r "$RECORDS_SCRIPT" ]]; then
  fail "missing release records helper: $RECORDS_SCRIPT"
fi

# shellcheck source=scripts/production-release-records.sh
source "$RECORDS_SCRIPT"

VALID_COMMIT="$(printf 'a%.0s' {1..40})"
VALID_CHECKSUM="$(printf 'b%.0s' {1..64})"
VALID_TIMESTAMP='2026-07-16T12:00:00Z'
VALID_APPROVAL='clean-reinstall-approved'

case_dir() {
  local name="$1"
  local path="$TMP_DIR/$name"
  mkdir -p "$path"
  printf '%s\n' "$path"
}

write_legacy_marker() {
  local path="$1"
  local dirty="${2:-false}"
  local allow_preview="${3:-false}"
  local preview_label="${4:-}"

  printf '%s\n' \
    'app=chatwoot-client-portal-v2' \
    "created_at_utc=$VALID_TIMESTAMP" \
    'source_branch=main' \
    "source_commit=$VALID_COMMIT" \
    "source_dirty=$dirty" \
    "allow_dirty_preview=$allow_preview" \
    "preview_label=$preview_label" \
    '' \
    'git_status_short:' \
    '(clean)' >"$path"
  chmod 0644 "$path"
}

bootstrap_marker_is_mode_600_and_valid() {
  local dir marker
  dir="$(case_dir "$FUNCNAME")"
  marker="$dir/BOOTSTRAP_SOURCE.txt"

  release_marker_write_bootstrap \
    "$marker" \
    "$VALID_COMMIT" \
    "$VALID_CHECKSUM" \
    "$VALID_TIMESTAMP" \
    "$VALID_APPROVAL"

  [[ "$(stat -c '%a' "$marker")" == '600' ]] || fail 'bootstrap marker must be mode 600'
  release_marker_validate_bootstrap "$marker"
  [[ "$(release_record_get_unique "$marker" source_commit)" == "$VALID_COMMIT" ]] ||
    fail 'bootstrap marker commit mismatch'
}

duplicate_or_unknown_key_is_rejected() {
  local dir duplicate unknown
  dir="$(case_dir "$FUNCNAME")"
  duplicate="$dir/duplicate.txt"
  unknown="$dir/unknown.txt"

  printf 'alpha=one\nalpha=two\n' >"$duplicate"
  printf 'alpha=one\nrogue=two\n' >"$unknown"
  chmod 0600 "$duplicate" "$unknown"

  assert_fails release_record_validate_keys "$duplicate" alpha
  assert_fails release_record_validate_keys "$unknown" alpha
  assert_fails release_record_get_unique "$duplicate" alpha
}

malformed_sha_checksum_timestamp_and_approval_are_rejected() {
  local dir
  dir="$(case_dir "$FUNCNAME")"

  assert_fails release_marker_write_bootstrap \
    "$dir/short-sha" short "$VALID_CHECKSUM" "$VALID_TIMESTAMP" "$VALID_APPROVAL"
  assert_fails release_marker_write_bootstrap \
    "$dir/bad-checksum" "$VALID_COMMIT" bad "$VALID_TIMESTAMP" "$VALID_APPROVAL"
  assert_fails release_marker_write_bootstrap \
    "$dir/bad-time" "$VALID_COMMIT" "$VALID_CHECKSUM" '2026-07-16 12:00:00' "$VALID_APPROVAL"
  assert_fails release_marker_write_bootstrap \
    "$dir/bad-approval" "$VALID_COMMIT" "$VALID_CHECKSUM" "$VALID_TIMESTAMP" 'contains space'
}

promotion_writes_active_marker_before_removing_bootstrap_marker() {
  local dir bootstrap active observer
  dir="$(case_dir "$FUNCNAME")"
  bootstrap="$dir/BOOTSTRAP_SOURCE.txt"
  active="$dir/DEPLOY_SOURCE.txt"
  observer="$dir/removal-observed"

  release_marker_write_bootstrap \
    "$bootstrap" "$VALID_COMMIT" "$VALID_CHECKSUM" "$VALID_TIMESTAMP" "$VALID_APPROVAL"

  rm() {
    local last_argument="${!#}"
    if [[ "${1:-}" == '-f' && "$last_argument" == "$bootstrap" ]]; then
      [[ -f "$active" ]] || fail 'bootstrap marker removal happened before active marker publication'
      printf 'observed\n' >"$observer"
    fi
    command rm "$@"
  }

  release_marker_promote_bootstrap "$bootstrap" "$active" '2026-07-16T12:30:00Z'
  unset -f rm

  [[ -f "$observer" ]] || fail 'bootstrap marker removal was not observed'
  [[ ! -e "$bootstrap" ]] || fail 'bootstrap marker must be removed after promotion'
  [[ "$(release_marker_read_active_commit "$active" false)" == "$VALID_COMMIT" ]] ||
    fail 'active marker commit mismatch after promotion'
}

failed_promotion_preserves_bootstrap_marker() {
  local dir bootstrap active
  dir="$(case_dir "$FUNCNAME")"
  bootstrap="$dir/BOOTSTRAP_SOURCE.txt"
  active="$dir/missing-parent/DEPLOY_SOURCE.txt"

  release_marker_write_bootstrap \
    "$bootstrap" "$VALID_COMMIT" "$VALID_CHECKSUM" "$VALID_TIMESTAMP" "$VALID_APPROVAL"

  assert_fails release_marker_promote_bootstrap "$bootstrap" "$active" '2026-07-16T12:30:00Z'
  [[ -f "$bootstrap" ]] || fail 'failed promotion must preserve bootstrap marker'
}

promotion_refuses_to_replace_an_existing_active_marker() {
  local dir bootstrap active existing_commit
  dir="$(case_dir "$FUNCNAME")"
  bootstrap="$dir/BOOTSTRAP_SOURCE.txt"
  active="$dir/DEPLOY_SOURCE.txt"
  existing_commit="$(printf 'c%.0s' {1..40})"

  release_marker_write_bootstrap \
    "$bootstrap" "$VALID_COMMIT" "$VALID_CHECKSUM" "$VALID_TIMESTAMP" "$VALID_APPROVAL"
  printf '%s\n' \
    'protocol_version=1' \
    'record_kind=active_source' \
    'app=chatwoot-client-portal-v2' \
    "source_commit=$existing_commit" \
    "archive_sha256=$VALID_CHECKSUM" \
    'activated_at_utc=2026-07-16T11:00:00Z' |
    release_record_write_atomic create "$active"

  assert_fails release_marker_promote_bootstrap "$bootstrap" "$active" '2026-07-16T12:30:00Z'
  [[ -f "$bootstrap" ]] || fail 'refused promotion must preserve bootstrap marker'
  [[ "$(release_marker_read_active_commit "$active" false)" == "$existing_commit" ]] ||
    fail 'refused promotion must preserve the existing active marker'
}

legacy_clean_marker_is_allowed_only_when_allow_legacy_is_true() {
  local dir marker
  dir="$(case_dir "$FUNCNAME")"
  marker="$dir/DEPLOY_SOURCE.txt"
  write_legacy_marker "$marker"

  [[ "$(release_marker_read_active_commit "$marker" true)" == "$VALID_COMMIT" ]] ||
    fail 'clean legacy marker commit mismatch'
  assert_fails release_marker_read_active_commit "$marker" false
}

dirty_or_preview_legacy_marker_is_rejected() {
  local dir dirty preview
  dir="$(case_dir "$FUNCNAME")"
  dirty="$dir/dirty.txt"
  preview="$dir/preview.txt"
  write_legacy_marker "$dirty" true false ''
  write_legacy_marker "$preview" false true 'wip-preview'

  assert_fails release_marker_read_active_commit "$dirty" true
  assert_fails release_marker_read_active_commit "$preview" true
}

installer_rejects_skip_public_health_before_creating_install_state() {
  local dir install_root log
  dir="$(case_dir "$FUNCNAME")"
  install_root="$dir/install-root"
  log="$dir/skip.log"
  mkdir -p "$install_root/scripts"
  cp "$INSTALL_SCRIPT" "$install_root/scripts/install-production.sh"
  cp "$RECORDS_SCRIPT" "$install_root/scripts/production-release-records.sh"

  release_marker_write_bootstrap \
    "$install_root/BOOTSTRAP_SOURCE.txt" \
    "$VALID_COMMIT" \
    "$VALID_CHECKSUM" \
    "$VALID_TIMESTAMP" \
    "$VALID_APPROVAL"

  if INSTALL_STATE_DIR="$install_root/.install" \
    INSTALL_LOG_DIR="$install_root/logs" \
    "$install_root/scripts/install-production.sh" \
    --install --skip-public-health >"$log" 2>&1; then
    fail 'bootstrap install must reject --skip-public-health'
  fi

  grep -Fq 'Bootstrap installation requires public health and tenant checks.' "$log" ||
    fail 'bootstrap skip-health refusal message is missing'
  [[ ! -e "$install_root/.install" ]] || fail 'bootstrap guard must run before installer state creation'
  [[ ! -e "$install_root/logs" ]] || fail 'bootstrap guard must run before installer log creation'
}

installer_calls_promotion_after_maintenance_cleanup_step() {
  local maintenance_line finalize_line summary_line

  maintenance_line="$(grep -Fn 'run_step maintenance_cleanup_timer' "$INSTALL_SCRIPT" | tail -n1 | cut -d: -f1)"
  finalize_line="$(grep -Fn 'finalize_bootstrap_source' "$INSTALL_SCRIPT" | tail -n1 | cut -d: -f1)"
  summary_line="$(grep -Fn 'print_summary' "$INSTALL_SCRIPT" | tail -n1 | cut -d: -f1)"

  [[ -n "$maintenance_line" && -n "$finalize_line" && -n "$summary_line" ]] ||
    fail 'installer completion ordering anchors are missing'
  (( maintenance_line < finalize_line && finalize_line < summary_line )) ||
    fail 'bootstrap promotion must run after maintenance cleanup and before summary'
}

run_case() {
  local name="$1"
  "$name"
  printf 'PASS %s\n' "$name"
}

run_case bootstrap_marker_is_mode_600_and_valid
run_case duplicate_or_unknown_key_is_rejected
run_case malformed_sha_checksum_timestamp_and_approval_are_rejected
run_case promotion_writes_active_marker_before_removing_bootstrap_marker
run_case failed_promotion_preserves_bootstrap_marker
run_case promotion_refuses_to_replace_an_existing_active_marker
run_case legacy_clean_marker_is_allowed_only_when_allow_legacy_is_true
run_case dirty_or_preview_legacy_marker_is_rejected
run_case installer_rejects_skip_public_health_before_creating_install_state
run_case installer_calls_promotion_after_maintenance_cleanup_step

echo 'production release record checks passed'
