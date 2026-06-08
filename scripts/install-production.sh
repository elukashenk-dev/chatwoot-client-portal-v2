#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="chatwoot-client-portal-v2"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"

ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.production}"
STATE_DIR="${INSTALL_STATE_DIR:-$REPO_ROOT/.install}"
STATE_FILE="$STATE_DIR/production.state"
LOG_DIR="${INSTALL_LOG_DIR:-$REPO_ROOT/logs}"
COMPOSE_FILE="$REPO_ROOT/infra/production/compose.yaml"

ACTION="install"
RECONFIGURE="false"
ASSUME_YES="false"
SKIP_PUBLIC_HEALTH="false"
SUDO=()
DOCKER=()

usage() {
  cat <<'EOF'
Usage:
  scripts/install-production.sh --install
  scripts/install-production.sh --install --reconfigure
  scripts/install-production.sh --sync-webhook-secret
  scripts/install-production.sh --install-maintenance-cleanup
  scripts/install-production.sh --maintenance-cleanup-dry-run
  scripts/install-production.sh --maintenance-cleanup-status
  scripts/install-production.sh --status
  scripts/install-production.sh --logs
  scripts/install-production.sh --reset-state

Options:
  --install             Run or resume the production installer.
  --reconfigure         Ask all env questions again and reset installer state.
  --sync-webhook-secret Configure the tenant API Channel webhook, store its secret in portal DB, and check health.
  --install-maintenance-cleanup
                        Install and enable the daily portal maintenance cleanup timer.
  --maintenance-cleanup-dry-run
                        Run portal maintenance cleanup in dry-run mode.
  --maintenance-cleanup-status
                        Show portal maintenance cleanup timer status.
  --yes                 Use defaults for yes/no prompts when possible.
  --skip-public-health  Skip the public HTTPS health check step.
  --status              Show installer state and compose status.
  --logs                Follow the latest installer log.
  --reset-state         Remove installer state. Does not delete containers or env.
  --help                Show this help.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --install)
      ACTION="install"
      ;;
    --reconfigure)
      RECONFIGURE="true"
      ;;
    --sync-webhook-secret)
      ACTION="sync-webhook-secret"
      ;;
    --install-maintenance-cleanup)
      ACTION="install-maintenance-cleanup"
      ;;
    --maintenance-cleanup-dry-run)
      ACTION="maintenance-cleanup-dry-run"
      ;;
    --maintenance-cleanup-status)
      ACTION="maintenance-cleanup-status"
      ;;
    --yes|-y)
      ASSUME_YES="true"
      ;;
    --skip-public-health)
      SKIP_PUBLIC_HEALTH="true"
      ;;
    --status)
      ACTION="status"
      ;;
    --logs)
      ACTION="logs"
      ;;
    --reset-state)
      ACTION="reset-state"
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

mkdir -p "$STATE_DIR" "$LOG_DIR"

latest_log_path() {
  if [[ -L "$LOG_DIR/install-latest.log" || -f "$LOG_DIR/install-latest.log" ]]; then
    printf '%s\n' "$LOG_DIR/install-latest.log"
    return
  fi

  find "$LOG_DIR" -maxdepth 1 -type f -name 'install-*.log' | sort | tail -n 1
}

if [[ "$ACTION" == "logs" ]]; then
  latest_log="$(latest_log_path)"
  if [[ -z "$latest_log" ]]; then
    echo "No installer logs found in $LOG_DIR"
    exit 1
  fi
  tail -n 200 -f "$latest_log"
  exit 0
fi

if [[ "$ACTION" == "reset-state" ]]; then
  rm -f "$STATE_FILE"
  echo "Removed installer state: $STATE_FILE"
  exit 0
fi

if [[ "$ACTION" == "install" ||
  "$ACTION" == "sync-webhook-secret" ||
  "$ACTION" == "install-maintenance-cleanup" ||
  "$ACTION" == "maintenance-cleanup-dry-run" ]]; then
  LOG_FILE="$LOG_DIR/install-$(date +%Y%m%d-%H%M%S).log"
  ln -sfn "$(basename "$LOG_FILE")" "$LOG_DIR/install-latest.log"
  exec > >(tee -a "$LOG_FILE") 2>&1
  echo "Installer log: $LOG_FILE"
fi

if [[ "$ACTION" == "install" && "$RECONFIGURE" == "true" ]]; then
  rm -f "$STATE_FILE"
  echo "Installer state reset because --reconfigure was provided."
fi

on_error() {
  local line="$1"
  local retry_command="scripts/install-production.sh --install"

  case "$ACTION" in
    sync-webhook-secret)
      retry_command="scripts/install-production.sh --sync-webhook-secret"
      ;;
    install-maintenance-cleanup)
      retry_command="scripts/install-production.sh --install-maintenance-cleanup"
      ;;
    maintenance-cleanup-dry-run)
      retry_command="scripts/install-production.sh --maintenance-cleanup-dry-run"
      ;;
  esac

  echo
  echo "Install failed near line $line."
  if [[ -n "${LOG_FILE:-}" ]]; then
    echo "Open the log for details: $LOG_FILE"
  fi
  echo "After fixing the issue, run again: $retry_command"
}
trap 'on_error "$LINENO"' ERR

