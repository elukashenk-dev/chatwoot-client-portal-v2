#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN=""
LETSENCRYPT_EMAIL=""
EXPECTED_IP=""
EXPECTED_TENANT_SLUG=""
PORTAL_UPSTREAM="http://127.0.0.1:8088"
SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"
BACKUP_ROOT="/home/ubuntu/domain-ingress-backups"
LETSENCRYPT_LIVE_DIR="/etc/letsencrypt/live"
TENANT_STATE="missing"

GETENT_BIN="getent"
NGINX_BIN="nginx"
CERTBOT_BIN="certbot"
CURL_BIN="curl"
OPENSSL_BIN="openssl"

SKIP_CERTBOT="false"
SKIP_NGINX_RELOAD="false"
SKIP_PUBLIC_VERIFY="false"

usage() {
  cat <<'EOF'
Usage:
  scripts/configure-tenant-domain-ingress.sh \
    --domain=lk.example.com \
    --letsencrypt-email=ops@lancora.ru \
    --expected-ip=93.77.166.238

Options:
  --domain=<host>                 Tenant portal host to configure.
  --letsencrypt-email=<email>     Let's Encrypt registration email.
  --expected-ip=<ipv4>            Public VM IPv4 that DNS must resolve to.
  --tenant-state=missing|present|any
                                  Expected /api/tenant state. Default: missing.
  --expected-tenant-slug=<slug>   Required when --tenant-state=present.
  --portal-upstream=<url>         Portal frontend upstream. Default: http://127.0.0.1:8088.
  --sites-available=<path>        Nginx sites-available directory.
  --sites-enabled=<path>          Nginx sites-enabled directory.
  --backup-root=<path>            Backup root for changed Nginx files.
  --letsencrypt-live-dir=<path>   Let's Encrypt live directory.
  --skip-certbot                  Do not run certbot.
  --skip-nginx-reload             Run nginx -t but do not reload.
  --skip-public-verify            Skip HTTP/HTTPS/certificate public checks.
  --getent-bin=<path>             Override getent for tests.
  --nginx-bin=<path>              Override nginx for tests.
  --certbot-bin=<path>            Override certbot for tests.
  --curl-bin=<path>               Override curl for tests.
  --openssl-bin=<path>            Override openssl for tests.
  --help                          Show this help.
EOF
}

require_value() {
  local option="$1"
  local value="${2:-}"

  if [[ -z "$value" ]]; then
    echo "$option requires a value." >&2
    exit 2
  fi
}

