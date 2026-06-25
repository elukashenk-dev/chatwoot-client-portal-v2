#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
HELPER="$REPO_ROOT/scripts/ensure-production-object-storage-env.sh"
DEPLOY_SCRIPT="$REPO_ROOT/scripts/deploy-production-archive.sh"
ENV_PRODUCTION_EXAMPLE="$REPO_ROOT/.env.production.example"
INGRESS_SCRIPT="$REPO_ROOT/scripts/configure-tenant-domain-ingress.sh"
INSTALL_SCRIPT="$REPO_ROOT/scripts/install-production.sh"
COMPOSE_FILE="$REPO_ROOT/infra/production/compose.yaml"
CADDY_FILE="$REPO_ROOT/infra/production/Caddyfile"
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

assert_not_contains() {
  local path="$1"
  local needle="$2"

  if grep -Fq "$needle" "$path"; then
    fail "expected $path not to contain: $needle"
  fi
}

line_number_of() {
  local path="$1"
  local needle="$2"
  local line

  line="$(grep -Fn "$needle" "$path" | head -n1 | cut -d: -f1 || true)"
  if [[ -z "$line" ]]; then
    fail "expected $path to contain: $needle"
  fi

  printf '%s\n' "$line"
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

if [[ ! -x "$INGRESS_SCRIPT" ]]; then
  fail "missing executable ingress helper: $INGRESS_SCRIPT"
fi

assert_contains "$DEPLOY_SCRIPT" "scripts/ensure-production-object-storage-env.sh --env-file .env.production"
assert_contains "$COMPOSE_FILE" "DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN:"
assert_contains "$COMPOSE_FILE" "telegram-bridge:"
assert_contains "$COMPOSE_FILE" 'command: ["node", "backend/dist/telegram-bridge/server.js"]'
assert_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_PORT:"
assert_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_PUBLIC_BASE_URL:"
assert_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_MAX_BODY_BYTES:"
assert_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_PROCESSING_STALE_MS:"
assert_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT:"
assert_contains "$COMPOSE_FILE" "portal-backend:"
assert_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: \${TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS:-10000}"
assert_contains "$COMPOSE_FILE" 'http://127.0.0.1:${TELEGRAM_BRIDGE_PORT:-3401}/telegram-bridge/health'
assert_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_PORT: \${TELEGRAM_BRIDGE_PORT:-3401}"
assert_not_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_TELEGRAM_BOT_TOKEN"
assert_not_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_CHATWOOT_ACCOUNT_ID"
assert_not_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_CHATWOOT_API_ACCESS_TOKEN"
assert_not_contains "$COMPOSE_FILE" "TELEGRAM_BRIDGE_CHATWOOT_TELEGRAM_INBOX_ID"
assert_contains "$CADDY_FILE" "handle /telegram-bridge/*"
assert_contains "$CADDY_FILE" 'reverse_proxy telegram-bridge:{$TELEGRAM_BRIDGE_PORT:3401}'
assert_contains "$INSTALL_SCRIPT" "Default tenant Chatwoot admin verification token"
assert_not_contains "$INSTALL_SCRIPT" "Optional separate Chatwoot admin verification token"
assert_env_value \
  "$ENV_PRODUCTION_EXAMPLE" \
  DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN \
  "replace-with-dedicated-chatwoot-admin-verification-token"
assert_env_value "$ENV_PRODUCTION_EXAMPLE" TELEGRAM_BRIDGE_PORT "3401"
assert_env_value "$ENV_PRODUCTION_EXAMPLE" TELEGRAM_BRIDGE_MAX_BODY_BYTES "1048576"
assert_env_value "$ENV_PRODUCTION_EXAMPLE" TELEGRAM_BRIDGE_PROCESSING_STALE_MS "600000"

deploy_cd_line="$(line_number_of "$DEPLOY_SCRIPT" 'cd "$app_path"')"
deploy_helper_line="$(line_number_of "$DEPLOY_SCRIPT" "scripts/ensure-production-object-storage-env.sh --env-file .env.production")"
if (( deploy_cd_line >= deploy_helper_line )); then
  fail "deploy script must cd into app_path before running the env upgrade helper"
fi

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
  TELEGRAM_BRIDGE_PORT
  TELEGRAM_BRIDGE_PUBLIC_BASE_URL
  TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS
  TELEGRAM_BRIDGE_MAX_BODY_BYTES
  TELEGRAM_BRIDGE_PROCESSING_STALE_MS
  TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT
  TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT
  TELEGRAM_BRIDGE_PHONE_LINKED_TEXT
)

for key in "${required_keys[@]}"; do
  assert_env_key_once "$legacy_env" "$key"
done