cd "$REPO_ROOT"

if [[ "$EUID" -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required when the installer is not run as root." >&2
    exit 1
  fi
  SUDO=(sudo)
fi

print_header() {
  echo
  echo "== $1 =="
}

step_done() {
  [[ -f "$STATE_FILE" ]] && grep -Fxq "$1" "$STATE_FILE"
}

mark_step_done() {
  local step="$1"
  touch "$STATE_FILE"
  if ! grep -Fxq "$step" "$STATE_FILE"; then
    printf '%s\n' "$step" >>"$STATE_FILE"
  fi
}

run_step() {
  local step="$1"
  local title="$2"
  shift 2

  if step_done "$step"; then
    echo "[skip] $title"
    return
  fi

  print_header "$title"
  "$@"
  mark_step_done "$step"
  echo "[done] $title"
}

confirm() {
  local question="$1"
  local default_answer="${2:-yes}"
  local prompt="[y/N]"
  local answer=""

  if [[ "$default_answer" == "yes" ]]; then
    prompt="[Y/n]"
  fi

  if [[ "$ASSUME_YES" == "true" ]]; then
    [[ "$default_answer" == "yes" ]]
    return
  fi

  while true; do
    read -r -p "$question $prompt " answer
    answer="${answer:-$default_answer}"
    case "$answer" in
      y|Y|yes|YES)
        return 0
        ;;
      n|N|no|NO)
        return 1
        ;;
      *)
        echo "Please answer yes or no."
        ;;
    esac
  done
}

env_value() {
  local key="$1"
  local value=""

  if [[ -f "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  fi

  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value#\"}"
    value="${value%\"}"
    value="${value//\\\"/\"}"
    value="${value//\\\$/\$}"
    value="${value//\\\\/\\}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value#\'}"
    value="${value%\'}"
  fi

  printf '%s\n' "$value"
}

prompt_value() {
  local result_var="$1"
  local label="$2"
  local default_value="${3:-}"
  local required="${4:-required}"
  local value=""

  while true; do
    if [[ -n "$default_value" ]]; then
      read -r -p "$label [$default_value]: " value
      value="${value:-$default_value}"
    else
      read -r -p "$label: " value
    fi

    if [[ "$required" != "required" || -n "$value" ]]; then
      printf -v "$result_var" '%s' "$value"
      return
    fi

    echo "This value is required."
  done
}

prompt_secret() {
  local result_var="$1"
  local label="$2"
  local default_value="${3:-}"
  local required="${4:-required}"
  local value=""

  while true; do
    if [[ -n "$default_value" ]]; then
      printf '%s [press Enter to keep/generate]: ' "$label"
    else
      printf '%s: ' "$label"
    fi
    IFS= read -r -s value
    printf '\n'
    value="${value:-$default_value}"

    if [[ "$required" != "required" || -n "$value" ]]; then
      printf -v "$result_var" '%s' "$value"
      return
    fi

    echo "This value is required."
  done
}

random_hex() {
  openssl rand -hex "${1:-24}"
}

random_base64() {
  openssl rand -base64 "${1:-48}" | tr -d '\n'
}

env_quote() {
  local value="$1"
  value="${value//$'\n'/}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\\$}"
  printf '"%s"' "$value"
}

write_env_line() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$(env_quote "$value")"
}

strip_trailing_slash() {
  local value="$1"
  while [[ "$value" == */ ]]; do
    value="${value%/}"
  done
  printf '%s\n' "$value"
}

port_is_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  return 1
}

select_docker_command() {
  DOCKER=()

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DOCKER=(docker)
    return 0
  fi

  if command -v docker >/dev/null 2>&1 && "${SUDO[@]}" docker info >/dev/null 2>&1; then
    DOCKER=("${SUDO[@]}" docker)
    return 0
  fi

  return 1
}

docker_compose() {
  if [[ "${#DOCKER[@]}" -eq 0 ]]; then
    select_docker_command
  fi
  "${DOCKER[@]}" compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

preflight() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "Run this script from the $APP_NAME repository."
    exit 1
  fi

  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    echo "Detected OS: ${PRETTY_NAME:-unknown}"
    if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" ]]; then
      echo "Warning: installer is tested for Ubuntu/Debian style systems."
    fi
  else
    echo "Warning: /etc/os-release not found."
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    "${SUDO[@]}" apt-get update
    "${SUDO[@]}" apt-get install -y openssl
  fi

}

