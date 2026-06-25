#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
ENV_FILE="$REPO_ROOT/.env.production"

usage() {
  cat <<'EOF'
Usage:
  scripts/ensure-production-object-storage-env.sh [--env-file=<path>]

Adds missing portal object-storage and Telegram bridge runtime variables to an existing production env file.
Existing supported values are preserved. Deprecated Telegram bridge public URL env is removed.
Missing secrets are generated locally.
EOF
}

while [[ $# -gt 0 ]]; do
  arg="$1"
  case "$arg" in
    --env-file=*)
      ENV_FILE="${arg#*=}"
      shift
      ;;
    --env-file)
      if [[ $# -lt 2 ]]; then
        echo "--env-file requires a path." >&2
        exit 2
      fi
      ENV_FILE="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file is missing: $ENV_FILE" >&2
  exit 1
fi

has_key() {
  local key="$1"

  grep -Eq "^${key}=" "$ENV_FILE"
}

append_env_line() {
  local key="$1"
  local value="$2"

  if has_key "$key"; then
    return
  fi

  ensure_backup

  printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  APPENDED_KEYS+=("$key")
}

ensure_backup() {
  if [[ "$WROTE_ANY" != "true" ]]; then
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date -u +%Y%m%dT%H%M%SZ)"
    WROTE_ANY="true"
  fi
}

remove_env_key() {
  local key="$1"

  if ! has_key "$key"; then
    return
  fi

  ensure_backup
  grep -Ev "^${key}=" "$ENV_FILE" >"${ENV_FILE}.tmp" || true
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  REMOVED_KEYS+=("$key")
}

random_hex_secret() {
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl is required to generate missing production object-storage secrets." >&2
    exit 1
  fi

  openssl rand -hex 32
}

WROTE_ANY="false"
APPENDED_KEYS=()
REMOVED_KEYS=()

remove_env_key TELEGRAM_BRIDGE_PUBLIC_BASE_URL

append_env_line PORTAL_OBJECT_STORAGE_IMAGE "quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z"
append_env_line PORTAL_OBJECT_STORAGE_MC_IMAGE "quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z"
append_env_line PORTAL_OBJECT_STORAGE_ROOT_USER "portal_v2_minio_root"
if ! has_key PORTAL_OBJECT_STORAGE_ROOT_PASSWORD; then
  append_env_line PORTAL_OBJECT_STORAGE_ROOT_PASSWORD "$(random_hex_secret)"
fi

append_env_line BRANDING_ASSET_STORAGE_ENDPOINT "http://portal-object-storage:9000"
append_env_line BRANDING_ASSET_STORAGE_REGION "us-east-1"
append_env_line BRANDING_ASSET_STORAGE_BUCKET "portal-branding-assets"
append_env_line BRANDING_ASSET_STORAGE_ACCESS_KEY_ID "portal_v2_branding_assets"
if ! has_key BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY; then
  append_env_line BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY "$(random_hex_secret)"
fi
append_env_line BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE "true"

append_env_line TELEGRAM_BRIDGE_PORT "3401"
append_env_line TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS "10000"
append_env_line TELEGRAM_BRIDGE_MAX_BODY_BYTES "1048576"
append_env_line TELEGRAM_BRIDGE_PROCESSING_STALE_MS "600000"
append_env_line TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT "Пожалуйста, отправьте номер телефона кнопкой ниже, чтобы мы могли найти ваш контакт."
append_env_line TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT "Не удалось найти контакт с этим номером. Проверьте номер или напишите менеджеру."
append_env_line TELEGRAM_BRIDGE_PHONE_LINKED_TEXT "Спасибо, контакт найден. Теперь можете отправить сообщение."

chmod 600 "$ENV_FILE"

if [[ "$WROTE_ANY" == "true" ]]; then
  echo "Production env upgraded:"
  if [[ "${#APPENDED_KEYS[@]}" -gt 0 ]]; then
    echo "  appended:"
    printf '    %s\n' "${APPENDED_KEYS[@]}"
  fi
  if [[ "${#REMOVED_KEYS[@]}" -gt 0 ]]; then
    echo "  removed:"
    printf '    %s\n' "${REMOVED_KEYS[@]}"
  fi
else
  echo "Production env already has portal object-storage keys."
fi
