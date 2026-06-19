#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
HELPER="$REPO_ROOT/scripts/ensure-production-object-storage-env.sh"
DEPLOY_SCRIPT="$REPO_ROOT/scripts/deploy-production-archive.sh"
COMPOSE_FILE="$REPO_ROOT/infra/production/compose.yaml"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local path="$1"
  local needle="$2"

  if ! grep -Fq "$needle" "$path"; then
    fail "expected $path to contain: $needle"
  fi
}

assert_env_value() {
  local env_file="$1"
  local key="$2"
  local expected="$3"
  local actual

  actual="$(grep -E "^${key}=" "$env_file" | cut -d= -f2- || true)"
  if [[ "$actual" != "$expected" ]]; then
    fail "expected $key=$expected, got ${actual:-<missing>}"
  fi
}

assert_env_key_once() {
  local env_file="$1"
  local key="$2"
  local count

  count="$(grep -Ec "^${key}=" "$env_file" || true)"
  if [[ "$count" != "1" ]]; then
    fail "expected $key to appear once, got $count"
  fi
}

if [[ ! -x "$HELPER" ]]; then
  fail "missing executable helper: $HELPER"
fi

assert_contains "$DEPLOY_SCRIPT" "scripts/ensure-production-object-storage-env.sh --env-file .env.production"
assert_contains "$COMPOSE_FILE" "DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN:"

legacy_env="$TMP_DIR/legacy.env"
cat >"$legacy_env" <<'ENV'
PORTAL_DOMAIN=lk.provgroup.ru
APP_ORIGIN=https://lk.provgroup.ru
PORTAL_V2_POSTGRES_DB=chatwoot_client_portal_v2
PORTAL_V2_POSTGRES_USER=portal_v2
PORTAL_V2_POSTGRES_PASSWORD=legacy-db-password
DATABASE_URL=postgresql://portal_v2:legacy-db-password@portal-db:5432/chatwoot_client_portal_v2
ENV
chmod 0644 "$legacy_env"

"$HELPER" --env-file "$legacy_env"
"$HELPER" --env-file "$legacy_env"

required_keys=(
  PORTAL_OBJECT_STORAGE_IMAGE
  PORTAL_OBJECT_STORAGE_MC_IMAGE
  PORTAL_OBJECT_STORAGE_ROOT_USER
  PORTAL_OBJECT_STORAGE_ROOT_PASSWORD
  BRANDING_ASSET_STORAGE_ENDPOINT
  BRANDING_ASSET_STORAGE_REGION
  BRANDING_ASSET_STORAGE_BUCKET
  BRANDING_ASSET_STORAGE_ACCESS_KEY_ID
  BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY
  BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE
)

for key in "${required_keys[@]}"; do
  assert_env_key_once "$legacy_env" "$key"
done

assert_env_value "$legacy_env" PORTAL_OBJECT_STORAGE_ROOT_USER "portal_v2_minio_root"
assert_env_value "$legacy_env" BRANDING_ASSET_STORAGE_ENDPOINT "http://portal-object-storage:9000"
assert_env_value "$legacy_env" BRANDING_ASSET_STORAGE_BUCKET "portal-branding-assets"
assert_env_value "$legacy_env" BRANDING_ASSET_STORAGE_ACCESS_KEY_ID "portal_v2_branding_assets"
assert_env_value "$legacy_env" BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE "true"

mode="$(stat -c '%a' "$legacy_env")"
if [[ "$mode" != "600" ]]; then
  fail "expected upgraded env mode 600, got $mode"
fi

custom_env="$TMP_DIR/custom.env"
cat >"$custom_env" <<'ENV'
BRANDING_ASSET_STORAGE_ENDPOINT=https://s3.example.test
BRANDING_ASSET_STORAGE_REGION=eu-central-1
BRANDING_ASSET_STORAGE_BUCKET=custom-bucket
BRANDING_ASSET_STORAGE_ACCESS_KEY_ID=custom-access
BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY=custom-secret
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE=false
PORTAL_OBJECT_STORAGE_ROOT_PASSWORD=existing-root-secret
ENV

"$HELPER" --env-file "$custom_env"

assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_ENDPOINT "https://s3.example.test"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_REGION "eu-central-1"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_BUCKET "custom-bucket"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_ACCESS_KEY_ID "custom-access"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY "custom-secret"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE "false"
assert_env_value "$custom_env" PORTAL_OBJECT_STORAGE_ROOT_PASSWORD "existing-root-secret"

echo "production env upgrade checks passed"