install_docker() {
  if select_docker_command && "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    "${DOCKER[@]}" version
    "${DOCKER[@]}" compose version
    return
  fi

  echo "Docker Engine or Compose plugin was not found. Installing via Docker apt repository."
  if [[ ! -f /etc/os-release ]]; then
    echo "Cannot install Docker automatically without /etc/os-release." >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" ]]; then
    echo "Automatic Docker install supports Ubuntu/Debian only in this installer." >&2
    exit 1
  fi

  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y ca-certificates curl gnupg lsb-release iproute2
  "${SUDO[@]}" install -m 0755 -d /etc/apt/keyrings
  "${SUDO[@]}" curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  "${SUDO[@]}" chmod a+r /etc/apt/keyrings/docker.asc

  local codename="${VERSION_CODENAME:-$(lsb_release -cs)}"
  local arch
  arch="$(dpkg --print-architecture)"

  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$arch" "$ID" "$codename" |
    "${SUDO[@]}" tee /etc/apt/sources.list.d/docker.list >/dev/null

  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  "${SUDO[@]}" systemctl enable --now docker

  if [[ "$EUID" -ne 0 ]]; then
    "${SUDO[@]}" usermod -aG docker "$USER" || true
    echo "User $USER was added to docker group. This shell can continue through sudo docker."
  fi

  select_docker_command
  "${DOCKER[@]}" version
  "${DOCKER[@]}" compose version
}

