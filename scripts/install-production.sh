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
  scripts/install-production.sh --paste-webhook-secret
  scripts/install-production.sh --status
  scripts/install-production.sh --logs
  scripts/install-production.sh --reset-state

Options:
  --install             Run or resume the production installer.
  --reconfigure         Ask all env questions again and reset installer state.
  --sync-webhook-secret Re-provision the Chatwoot webhook, sync its actual secret, recreate backend, and check health.
  --paste-webhook-secret Prompt for the Chatwoot webhook secret, recreate backend, and check health.
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
    --paste-webhook-secret)
      ACTION="paste-webhook-secret"
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

if [[ "$ACTION" == "install" || "$ACTION" == "sync-webhook-secret" || "$ACTION" == "paste-webhook-secret" ]]; then
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
    paste-webhook-secret)
      retry_command="scripts/install-production.sh --paste-webhook-secret"
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

upsert_env_value() {
  local key="$1"
  local value="$2"
  local next_line
  local tmp_file

  next_line="$(write_env_line "$key" "$value")"
  tmp_file="$(mktemp)"

  if [[ -f "$ENV_FILE" ]]; then
    awk -v key="$key" -v next_line="$next_line" '
      BEGIN { replaced = 0 }
      index($0, key "=") == 1 {
        if (replaced == 0) {
          print next_line
          replaced = 1
        }
        next
      }
      { print }
      END {
        if (replaced == 0) {
          print next_line
        }
      }
    ' "$ENV_FILE" >"$tmp_file"
    cat "$tmp_file" >"$ENV_FILE"
  else
    printf '%s\n' "$next_line" >"$ENV_FILE"
  fi

  chmod 600 "$ENV_FILE"
  rm -f "$tmp_file"
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

  prompt_value CHATWOOT_BASE_URL "Existing Chatwoot base URL" "$(env_value CHATWOOT_BASE_URL)"
  CHATWOOT_BASE_URL="$(strip_trailing_slash "$CHATWOOT_BASE_URL")"
  prompt_value CHATWOOT_ACCOUNT_ID "Chatwoot account ID" "$(env_value CHATWOOT_ACCOUNT_ID)"
  prompt_secret CHATWOOT_API_ACCESS_TOKEN "Dedicated Chatwoot API access token" "$(env_value CHATWOOT_API_ACCESS_TOKEN)"
  prompt_value CHATWOOT_PORTAL_INBOX_ID "Chatwoot portal inbox ID" "$(env_value CHATWOOT_PORTAL_INBOX_ID)"

  CHATWOOT_WEBHOOK_CALLBACK_URL_DEFAULT="$(env_value CHATWOOT_WEBHOOK_CALLBACK_URL)"
  CHATWOOT_WEBHOOK_CALLBACK_URL_DEFAULT="${CHATWOOT_WEBHOOK_CALLBACK_URL_DEFAULT:-$APP_ORIGIN/api/integrations/chatwoot/webhooks/account}"
  prompt_value CHATWOOT_WEBHOOK_CALLBACK_URL "Chatwoot webhook callback URL" "$CHATWOOT_WEBHOOK_CALLBACK_URL_DEFAULT"
  local existing_webhook_secret
  existing_webhook_secret="$(env_value CHATWOOT_WEBHOOK_SECRET)"
  CHATWOOT_WEBHOOK_SECRET="${existing_webhook_secret:-$(random_base64 32)}"
  if [[ -n "$existing_webhook_secret" ]]; then
    echo "Keeping existing bootstrap Chatwoot webhook secret until the sync step reads the actual secret from Chatwoot."
  else
    echo "Generated a temporary bootstrap Chatwoot webhook secret. The sync step will replace it with Chatwoot's actual webhook secret."
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
    write_env_line SESSION_COOKIE_NAME portal_session
    write_env_line SESSION_SECRET "$SESSION_SECRET"
    write_env_line SESSION_TTL_DAYS 14
    write_env_line PORTAL_V2_POSTGRES_DB "$PORTAL_V2_POSTGRES_DB"
    write_env_line PORTAL_V2_POSTGRES_USER "$PORTAL_V2_POSTGRES_USER"
    write_env_line PORTAL_V2_POSTGRES_PASSWORD "$PORTAL_V2_POSTGRES_PASSWORD"
    write_env_line DATABASE_URL "$DATABASE_URL"
    write_env_line CHATWOOT_BASE_URL "$CHATWOOT_BASE_URL"
    write_env_line CHATWOOT_ACCOUNT_ID "$CHATWOOT_ACCOUNT_ID"
    write_env_line CHATWOOT_API_ACCESS_TOKEN "$CHATWOOT_API_ACCESS_TOKEN"
    write_env_line CHATWOOT_PORTAL_INBOX_ID "$CHATWOOT_PORTAL_INBOX_ID"
    write_env_line CHATWOOT_WEBHOOK_CALLBACK_URL "$CHATWOOT_WEBHOOK_CALLBACK_URL"
    write_env_line CHATWOOT_WEBHOOK_SECRET "$CHATWOOT_WEBHOOK_SECRET"
    write_env_line SMTP_HOST "$SMTP_HOST"
    write_env_line SMTP_PORT "$SMTP_PORT"
    write_env_line SMTP_SECURE "$SMTP_SECURE"
    write_env_line SMTP_USER "$SMTP_USER"
    write_env_line SMTP_PASS "$SMTP_PASS"
    write_env_line SMTP_FROM "$SMTP_FROM"
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

configure_chatwoot_routing() {
  docker_compose exec -T portal-backend node backend/dist/scripts/ensure-chatwoot-portal-inbox-routing.js
}

extract_machine_value() {
  local key="$1"
  local content="$2"

  printf '%s\n' "$content" |
    awk -v key="$key" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2) } END { print value }'
}

