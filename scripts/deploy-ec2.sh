#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/projex}"
ENV_FILE="${ENV_FILE:-/etc/projex/projex.env}"
SERVICE_NAME="${SERVICE_NAME:-projex}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
READY_URL="${READY_URL:-http://127.0.0.1:3000/api/ready}"
SKIP_INSTALL="${SKIP_INSTALL:-false}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    printf 'Missing required file: %s\n' "$path" >&2
    exit 1
  fi
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$cmd" >&2
    exit 1
  fi
}

require_command git
require_command npm
require_command curl
require_file "$ENV_FILE"

cd "$APP_DIR"

log "Pulling latest code"
git pull --ff-only

if [[ "$SKIP_INSTALL" == "true" ]]; then
  log "Skipping dependency install"
else
  log "Installing dependencies"
  npm ci
fi

log "Loading environment from $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

log "Running database migrations"
npm run db:migrate

log "Building application"
npm run build

log "Restarting $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

log "Waiting for service to settle"
sleep 3

log "Service status"
sudo systemctl status "$SERVICE_NAME" --no-pager -l

log "Health check"
curl --fail --show-error --silent "$HEALTH_URL"
printf '\n'

log "Readiness check"
curl --fail --show-error --silent "$READY_URL"
printf '\n'

log "Recent logs"
sudo journalctl -u "$SERVICE_NAME" -n 40 --no-pager