collect_env() {
  local default_mode="standalone"
  if port_is_busy 80 || port_is_busy 443; then
    default_mode="reverse-proxy"
    echo "Ports 80/443 look busy. Defaulting to reverse-proxy mode."
  fi

  prompt_value PORTAL_DOMAIN "Portal domain" "$(env_value PORTAL_DOMAIN)"
  PORTAL_DOMAIN="$(strip_trailing_slash "$PORTAL_DOMAIN")"
  APP_ORIGIN_DEFAULT="$(env_value APP_ORIGIN)"
  APP_ORIGIN_DEFAULT="${APP_ORIGIN_DEFAULT:-https://$PORTAL_DOMAIN}"
  prompt_value APP_ORIGIN "Public portal origin" "$APP_ORIGIN_DEFAULT"
  APP_ORIGIN="$(strip_trailing_slash "$APP_ORIGIN")"

  local existing_mode
  existing_mode="$(env_value PORTAL_DEPLOYMENT_MODE)"
  existing_mode="${existing_mode:-$default_mode}"
  while true; do
    prompt_value PORTAL_DEPLOYMENT_MODE "Deployment mode: standalone or reverse-proxy" "$existing_mode"
    case "$PORTAL_DEPLOYMENT_MODE" in
      standalone|reverse-proxy)
        break
        ;;
      *)
        echo "Use 'standalone' or 'reverse-proxy'."
        ;;
    esac
  done

  if [[ "$PORTAL_DEPLOYMENT_MODE" == "standalone" ]]; then
    PORTAL_CADDY_SITE_ADDRESS="$PORTAL_DOMAIN"
    PORTAL_HTTP_BIND="0.0.0.0"
    PORTAL_HTTP_PORT="80"
    PORTAL_HTTPS_BIND="0.0.0.0"
    PORTAL_HTTPS_PORT="443"
    LETSENCRYPT_EMAIL="$(env_value LETSENCRYPT_EMAIL)"
  else
    PORTAL_CADDY_SITE_ADDRESS=":80"
    PORTAL_HTTP_BIND="127.0.0.1"
    local existing_http_port
    existing_http_port="$(env_value PORTAL_HTTP_PORT)"
    existing_http_port="${existing_http_port:-8088}"
    prompt_value PORTAL_HTTP_PORT "Local HTTP port for the portal container" "$existing_http_port"
    PORTAL_HTTPS_BIND="127.0.0.1"
    local existing_https_port
    existing_https_port="$(env_value PORTAL_HTTPS_PORT)"
    existing_https_port="${existing_https_port:-8448}"
    prompt_value PORTAL_HTTPS_PORT "Unused local HTTPS port for the portal container" "$existing_https_port"
    if port_is_busy "$PORTAL_HTTP_PORT"; then
      echo "Warning: local port $PORTAL_HTTP_PORT is already busy."
    fi
    if port_is_busy "$PORTAL_HTTPS_PORT"; then
      echo "Warning: local port $PORTAL_HTTPS_PORT is already busy."
    fi
    prompt_value LETSENCRYPT_EMAIL "Email for Let's Encrypt notifications" "$(env_value LETSENCRYPT_EMAIL)" optional
  fi

  local existing_trust_proxy
  existing_trust_proxy="$(env_value PORTAL_TRUST_PROXY)"
  existing_trust_proxy="${existing_trust_proxy:-true}"
  prompt_value PORTAL_TRUST_PROXY "Trust proxy headers from portal reverse proxy true/false" "$existing_trust_proxy"

  local existing_session_secret
  existing_session_secret="$(env_value SESSION_SECRET)"
  existing_session_secret="${existing_session_secret:-$(random_base64 48)}"
  prompt_secret SESSION_SECRET "Session secret" "$existing_session_secret"

  PORTAL_V2_POSTGRES_DB="$(env_value PORTAL_V2_POSTGRES_DB)"
  PORTAL_V2_POSTGRES_DB="${PORTAL_V2_POSTGRES_DB:-chatwoot_client_portal_v2}"
  prompt_value PORTAL_V2_POSTGRES_DB "Portal Postgres database" "$PORTAL_V2_POSTGRES_DB"

  PORTAL_V2_POSTGRES_USER="$(env_value PORTAL_V2_POSTGRES_USER)"
  PORTAL_V2_POSTGRES_USER="${PORTAL_V2_POSTGRES_USER:-portal_v2}"
  prompt_value PORTAL_V2_POSTGRES_USER "Portal Postgres user" "$PORTAL_V2_POSTGRES_USER"

  local existing_db_password
  existing_db_password="$(env_value PORTAL_V2_POSTGRES_PASSWORD)"
  existing_db_password="${existing_db_password:-$(random_hex 24)}"
  prompt_secret PORTAL_V2_POSTGRES_PASSWORD "Portal Postgres password" "$existing_db_password"
  if ! [[ "$PORTAL_V2_POSTGRES_PASSWORD" =~ ^[A-Za-z0-9._~-]+$ ]]; then
    echo "Postgres password must contain only URL-safe characters: A-Z a-z 0-9 . _ ~ -"
    exit 1
  fi
  DATABASE_URL="postgresql://${PORTAL_V2_POSTGRES_USER}:${PORTAL_V2_POSTGRES_PASSWORD}@portal-db:5432/${PORTAL_V2_POSTGRES_DB}"

  PORTAL_OBJECT_STORAGE_IMAGE="quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z"
  PORTAL_OBJECT_STORAGE_MC_IMAGE="quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z"
  PORTAL_OBJECT_STORAGE_ROOT_USER="portal_v2_minio_root"

  local existing_storage_root_password
  existing_storage_root_password="$(env_value PORTAL_OBJECT_STORAGE_ROOT_PASSWORD)"
  existing_storage_root_password="${existing_storage_root_password:-$(random_hex 32)}"
  prompt_secret PORTAL_OBJECT_STORAGE_ROOT_PASSWORD "Portal object storage root password" "$existing_storage_root_password"

  BRANDING_ASSET_STORAGE_ENDPOINT="http://portal-object-storage:9000"
  BRANDING_ASSET_STORAGE_REGION="us-east-1"
  BRANDING_ASSET_STORAGE_BUCKET="portal-branding-assets"
  BRANDING_ASSET_STORAGE_ACCESS_KEY_ID="portal_v2_branding_assets"

  local existing_branding_storage_secret
  existing_branding_storage_secret="$(env_value BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY)"
  existing_branding_storage_secret="${existing_branding_storage_secret:-$(random_hex 32)}"
  prompt_secret BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY "Branding asset storage app secret key" "$existing_branding_storage_secret"

  BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE="true"

  local existing_tenant_secret_key
  existing_tenant_secret_key="$(env_value PORTAL_TENANT_SECRET_KEY)"
  existing_tenant_secret_key="${existing_tenant_secret_key:-$(random_base64 32)}"
  prompt_secret PORTAL_TENANT_SECRET_KEY "Tenant encryption secret key" "$existing_tenant_secret_key"

  local existing_tenant_slug
  existing_tenant_slug="$(env_value DEFAULT_TENANT_SLUG)"
  existing_tenant_slug="${existing_tenant_slug:-default}"
  prompt_value DEFAULT_TENANT_SLUG "Default tenant slug" "$existing_tenant_slug"

  local existing_tenant_display_name
  existing_tenant_display_name="$(env_value DEFAULT_TENANT_DISPLAY_NAME)"
  existing_tenant_display_name="${existing_tenant_display_name:-Default Tenant}"
  prompt_value DEFAULT_TENANT_DISPLAY_NAME "Default tenant display name" "$existing_tenant_display_name"

  local existing_tenant_primary_domain
  existing_tenant_primary_domain="$(env_value DEFAULT_TENANT_PRIMARY_DOMAIN)"
  existing_tenant_primary_domain="${existing_tenant_primary_domain:-$PORTAL_DOMAIN}"
  prompt_value DEFAULT_TENANT_PRIMARY_DOMAIN "Default tenant primary domain" "$existing_tenant_primary_domain"

  local existing_tenant_public_base_url
  existing_tenant_public_base_url="$(env_value DEFAULT_TENANT_PUBLIC_BASE_URL)"
  existing_tenant_public_base_url="${existing_tenant_public_base_url:-$APP_ORIGIN}"
  prompt_value DEFAULT_TENANT_PUBLIC_BASE_URL "Default tenant public base URL" "$existing_tenant_public_base_url"
  DEFAULT_TENANT_PUBLIC_BASE_URL="$(strip_trailing_slash "$DEFAULT_TENANT_PUBLIC_BASE_URL")"

  prompt_value DEFAULT_TENANT_CHATWOOT_BASE_URL "Default tenant Chatwoot base URL" "$(env_value DEFAULT_TENANT_CHATWOOT_BASE_URL)"
  DEFAULT_TENANT_CHATWOOT_BASE_URL="$(strip_trailing_slash "$DEFAULT_TENANT_CHATWOOT_BASE_URL")"
  prompt_value DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID "Default tenant Chatwoot account ID" "$(env_value DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID)"
  prompt_secret DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN "Default tenant Chatwoot API access token" "$(env_value DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN)"
  prompt_secret DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN "Optional separate Chatwoot admin verification token" "$(env_value DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN)" optional
  prompt_value DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID "Default tenant Chatwoot API Channel inbox ID" "$(env_value DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID)"

  local existing_tenant_webhook_secret
  existing_tenant_webhook_secret="$(env_value DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET)"
  DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET="${existing_tenant_webhook_secret:-$(random_base64 32)}"
  if [[ -n "$existing_tenant_webhook_secret" ]]; then
    echo "Keeping existing bootstrap tenant webhook secret until the tenant webhook configure step stores Chatwoot's actual API Channel secret."
  else
    echo "Generated a temporary bootstrap tenant webhook secret. The tenant webhook configure step will replace the stored tenant secret with Chatwoot's actual API Channel secret."
  fi

  prompt_value SMTP_HOST "SMTP host" "$(env_value SMTP_HOST)"
  local existing_smtp_port
  existing_smtp_port="$(env_value SMTP_PORT)"
  existing_smtp_port="${existing_smtp_port:-587}"
  prompt_value SMTP_PORT "SMTP port" "$existing_smtp_port"
  local existing_smtp_secure
  existing_smtp_secure="$(env_value SMTP_SECURE)"
  existing_smtp_secure="${existing_smtp_secure:-false}"
  prompt_value SMTP_SECURE "SMTP secure true/false" "$existing_smtp_secure"
  prompt_value SMTP_USER "SMTP user" "$(env_value SMTP_USER)" optional
  prompt_secret SMTP_PASS "SMTP password" "$(env_value SMTP_PASS)" optional
  prompt_value SMTP_FROM "SMTP from address" "$(env_value SMTP_FROM)"

  prompt_value PUSH_VAPID_PUBLIC_KEY "Web Push VAPID public key" "$(env_value PUSH_VAPID_PUBLIC_KEY)" optional
  prompt_secret PUSH_VAPID_PRIVATE_KEY "Web Push VAPID private key" "$(env_value PUSH_VAPID_PRIVATE_KEY)" optional
  prompt_value PUSH_VAPID_SUBJECT "Web Push VAPID subject" "$(env_value PUSH_VAPID_SUBJECT)" optional
  prompt_value PUSH_VAPID_KEY_ID "Web Push VAPID key id" "$(env_value PUSH_VAPID_KEY_ID)" optional
  local existing_push_origins
  existing_push_origins="$(env_value PUSH_SUBSCRIPTION_ALLOWED_ORIGINS)"
  existing_push_origins="${existing_push_origins:-https://fcm.googleapis.com,https://updates.push.services.mozilla.com,https://web.push.apple.com}"
  prompt_value PUSH_SUBSCRIPTION_ALLOWED_ORIGINS "Allowed browser push service origins" "$existing_push_origins"
  if [[ -n "$PUSH_VAPID_PUBLIC_KEY$PUSH_VAPID_PRIVATE_KEY" ]]; then
    if [[ -z "$PUSH_VAPID_PUBLIC_KEY" || -z "$PUSH_VAPID_PRIVATE_KEY" ]]; then
      echo "PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY must be provided together."
      exit 1
    fi
    if [[ -z "$PUSH_VAPID_SUBJECT" ]]; then
      echo "PUSH_VAPID_SUBJECT is required when Web Push VAPID keys are configured."
      exit 1
    fi
  fi

  {
    echo "# Generated by scripts/install-production.sh."
    echo "# Do not commit this file."
    write_env_line PORTAL_DOMAIN "$PORTAL_DOMAIN"
    write_env_line APP_ORIGIN "$APP_ORIGIN"
    write_env_line PORTAL_DEPLOYMENT_MODE "$PORTAL_DEPLOYMENT_MODE"
    write_env_line PORTAL_CADDY_SITE_ADDRESS "$PORTAL_CADDY_SITE_ADDRESS"
    write_env_line PORTAL_HTTP_BIND "$PORTAL_HTTP_BIND"
    write_env_line PORTAL_HTTP_PORT "$PORTAL_HTTP_PORT"
    write_env_line PORTAL_HTTPS_BIND "$PORTAL_HTTPS_BIND"
    write_env_line PORTAL_HTTPS_PORT "$PORTAL_HTTPS_PORT"
    write_env_line LETSENCRYPT_EMAIL "$LETSENCRYPT_EMAIL"
    write_env_line NODE_ENV production
    write_env_line PORT 3301
    write_env_line PORTAL_TRUST_PROXY "$PORTAL_TRUST_PROXY"
    write_env_line SESSION_COOKIE_NAME portal_session
    write_env_line SESSION_SECRET "$SESSION_SECRET"
    write_env_line SESSION_TTL_DAYS 14
    write_env_line PORTAL_V2_POSTGRES_DB "$PORTAL_V2_POSTGRES_DB"
    write_env_line PORTAL_V2_POSTGRES_USER "$PORTAL_V2_POSTGRES_USER"
    write_env_line PORTAL_V2_POSTGRES_PASSWORD "$PORTAL_V2_POSTGRES_PASSWORD"
    write_env_line DATABASE_URL "$DATABASE_URL"
    write_env_line PORTAL_OBJECT_STORAGE_IMAGE "$PORTAL_OBJECT_STORAGE_IMAGE"
    write_env_line PORTAL_OBJECT_STORAGE_MC_IMAGE "$PORTAL_OBJECT_STORAGE_MC_IMAGE"
    write_env_line PORTAL_OBJECT_STORAGE_ROOT_USER "$PORTAL_OBJECT_STORAGE_ROOT_USER"
    write_env_line PORTAL_OBJECT_STORAGE_ROOT_PASSWORD "$PORTAL_OBJECT_STORAGE_ROOT_PASSWORD"
    write_env_line BRANDING_ASSET_STORAGE_ENDPOINT "$BRANDING_ASSET_STORAGE_ENDPOINT"
    write_env_line BRANDING_ASSET_STORAGE_REGION "$BRANDING_ASSET_STORAGE_REGION"
    write_env_line BRANDING_ASSET_STORAGE_BUCKET "$BRANDING_ASSET_STORAGE_BUCKET"
    write_env_line BRANDING_ASSET_STORAGE_ACCESS_KEY_ID "$BRANDING_ASSET_STORAGE_ACCESS_KEY_ID"
    write_env_line BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY "$BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY"
    write_env_line BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE "$BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE"
    write_env_line PORTAL_TENANT_SECRET_KEY "$PORTAL_TENANT_SECRET_KEY"
    write_env_line DEFAULT_TENANT_SLUG "$DEFAULT_TENANT_SLUG"
    write_env_line DEFAULT_TENANT_DISPLAY_NAME "$DEFAULT_TENANT_DISPLAY_NAME"
    write_env_line DEFAULT_TENANT_PRIMARY_DOMAIN "$DEFAULT_TENANT_PRIMARY_DOMAIN"
    write_env_line DEFAULT_TENANT_PUBLIC_BASE_URL "$DEFAULT_TENANT_PUBLIC_BASE_URL"
    write_env_line DEFAULT_TENANT_CHATWOOT_BASE_URL "$DEFAULT_TENANT_CHATWOOT_BASE_URL"
    write_env_line DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID "$DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID"
    write_env_line DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN "$DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN"
    write_env_line DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN "$DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN"
    write_env_line DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID "$DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID"
    write_env_line DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET "$DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET"
    write_env_line SMTP_HOST "$SMTP_HOST"
    write_env_line SMTP_PORT "$SMTP_PORT"
    write_env_line SMTP_SECURE "$SMTP_SECURE"
    write_env_line SMTP_USER "$SMTP_USER"
    write_env_line SMTP_PASS "$SMTP_PASS"
    write_env_line SMTP_FROM "$SMTP_FROM"
    write_env_line PUSH_VAPID_PUBLIC_KEY "$PUSH_VAPID_PUBLIC_KEY"
    write_env_line PUSH_VAPID_PRIVATE_KEY "$PUSH_VAPID_PRIVATE_KEY"
    write_env_line PUSH_VAPID_SUBJECT "$PUSH_VAPID_SUBJECT"
    write_env_line PUSH_VAPID_KEY_ID "$PUSH_VAPID_KEY_ID"
    write_env_line PUSH_SUBSCRIPTION_ALLOWED_ORIGINS "$PUSH_SUBSCRIPTION_ALLOWED_ORIGINS"
  } >"$ENV_FILE"

  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE with mode 600."

  if getent ahosts "$PORTAL_DOMAIN" >/dev/null 2>&1; then
    echo "DNS resolves for $PORTAL_DOMAIN."
  else
    echo "Warning: DNS does not resolve for $PORTAL_DOMAIN from this VM yet."
  fi
}