read_option_value() {
  local option="$1"
  local current="$2"
  shift 2

  if [[ "$current" == *=* ]]; then
    printf '%s\n' "${current#*=}"
    return 1
  fi

  if [[ $# -lt 1 ]]; then
    echo "$option requires a value." >&2
    exit 2
  fi

  printf '%s\n' "$1"
  return 0
}

while [[ $# -gt 0 ]]; do
  arg="$1"
  case "$arg" in
    --domain|--domain=*)
      if value="$(read_option_value --domain "$arg" "${2:-}")"; then shift 2; else shift; fi
      DOMAIN="$value"
      ;;
    --letsencrypt-email|--letsencrypt-email=*)
      if value="$(read_option_value --letsencrypt-email "$arg" "${2:-}")"; then shift 2; else shift; fi
      LETSENCRYPT_EMAIL="$value"
      ;;
    --expected-ip|--expected-ip=*)
      if value="$(read_option_value --expected-ip "$arg" "${2:-}")"; then shift 2; else shift; fi
      EXPECTED_IP="$value"
      ;;
    --tenant-state|--tenant-state=*)
      if value="$(read_option_value --tenant-state "$arg" "${2:-}")"; then shift 2; else shift; fi
      TENANT_STATE="$value"
      ;;
    --expected-tenant-slug|--expected-tenant-slug=*)
      if value="$(read_option_value --expected-tenant-slug "$arg" "${2:-}")"; then shift 2; else shift; fi
      EXPECTED_TENANT_SLUG="$value"
      ;;
    --portal-upstream|--portal-upstream=*)
      if value="$(read_option_value --portal-upstream "$arg" "${2:-}")"; then shift 2; else shift; fi
      PORTAL_UPSTREAM="$value"
      ;;
    --sites-available|--sites-available=*)
      if value="$(read_option_value --sites-available "$arg" "${2:-}")"; then shift 2; else shift; fi
      SITES_AVAILABLE="$value"
      ;;
    --sites-enabled|--sites-enabled=*)
      if value="$(read_option_value --sites-enabled "$arg" "${2:-}")"; then shift 2; else shift; fi
      SITES_ENABLED="$value"
      ;;
    --backup-root|--backup-root=*)
      if value="$(read_option_value --backup-root "$arg" "${2:-}")"; then shift 2; else shift; fi
      BACKUP_ROOT="$value"
      ;;
    --letsencrypt-live-dir|--letsencrypt-live-dir=*)
      if value="$(read_option_value --letsencrypt-live-dir "$arg" "${2:-}")"; then shift 2; else shift; fi
      LETSENCRYPT_LIVE_DIR="$value"
      ;;
    --getent-bin|--getent-bin=*)
      if value="$(read_option_value --getent-bin "$arg" "${2:-}")"; then shift 2; else shift; fi
      GETENT_BIN="$value"
      ;;
    --nginx-bin|--nginx-bin=*)
      if value="$(read_option_value --nginx-bin "$arg" "${2:-}")"; then shift 2; else shift; fi
      NGINX_BIN="$value"
      ;;
    --certbot-bin|--certbot-bin=*)
      if value="$(read_option_value --certbot-bin "$arg" "${2:-}")"; then shift 2; else shift; fi
      CERTBOT_BIN="$value"
      ;;
    --curl-bin|--curl-bin=*)
      if value="$(read_option_value --curl-bin "$arg" "${2:-}")"; then shift 2; else shift; fi
      CURL_BIN="$value"
      ;;
    --openssl-bin|--openssl-bin=*)
      if value="$(read_option_value --openssl-bin "$arg" "${2:-}")"; then shift 2; else shift; fi
      OPENSSL_BIN="$value"
      ;;
    --skip-certbot)
      SKIP_CERTBOT="true"
      shift
      ;;
    --skip-nginx-reload)
      SKIP_NGINX_RELOAD="true"
      shift
      ;;
    --skip-public-verify)
      SKIP_PUBLIC_VERIFY="true"
      shift
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

DOMAIN="${DOMAIN,,}"
require_value --domain "$DOMAIN"
require_value --letsencrypt-email "$LETSENCRYPT_EMAIL"
require_value --expected-ip "$EXPECTED_IP"

if [[ "$TENANT_STATE" != "missing" && "$TENANT_STATE" != "present" && "$TENANT_STATE" != "any" ]]; then
  echo "--tenant-state must be missing, present or any." >&2
  exit 2
fi

if [[ "$DOMAIN" == *"://"* || "$DOMAIN" == *"/"* || "$DOMAIN" == *"?"* || "$DOMAIN" == *"#"* || "$DOMAIN" == *":"* ]]; then
  echo "Domain must be a host without protocol, path or port." >&2
  exit 2
fi