assert_env_value "$legacy_env" PORTAL_OBJECT_STORAGE_ROOT_USER "portal_v2_minio_root"
assert_env_value "$legacy_env" BRANDING_ASSET_STORAGE_ENDPOINT "http://portal-object-storage:9000"
assert_env_value "$legacy_env" BRANDING_ASSET_STORAGE_BUCKET "portal-branding-assets"
assert_env_value "$legacy_env" BRANDING_ASSET_STORAGE_ACCESS_KEY_ID "portal_v2_branding_assets"
assert_env_value "$legacy_env" BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE "true"
assert_env_value "$legacy_env" TELEGRAM_BRIDGE_PORT "3401"
assert_env_value "$legacy_env" TELEGRAM_BRIDGE_PUBLIC_BASE_URL "https://lk.provgroup.ru"
assert_env_value "$legacy_env" TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS "10000"
assert_env_value "$legacy_env" TELEGRAM_BRIDGE_MAX_BODY_BYTES "1048576"
assert_env_value "$legacy_env" TELEGRAM_BRIDGE_PROCESSING_STALE_MS "600000"

mode="$(stat -c '%a' "$legacy_env")"
if [[ "$mode" != "600" ]]; then
  fail "expected upgraded env mode 600, got $mode"
fi

custom_env="$TMP_DIR/custom.env"
cat >"$custom_env" <<'ENV'
DEFAULT_TENANT_PUBLIC_BASE_URL=https://tenant.example.test
BRANDING_ASSET_STORAGE_ENDPOINT=https://s3.example.test
BRANDING_ASSET_STORAGE_REGION=eu-central-1
BRANDING_ASSET_STORAGE_BUCKET=custom-bucket
BRANDING_ASSET_STORAGE_ACCESS_KEY_ID=custom-access
BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY=custom-secret
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE=false
PORTAL_OBJECT_STORAGE_ROOT_PASSWORD=existing-root-secret
TELEGRAM_BRIDGE_PUBLIC_BASE_URL=https://bridge.example.test
ENV

"$HELPER" --env-file "$custom_env"

assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_ENDPOINT "https://s3.example.test"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_REGION "eu-central-1"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_BUCKET "custom-bucket"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_ACCESS_KEY_ID "custom-access"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY "custom-secret"
assert_env_value "$custom_env" BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE "false"
assert_env_value "$custom_env" PORTAL_OBJECT_STORAGE_ROOT_PASSWORD "existing-root-secret"
assert_env_value "$custom_env" TELEGRAM_BRIDGE_PUBLIC_BASE_URL "https://bridge.example.test"
assert_env_value "$custom_env" TELEGRAM_BRIDGE_PORT "3401"

fake_bin="$TMP_DIR/fake-bin"
sites_available="$TMP_DIR/sites-available"
sites_enabled="$TMP_DIR/sites-enabled"
backup_root="$TMP_DIR/domain-ingress-backups"
command_log="$TMP_DIR/domain-ingress-commands.log"
mkdir -p "$fake_bin" "$sites_available" "$sites_enabled" "$backup_root"

cat >"$fake_bin/getent" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != "ahostsv4" ]]; then
  exit 2
fi
if [[ "${2:-}" == "lk.mixed.example.com" ]]; then
  printf '93.77.166.238 STREAM %s\n' "${2:-}"
  printf '203.0.113.10 STREAM %s\n' "${2:-}"
  exit 0
fi
printf '93.77.166.238 STREAM %s\n' "${2:-}"
printf '93.77.166.238 DGRAM %s\n' "${2:-}"
SH
chmod +x "$fake_bin/getent"

cat >"$fake_bin/nginx" <<SH
#!/usr/bin/env bash
set -euo pipefail
printf 'nginx %s\n' "\$*" >>"$command_log"
exit 0
SH
chmod +x "$fake_bin/nginx"

PATH="$fake_bin:$PATH" "$INGRESS_SCRIPT" \
  --domain=lk.example.com \
  --letsencrypt-email=ops@lancora.ru \
  --expected-ip=93.77.166.238 \
  --sites-available="$sites_available" \
  --sites-enabled="$sites_enabled" \
  --backup-root="$backup_root" \
  --portal-upstream=http://127.0.0.1:8088 \
  --getent-bin="$fake_bin/getent" \
  --nginx-bin="$fake_bin/nginx" \
  --skip-certbot \
  --skip-nginx-reload \
  --skip-public-verify

ingress_conf="$sites_available/chatwoot-client-portal-lk-example-com.conf"
enabled_conf="$sites_enabled/chatwoot-client-portal-lk-example-com.conf"