load_runtime_env() {
  PORTAL_DEPLOYMENT_MODE="$(env_value PORTAL_DEPLOYMENT_MODE)"
  PORTAL_DOMAIN="$(env_value PORTAL_DOMAIN)"
  APP_ORIGIN="$(env_value APP_ORIGIN)"
  PORTAL_HTTP_PORT="$(env_value PORTAL_HTTP_PORT)"
  LETSENCRYPT_EMAIL="$(env_value LETSENCRYPT_EMAIL)"
  DEFAULT_TENANT_SLUG="$(env_value DEFAULT_TENANT_SLUG)"
}

validate_compose_config() {
  select_docker_command
  docker_compose config >/dev/null
  echo "Compose config is valid."
}

build_images() {
  docker_compose build
}

start_stack() {
  docker_compose up -d
  docker_compose ps
}

install_reverse_proxy_dependencies() {
  load_runtime_env
  if [[ "$PORTAL_DEPLOYMENT_MODE" != "reverse-proxy" ]]; then
    echo "Standalone mode selected; skipping host reverse proxy packages."
    return
  fi

  local missing="false"
  command -v nginx >/dev/null 2>&1 || missing="true"
  command -v certbot >/dev/null 2>&1 || missing="true"

  if [[ "$missing" != "true" ]]; then
    echo "nginx and certbot are already installed."
    return
  fi

  if ! confirm "Install nginx/certbot packages for reverse-proxy mode?" yes; then
    echo "Reverse proxy tools are required in reverse-proxy mode." >&2
    exit 1
  fi

  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y nginx certbot python3-certbot-nginx
  "${SUDO[@]}" systemctl enable --now nginx
}

