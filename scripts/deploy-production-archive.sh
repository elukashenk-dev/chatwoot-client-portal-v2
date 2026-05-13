#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="chatwoot-client-portal-v2"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"

SSH_TARGET=""
SSH_PORT="22"
REMOTE_APP_PATH=""
REMOTE_ARCHIVE_DIR="/tmp"
ARCHIVE_PATH=""
ACTIVATE="false"
SYNC_WEBHOOK_SECRET="false"
KEEP_REMOTE_ARCHIVE="false"
ALLOW_DIRTY_PREVIEW="false"
PREVIEW_LABEL=""

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-production-archive.sh --host=user@vm --app-path=/opt/chatwoot-client-portal-v2
  scripts/deploy-production-archive.sh --host=user@vm --app-path=/opt/chatwoot-client-portal-v2 --activate
  scripts/deploy-production-archive.sh --host=user@vm --app-path=/opt/chatwoot-client-portal-v2 --activate --sync-webhook-secret

Options:
  --host               SSH target, for example ubuntu@93.77.166.238.
  --app-path           Existing app directory on the VM.
  --ssh-port           SSH port. Default: 22.
  --archive-path       Local path for the generated tar.gz archive.
  --remote-archive-dir Remote temp directory for the uploaded archive. Default: /tmp.
  --activate           After unpacking on the VM, run docker compose up -d --build.
  --sync-webhook-secret
                       After --activate, configure the tenant API Channel webhook through scripts/install-production.sh --sync-webhook-secret.
  --allow-dirty-preview
                       Allow deploying uncommitted local changes for an explicit device-review preview.
  --preview-label=<label>
                       Short label for a preview deploy, for example mt-8-5-auth-ui-mobile.
  --keep-remote-archive
                       Do not delete the uploaded archive from the VM after unpack.
  --help               Show this help.

Notes:
  - Clean production deploys should come from a reviewed commit.
  - Dirty working tree deploys are blocked unless --allow-dirty-preview and --preview-label are provided.
  - Every archive includes DEPLOY_SOURCE.txt with branch, commit, dirty status, preview label and git status.
  - The VM update preserves .env.production, .install, logs, backups, and any local .git directory.
  - Use this helper for feature-slice validation on an already bootstrapped tenant-aware VM.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --)
      ;;
    --host=*)
      SSH_TARGET="${arg#*=}"
      ;;
    --app-path=*)
      REMOTE_APP_PATH="${arg#*=}"
      ;;
    --ssh-port=*)
      SSH_PORT="${arg#*=}"
      ;;
    --archive-path=*)
      ARCHIVE_PATH="${arg#*=}"
      ;;
    --remote-archive-dir=*)
      REMOTE_ARCHIVE_DIR="${arg#*=}"
      ;;
    --activate)
      ACTIVATE="true"
      ;;
    --sync-webhook-secret)
      SYNC_WEBHOOK_SECRET="true"
      ;;
    --allow-dirty-preview)
      ALLOW_DIRTY_PREVIEW="true"
      ;;
    --preview-label=*)
      PREVIEW_LABEL="${arg#*=}"
      ;;
    --preview-label)
      echo "--preview-label requires a value, for example --preview-label=mt-8-5-auth-ui-mobile." >&2
      exit 2
      ;;
    --keep-remote-archive)
      KEEP_REMOTE_ARCHIVE="true"
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

if [[ -z "$SSH_TARGET" || -z "$REMOTE_APP_PATH" ]]; then
  echo "--host and --app-path are required." >&2
  usage
  exit 2
fi

if [[ "$SYNC_WEBHOOK_SECRET" == "true" && "$ACTIVATE" != "true" ]]; then
  echo "--sync-webhook-secret requires --activate." >&2
  exit 2
fi

if [[ "$ALLOW_DIRTY_PREVIEW" == "true" && -z "$PREVIEW_LABEL" ]]; then
  echo "--allow-dirty-preview requires --preview-label=<label>." >&2
  exit 2