if [[ ! -f "$ingress_conf" ]]; then
  fail "expected ingress config to be written: $ingress_conf"
fi

if [[ ! -L "$enabled_conf" ]]; then
  fail "expected enabled ingress symlink: $enabled_conf"
fi

assert_contains "$ingress_conf" "server_name lk.example.com;"
assert_contains "$ingress_conf" "proxy_pass http://127.0.0.1:8088;"
assert_contains "$ingress_conf" 'proxy_set_header Host $host;'
assert_contains "$ingress_conf" 'proxy_set_header X-Forwarded-Proto $scheme;'
assert_contains "$ingress_conf" "proxy_read_timeout 3600s;"
assert_contains "$ingress_conf" "client_max_body_size 50m;"

first_backup_count="$(find "$backup_root" -type f | wc -l | tr -d ' ')"
if [[ "$first_backup_count" != "0" ]]; then
  fail "expected first ingress run to avoid backups, got $first_backup_count"
fi

PATH="$fake_bin:$PATH" "$INGRESS_SCRIPT" \
  --domain=lk.example.com \
  --letsencrypt-email=ops@lancora.ru \
  --expected-ip=93.77.166.238 \
  --sites-available="$sites_available" \
  --sites-enabled="$sites_enabled" \
  --backup-root="$backup_root" \
  --portal-upstream=http://127.0.0.1:8088 \
  --getent-bin="$fake_bin/getent" \
  --nginx-bin="$fake_bin/nginx" \
  --skip-certbot \
  --skip-nginx-reload \
  --skip-public-verify

second_backup_count="$(find "$backup_root" -type f | wc -l | tr -d ' ')"
if [[ "$second_backup_count" != "0" ]]; then
  fail "expected idempotent ingress run to avoid backups, got $second_backup_count"
fi

printf '# drift\n' >>"$ingress_conf"

PATH="$fake_bin:$PATH" "$INGRESS_SCRIPT" \
  --domain=lk.example.com \
  --letsencrypt-email=ops@lancora.ru \
  --expected-ip=93.77.166.238 \
  --sites-available="$sites_available" \
  --sites-enabled="$sites_enabled" \
  --backup-root="$backup_root" \
  --portal-upstream=http://127.0.0.1:8088 \
  --getent-bin="$fake_bin/getent" \
  --nginx-bin="$fake_bin/nginx" \
  --skip-certbot \
  --skip-nginx-reload \
  --skip-public-verify

changed_backup_count="$(find "$backup_root" -type f -name '*.conf' | wc -l | tr -d ' ')"
if [[ "$changed_backup_count" != "1" ]]; then
  fail "expected changed ingress config to be backed up once, got $changed_backup_count"
fi

if "$INGRESS_SCRIPT" \
  --domain=https://lk.example.com \
  --letsencrypt-email=ops@lancora.ru \
  --expected-ip=93.77.166.238 \
  --sites-available="$sites_available" \
  --sites-enabled="$sites_enabled" \
  --backup-root="$backup_root" \
  --getent-bin="$fake_bin/getent" \
  --nginx-bin="$fake_bin/nginx" \
  --skip-certbot \
  --skip-nginx-reload \
  --skip-public-verify >/dev/null 2>&1; then
  fail "expected URL-shaped ingress domain to be rejected"
fi

if "$INGRESS_SCRIPT" \
  --domain=lk.mixed.example.com \
  --letsencrypt-email=ops@lancora.ru \
  --expected-ip=93.77.166.238 \
  --sites-available="$sites_available" \
  --sites-enabled="$sites_enabled" \
  --backup-root="$backup_root" \
  --getent-bin="$fake_bin/getent" \
  --nginx-bin="$fake_bin/nginx" \
  --skip-certbot \
  --skip-nginx-reload \
  --skip-public-verify >/dev/null 2>&1; then
  fail "expected mixed DNS records to be rejected"
fi

cert_live_dir="$TMP_DIR/letsencrypt-live"
mkdir -p "$cert_live_dir/lk.example.com"
touch "$cert_live_dir/lk.example.com/fullchain.pem"
touch "$cert_live_dir/lk.example.com/privkey.pem"

cat >"$fake_bin/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

output_path=""
url=""
has_connect_timeout="false"
has_max_time="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --connect-timeout)
      has_connect_timeout="true"
      shift 2
      ;;
    --max-time)
      has_max_time="true"
      shift 2
      ;;
    -o)
      output_path="${2:-}"
      shift 2
      ;;
    -w)
      shift 2
      ;;
    -*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

if [[ -z "$output_path" ]]; then
  output_path="/dev/null"
fi

if [[ "$has_connect_timeout" != "true" || "$has_max_time" != "true" ]]; then
  printf 'curl public checks must include --connect-timeout and --max-time\n' >&2
  exit 2