configure_nginx_proxy() {
  load_runtime_env
  if [[ "$PORTAL_DEPLOYMENT_MODE" != "reverse-proxy" ]]; then
    echo "Standalone mode selected; Caddy handles public HTTP/HTTPS."
    return
  fi

  if ! command -v nginx >/dev/null 2>&1; then
    echo "nginx is not installed." >&2
    exit 1
  fi

  local tmp_conf
  local conf_path="/etc/nginx/sites-available/${APP_NAME}.conf"
  local enabled_path="/etc/nginx/sites-enabled/${APP_NAME}.conf"
  tmp_conf="$(mktemp)"

  cat >"$tmp_conf" <<EOF
server {
    listen 80;
    server_name ${PORTAL_DOMAIN};
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:${PORTAL_HTTP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

  "${SUDO[@]}" install -m 0644 "$tmp_conf" "$conf_path"
  rm -f "$tmp_conf"
  "${SUDO[@]}" ln -sfn "$conf_path" "$enabled_path"
  "${SUDO[@]}" nginx -t
  "${SUDO[@]}" systemctl reload nginx

  if [[ -n "$LETSENCRYPT_EMAIL" ]] && confirm "Request/renew HTTPS certificate for $PORTAL_DOMAIN via certbot?" yes; then
    "${SUDO[@]}" certbot --nginx \
      -d "$PORTAL_DOMAIN" \
      --non-interactive \
      --agree-tos \
      -m "$LETSENCRYPT_EMAIL" \
      --redirect
  else
    echo "Skipped certbot. HTTPS must be configured before real production traffic."
  fi
}

wait_for_public_health() {
  if [[ "$SKIP_PUBLIC_HEALTH" == "true" ]]; then
    echo "Public health check skipped by --skip-public-health."
    return
  fi

  load_runtime_env
  local url="${APP_ORIGIN}/api/health"
  echo "Waiting for $url"

  for attempt in $(seq 1 60); do
    if curl -fsS "$url" >/tmp/chatwoot-client-portal-v2-health.json 2>/dev/null; then
      cat /tmp/chatwoot-client-portal-v2-health.json
      echo
      return
    fi
    echo "Health check attempt $attempt/60 failed; retrying..."
    sleep 3
  done

  echo "Public health check failed for $url" >&2
  exit 1
}

wait_for_public_tenant() {
  if [[ "$SKIP_PUBLIC_HEALTH" == "true" ]]; then
    echo "Public tenant check skipped by --skip-public-health."
    return
  fi

  load_runtime_env
  local url="${APP_ORIGIN}/api/tenant"
  echo "Waiting for tenant context at $url"

  for attempt in $(seq 1 60); do
    if curl -fsS "$url" >/tmp/chatwoot-client-portal-v2-tenant.json 2>/dev/null; then
      cat /tmp/chatwoot-client-portal-v2-tenant.json
      echo
      return
    fi
    echo "Tenant check attempt $attempt/60 failed; retrying..."
    sleep 3
  done

  echo "Public tenant check failed for $url" >&2
  exit 1
}

bootstrap_default_tenant() {
  docker_compose exec -T portal-backend node backend/dist/scripts/bootstrap-default-tenant.js
}

configure_chatwoot_routing() {
  load_runtime_env
  docker_compose exec -T portal-backend node backend/dist/scripts/verify-tenant-chatwoot-connection.js "--tenant=${DEFAULT_TENANT_SLUG:-default}"
}

approve_chatwoot_api_channel_changes() {
  load_runtime_env

  echo "The next installer steps will make these Chatwoot API Channel changes for tenant '${DEFAULT_TENANT_SLUG:-default}':"
  echo "  - verify the configured inbox belongs to the tenant Chatwoot account and is Channel::Api;"
  echo "  - enable lock_to_single_conversation=true if it is currently disabled;"
  echo "  - set the API Channel webhook URL to the portal callback URL;"
  echo "  - store Chatwoot's returned Channel::Api.secret encrypted in the portal tenant record."
  echo
  echo "The installer will not stop, restart, migrate or edit Chatwoot core, database, uploads, services, or the chat.provgroup.ru Nginx site."

  if ! confirm "Approve these tenant API Channel configuration changes?" yes; then
    echo "Tenant Chatwoot API Channel configuration was not approved." >&2
    exit 1
  fi
}

require_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Env file is missing: $ENV_FILE" >&2
    echo "Run scripts/install-production.sh --install first." >&2
    exit 1
  fi
}

sync_chatwoot_webhook_secret() {
  require_env_file
  if ! select_docker_command; then
    echo "Docker Engine or Compose plugin is required for tenant webhook configuration." >&2
    exit 1
  fi

  load_runtime_env

  if ! step_done chatwoot_api_channel_approval; then
    approve_chatwoot_api_channel_changes
    mark_step_done chatwoot_api_channel_approval
  fi

  local webhook_output
  if ! webhook_output="$(
    docker_compose exec -T portal-backend \
      node backend/dist/scripts/configure-tenant-chatwoot-webhook.js \
      "--tenant=${DEFAULT_TENANT_SLUG:-default}"
  )"; then
    echo "Tenant Chatwoot webhook configuration failed." >&2
    exit 1
  fi

  echo "$webhook_output"
  unset webhook_output

  echo "Tenant API Channel webhook configured and its secret was stored in the portal tenant record."
  wait_for_public_health
  wait_for_public_tenant
}