fi

if [[ -n "$PREVIEW_LABEL" && ! "$PREVIEW_LABEL" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "--preview-label may contain only letters, numbers, dots, underscores and hyphens." >&2
  exit 2
fi

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
}

git_output() {
  git -C "$REPO_ROOT" "$@" 2>/dev/null || true
}

git_status_short() {
  git_output status --short
}

assert_release_source_is_approved() {
  local status_short

  status_short="$(git_status_short)"

  if [[ -z "$status_short" ]]; then
    return
  fi

  if [[ "$ALLOW_DIRTY_PREVIEW" == "true" ]]; then
    echo "Dirty working tree approved for preview deploy: $PREVIEW_LABEL"
    echo
    echo "$status_short"
    return
  fi

  echo "Refusing to build a production archive from a dirty working tree." >&2
  echo "Current git status:" >&2
  echo "$status_short" >&2
  echo >&2
  echo "For an intentional device-review WIP deploy, rerun with:" >&2
  echo "  --allow-dirty-preview --preview-label=<short-label>" >&2
  echo >&2
  echo "For a clean production deploy, commit/stash unrelated changes first." >&2
  exit 1
}

write_deploy_source_manifest() {
  local manifest_path="$1"
  local status_short

  status_short="$(git_status_short)"

  {
    printf 'app=%s\n' "$APP_NAME"
    printf 'created_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'source_branch=%s\n' "$(git_output branch --show-current)"
    printf 'source_commit=%s\n' "$(git_output rev-parse HEAD)"
    printf 'source_dirty=%s\n' "$([[ -n "$status_short" ]] && printf true || printf false)"
    printf 'allow_dirty_preview=%s\n' "$ALLOW_DIRTY_PREVIEW"
    printf 'preview_label=%s\n' "$PREVIEW_LABEL"
    printf '\n'
    printf 'git_status_short:\n'
    if [[ -n "$status_short" ]]; then
      printf '%s\n' "$status_short"
    else
      printf '(clean)\n'
    fi
  } >"$manifest_path"
}

create_archive() {
  local archive_dir
  local tmp_dir

  archive_dir="$(dirname "$ARCHIVE_PATH")"
  mkdir -p "$archive_dir"
  tmp_dir="$(mktemp -d)"

  (
    trap 'rm -rf "$tmp_dir"' EXIT

    rsync -a --delete \
      --include='/.env.example' \
      --include='/.env.production.example' \
      --exclude='.git' \
      --exclude='.github' \
      --exclude='.codex' \
      --exclude='.install' \
      --exclude='.pnpm-store' \
      --exclude='.env' \
      --exclude='.env.*' \
      --exclude='node_modules' \
      --exclude='backend/node_modules' \
      --exclude='frontend/node_modules' \
      --exclude='backend/dist' \
      --exclude='frontend/dist' \
      --exclude='coverage' \
      --exclude='playwright-report' \
      --exclude='test-results' \
      --exclude='logs' \
      --exclude='backups' \
      --exclude='*.log' \
      "$REPO_ROOT"/ \
      "$tmp_dir"/

    write_deploy_source_manifest "$tmp_dir/DEPLOY_SOURCE.txt"

    tar -czf "$ARCHIVE_PATH" -C "$tmp_dir" .
  )
}

if [[ -z "$ARCHIVE_PATH" ]]; then
  ARCHIVE_PATH="/tmp/${APP_NAME}-$(date +%Y%m%d-%H%M%S).tar.gz"
fi

require_command ssh
require_command scp
require_command rsync
require_command tar
require_command git

assert_release_source_is_approved

echo "Building archive from current working tree:"
echo "  $ARCHIVE_PATH"
if [[ -n "$PREVIEW_LABEL" ]]; then
  echo "Preview label: $PREVIEW_LABEL"
fi
create_archive

REMOTE_ARCHIVE_PATH="${REMOTE_ARCHIVE_DIR%/}/$(basename "$ARCHIVE_PATH")"
printf -v REMOTE_SCRIPT_ARGS '%q ' \
  "$APP_NAME" \
  "$REMOTE_APP_PATH" \
  "$REMOTE_ARCHIVE_PATH" \
  "$ACTIVATE" \
  "$SYNC_WEBHOOK_SECRET" \
  "$KEEP_REMOTE_ARCHIVE"

echo
echo "Uploading archive to VM:"
echo "  $SSH_TARGET:$REMOTE_ARCHIVE_PATH"
scp -P "$SSH_PORT" "$ARCHIVE_PATH" "$SSH_TARGET:$REMOTE_ARCHIVE_PATH"

echo
echo "Applying archive on VM:"
ssh -p "$SSH_PORT" "$SSH_TARGET" "bash -s -- $REMOTE_SCRIPT_ARGS" <<'EOF'
set -Eeuo pipefail

app_name="$1"
app_path="$2"
remote_archive_path="$3"
activate="$4"
sync_webhook_secret="$5"
keep_remote_archive="$6"

require_remote_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found on VM: $command_name" >&2
    exit 1
  fi
}