require_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Env file is missing: $ENV_FILE" >&2
    echo "Run scripts/install-production.sh --install first." >&2
    exit 1
  fi
}

recreate_portal_backend() {
  if ! select_docker_command; then
    echo "Docker Engine or Compose plugin is required for backend recreate." >&2
    exit 1
  fi

  echo "Recreating portal-backend with the synced webhook secret."
  docker_compose up -d --force-recreate --no-deps portal-backend
  docker_compose ps portal-backend
}

print_webhook_secret_fallback() {
  echo
  echo "Chatwoot did not return the webhook secret through the account webhook API."
  echo "Open the Chatwoot webhook edit form, copy the secret, then run:"
  echo "  scripts/install-production.sh --paste-webhook-secret"
  echo
  echo "The installer stopped before marking webhook secret sync as completed."
}

sync_chatwoot_webhook_secret() {
  require_env_file
  if ! select_docker_command; then
    echo "Docker Engine or Compose plugin is required for webhook secret sync." >&2
    exit 1
  fi

  local webhook_output
  if ! webhook_output="$(docker_compose exec -T portal-backend node backend/dist/scripts/configure-chatwoot-account-webhook.js --installer-output)"; then
    echo "Chatwoot webhook provisioning failed." >&2
    exit 1
  fi

  local action
  local callback_url
  local has_secret
  local secret
  local secret_source
  local subscriptions
  local webhook_id
  local webhook_url

  action="$(extract_machine_value ACTION "$webhook_output")"
  callback_url="$(extract_machine_value CALLBACK_URL "$webhook_output")"
  has_secret="$(extract_machine_value WEBHOOK_HAS_SECRET "$webhook_output")"
  secret="$(extract_machine_value WEBHOOK_SECRET "$webhook_output")"
  secret_source="$(extract_machine_value SECRET_SOURCE "$webhook_output")"
  subscriptions="$(extract_machine_value SUBSCRIPTIONS "$webhook_output")"
  webhook_id="$(extract_machine_value WEBHOOK_ID "$webhook_output")"
  webhook_url="$(extract_machine_value WEBHOOK_URL "$webhook_output")"
  unset webhook_output

  if [[ "$has_secret" != "true" || -z "$secret" ]]; then
    unset secret
    print_webhook_secret_fallback
    exit 1
  fi

  upsert_env_value CHATWOOT_WEBHOOK_SECRET "$secret"
  unset secret

  echo "Chatwoot account webhook ${action:-configured}."
  echo "Webhook id: ${webhook_id:-unknown}"
  echo "Webhook URL: ${webhook_url:-$callback_url}"
  echo "Subscriptions: ${subscriptions:-unknown}"
  echo "Webhook secret source: ${secret_source:-unknown}"
  echo "Updated CHATWOOT_WEBHOOK_SECRET in $ENV_FILE."

  recreate_portal_backend
  wait_for_public_health
}

paste_chatwoot_webhook_secret() {
  require_env_file

  local pasted_secret
  prompt_secret pasted_secret "Paste Chatwoot webhook secret" ""
  if [[ -z "$pasted_secret" ]]; then
    echo "Chatwoot webhook secret is required." >&2
    exit 1
  fi

  upsert_env_value CHATWOOT_WEBHOOK_SECRET "$pasted_secret"
  unset pasted_secret
  echo "Updated CHATWOOT_WEBHOOK_SECRET in $ENV_FILE."

  recreate_portal_backend
  wait_for_public_health
  mark_step_done chatwoot_webhook_secret_sync
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
  echo "  scripts/install-production.sh --paste-webhook-secret"
  echo "  docker compose --env-file .env.production -f infra/production/compose.yaml ps"
  echo "  docker compose --env-file .env.production -f infra/production/compose.yaml logs -f portal-backend portal-web"
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

if [[ "$ACTION" == "paste-webhook-secret" ]]; then
  print_header "Paste Chatwoot webhook secret"
  paste_chatwoot_webhook_secret
  echo "[done] Paste Chatwoot webhook secret"
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
run_step public_health "Verify public health endpoint" wait_for_public_health
run_step chatwoot_routing "Verify Chatwoot portal inbox routing" configure_chatwoot_routing
run_step chatwoot_webhook_secret_sync "Create or update Chatwoot account webhook and sync secret" sync_chatwoot_webhook_secret

print_summary