run_maintenance_cleanup_helper() {
  local helper="$SCRIPT_DIR/install-maintenance-cleanup-timer.sh"

  if [[ ! -x "$helper" ]]; then
    echo "Maintenance cleanup helper is missing or is not executable: $helper" >&2
    exit 1
  fi

  "$helper" \
    "--app-path=$REPO_ROOT" \
    "--env-file=$ENV_FILE" \
    "--compose-file=$COMPOSE_FILE" \
    "$@"
}

install_maintenance_cleanup_timer() {
  run_maintenance_cleanup_helper --install
}

maintenance_cleanup_dry_run() {
  run_maintenance_cleanup_helper --dry-run
}

maintenance_cleanup_status() {
  run_maintenance_cleanup_helper --status
}

print_summary() {
  load_runtime_env
  echo
  echo "Production installer completed."
  echo "Portal: $APP_ORIGIN"
  echo "Env file: $ENV_FILE"
  echo "State file: $STATE_FILE"
  if [[ -n "${LOG_FILE:-}" ]]; then
    echo "Log file: $LOG_FILE"
  fi
  echo
  echo "Useful commands:"
  echo "  scripts/install-production.sh --status"
  echo "  scripts/install-production.sh --logs"
  echo "  scripts/install-production.sh --sync-webhook-secret"
  echo "  scripts/install-production.sh --install-maintenance-cleanup"
  echo "  scripts/install-production.sh --maintenance-cleanup-dry-run"
  echo "  docker compose --env-file .env.production -f infra/production/compose.yaml ps"
  echo "  docker compose --env-file .env.production -f infra/production/compose.yaml logs -f portal-backend portal-web portal-object-storage"
}