require_remote_command tar
require_remote_command rsync

ensure_app_path() {
  if mkdir -p "$app_path" 2>/dev/null; then
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "Cannot create $app_path and sudo is not available on the VM." >&2
    exit 1
  fi

  local remote_user
  local remote_group

  remote_user="$(id -un)"
  remote_group="$(id -gn)"
  sudo install -d -m 0755 -o "$remote_user" -g "$remote_group" "$app_path"
}

if [[ ! -f "$remote_archive_path" ]]; then
  echo "Archive not found on VM: $remote_archive_path" >&2
  exit 1
fi

tmp_dir="$(mktemp -d "/tmp/${app_name}-deploy.XXXXXX")"

cleanup() {
  rm -rf "$tmp_dir"
  if [[ "$keep_remote_archive" != "true" ]]; then
    rm -f "$remote_archive_path"
  fi
}
trap cleanup EXIT

ensure_app_path
tar -xzf "$remote_archive_path" -C "$tmp_dir"
mkdir -p "$app_path/backups" "$app_path/logs" "$app_path/.install"

rsync -a --delete \
  --exclude '.env' \
  --exclude '.env.production' \
  --exclude '.git' \
  --exclude '.install' \
  --exclude 'logs' \
  --exclude 'backups' \
  --exclude '.codex' \
  "$tmp_dir"/ "$app_path"/

echo "Archive unpacked into $app_path."

if [[ "$activate" != "true" ]]; then
  echo
  echo "Next commands on the VM:"
  echo "  cd $app_path"
  echo "  docker compose --env-file .env.production -f infra/production/compose.yaml up -d --build"
  echo "  scripts/install-production.sh --status"
  exit 0
fi

if [[ ! -f "$app_path/.env.production" ]]; then
  echo "Missing $app_path/.env.production. Run scripts/install-production.sh --install on the VM first." >&2
  exit 1
fi

docker_cmd=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    docker_cmd=(sudo docker)
  else
    echo "Docker access is required on the VM for --activate." >&2
    exit 1
  fi
fi

cd "$app_path"
"${docker_cmd[@]}" compose --env-file .env.production -f infra/production/compose.yaml up -d --build
"${docker_cmd[@]}" compose --env-file .env.production -f infra/production/compose.yaml ps

if [[ "$sync_webhook_secret" == "true" ]]; then
  scripts/install-production.sh --sync-webhook-secret
fi
EOF

echo
echo "Archive deploy completed."
if [[ "$ACTIVATE" == "true" ]]; then
  echo "Production stack was rebuilt on the VM."
else
  echo "Code was delivered to the VM without restarting containers."
fi