fi

case "$url" in
  http://lk.example.com/api/tenant)
    printf '' >"$output_path"
    printf '301 https://lk.example.com/api/tenant'
    ;;
  https://lk.example.com/api/tenant)
    if [[ -n "${PRESENT_TENANT_SLUG:-}" ]]; then
      printf '{"tenant":{"slug":"%s","displayName":"Example Tenant"}}' "$PRESENT_TENANT_SLUG" >"$output_path"
      printf '200'
    else
      printf '{"code":"TENANT_NOT_FOUND"}' >"$output_path"
      printf '404'
    fi
    ;;
  *)
    printf 'unexpected URL: %s\n' "$url" >&2
    exit 2
    ;;
esac
SH
chmod +x "$fake_bin/curl"

cat >"$fake_bin/timeout" <<SH
#!/usr/bin/env bash
set -euo pipefail
printf 'timeout %s\n' "\$*" >>"$command_log"
duration="\${1:-}"
shift
"\$@"
SH
chmod +x "$fake_bin/timeout"

cat >"$fake_bin/openssl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  s_client)
    printf 'fake certificate\n'
    ;;
  x509)
    cat >/dev/null
    check_host=""
    previous=""
    for arg in "$@"; do
      if [[ "$previous" == "-checkhost" ]]; then
        check_host="$arg"
        break
      fi
      previous="$arg"
    done

    cert_san="${CERT_SAN:-lk.example.com}"
    if [[ -n "$check_host" ]]; then
      if [[ "$cert_san" == "$check_host" ]]; then
        printf 'Hostname %s does match certificate\n' "$check_host"
        exit 0
      fi
      printf 'Hostname %s does NOT match certificate\n' "$check_host" >&2
      exit 1
    fi

    printf 'X509v3 Subject Alternative Name:\n    DNS:%s\n' "$cert_san"
    ;;
  *)
    printf 'unexpected openssl command: %s\n' "$*" >&2
    exit 2
    ;;
esac
SH
chmod +x "$fake_bin/openssl"

PATH="$fake_bin:$PATH" "$INGRESS_SCRIPT" \
  --domain=lk.example.com \
  --letsencrypt-email=ops@lancora.ru \
  --expected-ip=93.77.166.238 \
  --sites-available="$sites_available" \
  --sites-enabled="$sites_enabled" \
  --backup-root="$backup_root" \
  --portal-upstream=http://127.0.0.1:8088 \
  --letsencrypt-live-dir="$cert_live_dir" \
  --getent-bin="$fake_bin/getent" \
  --nginx-bin="$fake_bin/nginx" \
  --curl-bin="$fake_bin/curl" \
  --openssl-bin="$fake_bin/openssl" \
  --skip-certbot \
  --skip-nginx-reload

assert_contains "$command_log" "timeout 15s $fake_bin/openssl s_client"

if CERT_SAN="lk.example.com.evil" PATH="$fake_bin:$PATH" "$INGRESS_SCRIPT" \
  --domain=lk.example.com \
  --letsencrypt-email=ops@lancora.ru \
  --expected-ip=93.77.166.238 \
  --sites-available="$sites_available" \
  --sites-enabled="$sites_enabled" \
  --backup-root="$backup_root" \
  --portal-upstream=http://127.0.0.1:8088 \
  --letsencrypt-live-dir="$cert_live_dir" \
  --getent-bin="$fake_bin/getent" \
  --nginx-bin="$fake_bin/nginx" \
  --curl-bin="$fake_bin/curl" \
  --openssl-bin="$fake_bin/openssl" \
  --skip-certbot \
  --skip-nginx-reload >/dev/null 2>&1; then
  fail "expected SAN prefix mismatch to be rejected"
fi

PRESENT_TENANT_SLUG="example" PATH="$fake_bin:$PATH" "$INGRESS_SCRIPT" \
  --domain=lk.example.com \
  --letsencrypt-email=ops@lancora.ru \
  --expected-ip=93.77.166.238 \
  --expected-tenant-slug=example \
  --tenant-state=present \
  --sites-available="$sites_available" \
  --sites-enabled="$sites_enabled" \
  --backup-root="$backup_root" \
  --portal-upstream=http://127.0.0.1:8088 \
  --letsencrypt-live-dir="$cert_live_dir" \
  --getent-bin="$fake_bin/getent" \
  --nginx-bin="$fake_bin/nginx" \
  --curl-bin="$fake_bin/curl" \
  --openssl-bin="$fake_bin/openssl" \
  --skip-certbot \
  --skip-nginx-reload

echo "production env upgrade checks passed"