print_status() {
  echo "Repository: $REPO_ROOT"
  echo "Env file: $ENV_FILE"
  echo "State file: $STATE_FILE"
  echo

  if [[ -f "$STATE_FILE" ]]; then
    echo "Completed installer steps:"
    sed 's/^/  - /' "$STATE_FILE"
  else
    echo "No completed installer steps yet."
  fi

  echo
  if [[ -f "$ENV_FILE" ]] && select_docker_command; then
    docker_compose ps || true
  else
    echo "Compose status unavailable: env file or docker is missing."
  fi
}

if [[ "$ACTION" == "status" ]]; then
  print_status
  exit 0
fi

if [[ "$ACTION" == "sync-webhook-secret" ]]; then
  print_header "Sync Chatwoot webhook secret"
  sync_chatwoot_webhook_secret
  mark_step_done chatwoot_webhook_secret_sync
  echo "[done] Sync Chatwoot webhook secret"
  exit 0
fi

if [[ "$ACTION" == "install-maintenance-cleanup" ]]; then
  print_header "Install maintenance cleanup timer"
  install_maintenance_cleanup_timer
  mark_step_done maintenance_cleanup_timer
  echo "[done] Install maintenance cleanup timer"
  exit 0
fi

if [[ "$ACTION" == "maintenance-cleanup-dry-run" ]]; then
  print_header "Maintenance cleanup dry-run"
  maintenance_cleanup_dry_run
  exit 0
fi

if [[ "$ACTION" == "maintenance-cleanup-status" ]]; then
  print_header "Maintenance cleanup status"
  maintenance_cleanup_status
  exit 0
fi

run_step preflight "Preflight checks" preflight
run_step docker "Install or verify Docker Engine and Compose plugin" install_docker
run_step env "Collect production configuration" collect_env
run_step compose_config "Validate docker compose config" validate_compose_config
run_step reverse_proxy_deps "Install or verify reverse proxy dependencies" install_reverse_proxy_dependencies
run_step build "Build production images" build_images
run_step up "Start production stack" start_stack
run_step reverse_proxy "Configure host reverse proxy when needed" configure_nginx_proxy
run_step tenant_bootstrap "Bootstrap default tenant" bootstrap_default_tenant
run_step public_health "Verify public health endpoint" wait_for_public_health
run_step public_tenant "Verify public tenant endpoint" wait_for_public_tenant
run_step chatwoot_api_channel_approval "Approve tenant Chatwoot API Channel configuration changes" approve_chatwoot_api_channel_changes
run_step chatwoot_routing "Verify or enable tenant Chatwoot API Channel single-conversation routing" configure_chatwoot_routing
run_step chatwoot_webhook_secret_sync "Configure tenant API Channel webhook URL and store secret" sync_chatwoot_webhook_secret
run_step maintenance_cleanup_timer "Install daily portal maintenance cleanup timer" install_maintenance_cleanup_timer

print_summary
