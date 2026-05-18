#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="chatwoot-client-portal-v2"
UNIT_NAME="${APP_NAME}-maintenance-cleanup"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"

ACTION="install"
APP_PATH="${APP_PATH:-$REPO_ROOT}"
ENV_FILE="${ENV_FILE:-}"
COMPOSE_FILE="${COMPOSE_FILE:-}"
DOCKER_BIN="${DOCKER_BIN:-}"
SCHEDULE="${PORTAL_MAINTENANCE_CLEANUP_ON_CALENDAR:-*-*-* 03:20:00}"
RANDOMIZED_DELAY="${PORTAL_MAINTENANCE_CLEANUP_RANDOMIZED_DELAY_SEC:-20m}"
SUDO=()

usage() {
  cat <<'EOF'
Usage:
  scripts/install-maintenance-cleanup-timer.sh --install
  scripts/install-maintenance-cleanup-timer.sh --dry-run
  scripts/install-maintenance-cleanup-timer.sh --run-now
  scripts/install-maintenance-cleanup-timer.sh --status

Options:
  --install                    Install and enable the systemd timer.
  --dry-run                    Run cleanup in dry-run mode immediately.
  --run-now                    Start the cleanup systemd service once.
  --status                     Show timer status.
  --print-service              Print the generated systemd service.
  --print-timer                Print the generated systemd timer.
  --app-path=<path>            App directory. Defaults to this repository root.
  --env-file=<path>            Production env file. Defaults to <app-path>/.env.production.
  --compose-file=<path>        Compose file. Defaults to <app-path>/infra/production/compose.yaml.
  --docker=<path>              Docker binary path. Defaults to command -v docker.
  --schedule=<calendar>        systemd OnCalendar value. Defaults to daily 03:20.
  --randomized-delay=<value>   systemd RandomizedDelaySec value. Defaults to 20m.
  --help                       Show this help.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --install)
      ACTION="install"
      ;;
    --dry-run)
      ACTION="dry-run"
      ;;
    --run-now)
      ACTION="run-now"
      ;;
    --status)
      ACTION="status"
      ;;
    --print-service)
      ACTION="print-service"
      ;;
    --print-timer)
      ACTION="print-timer"
      ;;
    --app-path=*)
      APP_PATH="${arg#--app-path=}"
      ;;
    --env-file=*)
      ENV_FILE="${arg#--env-file=}"
      ;;
    --compose-file=*)
      COMPOSE_FILE="${arg#--compose-file=}"
      ;;
    --docker=*)
      DOCKER_BIN="${arg#--docker=}"
      ;;
    --schedule=*)
      SCHEDULE="${arg#--schedule=}"
      ;;
    --randomized-delay=*)
      RANDOMIZED_DELAY="${arg#--randomized-delay=}"
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

ENV_FILE="${ENV_FILE:-$APP_PATH/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_PATH/infra/production/compose.yaml}"
SERVICE_PATH="/etc/systemd/system/${UNIT_NAME}.service"
TIMER_PATH="/etc/systemd/system/${UNIT_NAME}.timer"

if [[ "$EUID" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO=(sudo)
  else
    SUDO=()
  fi
fi

resolve_docker_bin() {
  if [[ -n "$DOCKER_BIN" ]]; then
    printf '%s\n' "$DOCKER_BIN"
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    command -v docker
    return
  fi

  echo "docker binary was not found." >&2
  exit 1
}

require_no_whitespace() {
  local name="$1"
  local value="$2"

  if [[ "$value" =~ [[:space:]] ]]; then
    echo "$name must not contain whitespace for systemd ExecStart rendering: $value" >&2
    exit 1
  fi
}

render_service() {
  local docker_bin="$1"

  require_no_whitespace "app path" "$APP_PATH"
  require_no_whitespace "env file" "$ENV_FILE"
  require_no_whitespace "compose file" "$COMPOSE_FILE"
  require_no_whitespace "docker binary" "$docker_bin"

  cat <<EOF
[Unit]
Description=Chatwoot Client Portal v2 maintenance cleanup
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=${APP_PATH}
ExecStart=${docker_bin} compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} exec -T portal-backend node backend/dist/scripts/cleanup-maintenance-data.js
TimeoutStartSec=10min
Restart=on-failure
RestartSec=5min
StartLimitIntervalSec=30min
StartLimitBurst=3
Nice=10
EOF
}

render_timer() {
  cat <<EOF
[Unit]
Description=Run Chatwoot Client Portal v2 maintenance cleanup daily

[Timer]
OnCalendar=${SCHEDULE}
Persistent=true
RandomizedDelaySec=${RANDOMIZED_DELAY}
Unit=${UNIT_NAME}.service

[Install]
WantedBy=timers.target
EOF
}

run_cleanup_command() {
  local docker_bin="$1"
  shift

  "$docker_bin" compose \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    exec -T portal-backend \
    node backend/dist/scripts/cleanup-maintenance-data.js "$@"
}

install_timer() {
  local docker_bin
  docker_bin="$(resolve_docker_bin)"

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
  fi

  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "Missing compose file: $COMPOSE_FILE" >&2
    exit 1
  fi

  echo "Running maintenance cleanup dry-run before enabling timer..."
  run_cleanup_command "$docker_bin" --dry-run

  local service_tmp
  local timer_tmp
  service_tmp="$(mktemp)"
  timer_tmp="$(mktemp)"
  trap 'rm -f "$service_tmp" "$timer_tmp"' RETURN

  render_service "$docker_bin" >"$service_tmp"
  render_timer >"$timer_tmp"

  "${SUDO[@]}" install -m 0644 "$service_tmp" "$SERVICE_PATH"
  "${SUDO[@]}" install -m 0644 "$timer_tmp" "$TIMER_PATH"
  "${SUDO[@]}" systemctl daemon-reload
  "${SUDO[@]}" systemctl enable --now "${UNIT_NAME}.timer"
  "${SUDO[@]}" systemctl list-timers --all "${UNIT_NAME}.timer" --no-pager
}

case "$ACTION" in
  print-service)
    render_service "$(resolve_docker_bin)"
    ;;
  print-timer)
    render_timer
    ;;
  dry-run)
    run_cleanup_command "$(resolve_docker_bin)" --dry-run
    ;;
  run-now)
    "${SUDO[@]}" systemctl start "${UNIT_NAME}.service"
    ;;
  status)
    "${SUDO[@]}" systemctl status "${UNIT_NAME}.timer" --no-pager || true
    "${SUDO[@]}" systemctl list-timers --all "${UNIT_NAME}.timer" --no-pager || true
    ;;
  install)
    install_timer
    ;;
  *)
    echo "Unsupported action: $ACTION" >&2
    exit 2
    ;;
esac