if [[ ! "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]; then
  echo "Domain must be a valid DNS host." >&2
  exit 2
fi

if [[ ! "$EXPECTED_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "--expected-ip must be an IPv4 address." >&2
  exit 2
fi

if [[ ! "$LETSENCRYPT_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "--letsencrypt-email must be an email address." >&2
  exit 2
fi

if [[ ! "$PORTAL_UPSTREAM" =~ ^https?:// ]]; then
  echo "--portal-upstream must start with http:// or https://." >&2
  exit 2
fi

if [[ "$TENANT_STATE" == "present" ]]; then
  require_value --expected-tenant-slug "$EXPECTED_TENANT_SLUG"
fi

if [[ -n "$EXPECTED_TENANT_SLUG" && ! "$EXPECTED_TENANT_SLUG" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "--expected-tenant-slug must be a lowercase tenant slug." >&2
  exit 2
fi

SITE_BASENAME="chatwoot-client-portal-${DOMAIN//./-}.conf"
SITE_PATH="$SITES_AVAILABLE/$SITE_BASENAME"
ENABLED_PATH="$SITES_ENABLED/$SITE_BASENAME"
BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"

ensure_command() {
  local command_path="$1"
  local label="$2"

  if ! command -v "$command_path" >/dev/null 2>&1; then
    echo "$label command not found: $command_path" >&2
    exit 1
  fi
}

ensure_command "$GETENT_BIN" getent
ensure_command "$NGINX_BIN" nginx
if [[ "$SKIP_CERTBOT" != "true" ]]; then
  ensure_command "$CERTBOT_BIN" certbot
fi
if [[ "$SKIP_PUBLIC_VERIFY" != "true" ]]; then
  ensure_command "$CURL_BIN" curl
  ensure_command "$OPENSSL_BIN" openssl
fi

verify_dns() {
  local resolved_ips

  resolved_ips="$("$GETENT_BIN" ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u)"

  if [[ -z "$resolved_ips" ]]; then
    echo "DNS did not resolve $DOMAIN." >&2
    exit 1
  fi

  if ! grep -Fxq "$EXPECTED_IP" <<<"$resolved_ips"; then
    echo "DNS for $DOMAIN does not include expected IP $EXPECTED_IP." >&2
    echo "Resolved IPs:" >&2
    printf '%s\n' "$resolved_ips" >&2
    exit 1
  fi
}

cert_exists() {
  [[ -f "$LETSENCRYPT_LIVE_DIR/$DOMAIN/fullchain.pem" && -f "$LETSENCRYPT_LIVE_DIR/$DOMAIN/privkey.pem" ]]
}

render_proxy_location() {
  cat <<EOF
    client_max_body_size 50m;

    location / {
        proxy_pass $PORTAL_UPSTREAM;
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
EOF
}

render_http_only_config() {
  cat <<EOF
server {
    listen 80;
    server_name $DOMAIN;
$(render_proxy_location)
}
EOF
}

render_tls_config() {
  cat <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;
$(render_proxy_location)

    ssl_certificate $LETSENCRYPT_LIVE_DIR/$DOMAIN/fullchain.pem;
    ssl_certificate_key $LETSENCRYPT_LIVE_DIR/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
EOF
}

render_config_file() {
  local output_path="$1"

  if cert_exists; then
    render_tls_config >"$output_path"
  else
    render_http_only_config >"$output_path"
  fi
}

ensure_backup_dir() {
  mkdir -p "$BACKUP_DIR"
}

backup_path() {
  local path="$1"
  local suffix="$2"

  ensure_backup_dir
  cp -a "$path" "$BACKUP_DIR/$(basename "$path")$suffix"
}

write_site_config() {
  local temp_file
  temp_file="$(mktemp)"
  render_config_file "$temp_file"

  mkdir -p "$SITES_AVAILABLE" "$SITES_ENABLED" "$BACKUP_ROOT"

  if [[ -f "$SITE_PATH" ]] && cmp -s "$temp_file" "$SITE_PATH"; then
    rm -f "$temp_file"
    echo "Nginx site already up to date: $SITE_PATH"
    return
  fi

  if [[ -e "$SITE_PATH" ]]; then
    backup_path "$SITE_PATH" ""
  fi

  install -m 0644 "$temp_file" "$SITE_PATH"
  rm -f "$temp_file"
  echo "Wrote Nginx site: $SITE_PATH"
}

enable_site() {
  if [[ -L "$ENABLED_PATH" ]]; then
    local current_target
    current_target="$(readlink "$ENABLED_PATH")"
    if [[ "$current_target" == "$SITE_PATH" ]]; then
      echo "Nginx site already enabled: $ENABLED_PATH"
      return
    fi

    backup_path "$ENABLED_PATH" ".enabled"
    rm -f "$ENABLED_PATH"
  elif [[ -e "$ENABLED_PATH" ]]; then
    backup_path "$ENABLED_PATH" ".enabled"
    rm -rf "$ENABLED_PATH"
  fi

  ln -s "$SITE_PATH" "$ENABLED_PATH"
  echo "Enabled Nginx site: $ENABLED_PATH"
}

test_and_reload_nginx() {
  "$NGINX_BIN" -t

  if [[ "$SKIP_NGINX_RELOAD" == "true" ]]; then
    echo "Skipped nginx reload."
    return
  fi

  "$NGINX_BIN" -s reload
}

run_certbot() {
  if [[ "$SKIP_CERTBOT" == "true" ]]; then
    echo "Skipped certbot."
    return
  fi

  "$CERTBOT_BIN" --nginx --non-interactive --agree-tos \
    --email "$LETSENCRYPT_EMAIL" \
    -d "$DOMAIN" \
    --redirect
}

verify_cert() {
  if [[ "$SKIP_PUBLIC_VERIFY" == "true" ]]; then
    return
  fi

  if ! "$OPENSSL_BIN" s_client -servername "$DOMAIN" -connect "$DOMAIN:443" </dev/null 2>/dev/null |
    "$OPENSSL_BIN" x509 -noout -ext subjectAltName |
    grep -Fq "DNS:$DOMAIN"; then
    echo "HTTPS certificate for $DOMAIN does not include the requested SAN." >&2
    exit 1
  fi
}

verify_tenant_endpoint() {
  local url="$1"
  local body_file status body

  if [[ "$SKIP_PUBLIC_VERIFY" == "true" ]]; then
    return
  fi

  body_file="$(mktemp)"
  status="$("$CURL_BIN" -sS -o "$body_file" -w '%{http_code}' "$url")"
  body="$(cat "$body_file")"
  rm -f "$body_file"

  if [[ "$TENANT_STATE" == "missing" ]]; then
    if [[ "$status" != "404" || "$body" != *"TENANT_NOT_FOUND"* ]]; then
      echo "Expected $url to return TENANT_NOT_FOUND before tenant creation." >&2
      echo "HTTP status: $status" >&2
      echo "Body: $body" >&2
      exit 1
    fi
    return
  fi

  if [[ "$TENANT_STATE" == "present" ]]; then
    if [[ "$status" != "200" || "$body" != *'"tenant"'* ]]; then
      echo "Expected $url to return an existing tenant." >&2
      echo "HTTP status: $status" >&2
      echo "Body: $body" >&2
      exit 1
    fi

    if [[ "$body" != *"\"slug\":\"$EXPECTED_TENANT_SLUG\""* ]]; then
      echo "Expected $url to return tenant slug $EXPECTED_TENANT_SLUG." >&2
      echo "Body: $body" >&2
      exit 1
    fi

    return
  fi

  if [[ "$status" == "404" && "$body" == *"TENANT_NOT_FOUND"* ]]; then
    return
  fi

  if [[ "$status" == "200" && "$body" == *'"tenant"'* ]]; then
    return
  fi

  echo "Expected $url to reach portal tenant endpoint." >&2
  echo "HTTP status: $status" >&2
  echo "Body: $body" >&2
  exit 1
}

verify_http_redirect_to_https() {
  local url="$1"
  local body_file output status redirect_url

  if [[ "$SKIP_PUBLIC_VERIFY" == "true" ]]; then
    return
  fi

  body_file="$(mktemp)"
  output="$("$CURL_BIN" -sS -o "$body_file" -w '%{http_code} %{redirect_url}' "$url")"
  rm -f "$body_file"

  status="${output%% *}"
  redirect_url="${output#"$status"}"
  redirect_url="${redirect_url# }"

  case "$status" in
    301|302|307|308)
      ;;
    *)
      echo "Expected $url to redirect to HTTPS after certificate setup." >&2
      echo "HTTP status: $status" >&2
      exit 1
      ;;
  esac

  if [[ "$redirect_url" != "https://$DOMAIN/api/tenant" ]]; then
    echo "Expected $url to redirect to https://$DOMAIN/api/tenant." >&2
    echo "Redirect URL: ${redirect_url:-<missing>}" >&2
    exit 1
  fi
}

verify_http_before_certbot() {
  if cert_exists; then
    verify_http_redirect_to_https "http://$DOMAIN/api/tenant"
    return
  fi

  verify_tenant_endpoint "http://$DOMAIN/api/tenant"
}

verify_dns
write_site_config
enable_site
test_and_reload_nginx
verify_http_before_certbot
run_certbot

if [[ "$SKIP_CERTBOT" != "true" ]]; then
  write_site_config
  test_and_reload_nginx
fi

verify_cert
verify_tenant_endpoint "https://$DOMAIN/api/tenant"

echo "Tenant domain ingress is ready for $DOMAIN."
