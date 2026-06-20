#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/projex}"
RELEASE_DIR="${RELEASE_DIR:-}"
CURRENT_LINK="${CURRENT_LINK:-${APP_ROOT}/current}"
ENV_FILE="${ENV_FILE:-/etc/projex/projex.env}"
SERVICE_NAME="${SERVICE_NAME:-projex}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
READY_URL="${READY_URL:-http://127.0.0.1:3000/api/ready}"
SHARED_DIR="${SHARED_DIR:-${APP_ROOT}/shared}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "Missing required command: $cmd"
  fi
}

require_dir() {
  local path="$1"
  if [[ ! -d "$path" ]]; then
    fail "Missing required directory: $path"
  fi
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    fail "Missing required file: $path"
  fi
}

rollback_release() {
  if [[ -n "${PREVIOUS_RELEASE_DIR:-}" && -d "${PREVIOUS_RELEASE_DIR:-}" ]]; then
    log "Rolling back to previous release ${PREVIOUS_RELEASE_DIR}"
    ln -sfn "$PREVIOUS_RELEASE_DIR" "$CURRENT_LINK"
    sudo systemctl restart "$SERVICE_NAME" || true
  fi
}

prune_old_releases() {
  local releases_dir="${APP_ROOT}/releases"
  local keep_count
  keep_count="$(printf '%s' "$KEEP_RELEASES" | tr -dc '0-9')"
  if [[ -z "$keep_count" ]]; then
    fail "KEEP_RELEASES must be a positive integer"
  fi

  mapfile -t release_dirs < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -print0 | xargs -0 ls -1dt 2>/dev/null || true)
  local kept=0
  for dir in "${release_dirs[@]}"; do
    if [[ "$dir" == "$RELEASE_DIR" || "$dir" == "${PREVIOUS_RELEASE_DIR:-}" ]]; then
      continue
    fi
    kept=$((kept + 1))
    if (( kept <= keep_count )); then
      continue
    fi
    rm -rf "$dir"
  done
}

require_command pnpm
require_command curl
require_command sudo

if [[ -z "$RELEASE_DIR" ]]; then
  fail "RELEASE_DIR must be set to the extracted release directory"
fi

require_dir "$RELEASE_DIR"
require_file "$ENV_FILE"
require_file "$RELEASE_DIR/package.json"
require_file "$RELEASE_DIR/pnpm-lock.yaml"
require_file "$RELEASE_DIR/scripts/start-server.mjs"
require_file "$RELEASE_DIR/scripts/deploy-artifact-ec2.sh"
require_file "$RELEASE_DIR/deploy/nginx/maintenance.html"
require_file "$RELEASE_DIR/deploy/nginx/maintenance.js"

mkdir -p "${APP_ROOT}/releases" "$SHARED_DIR/nginx-maintenance"

PREVIOUS_RELEASE_DIR="$(readlink "$CURRENT_LINK" 2>/dev/null || true)"

log "Installing runtime dependencies in ${RELEASE_DIR}"
cd "$RELEASE_DIR"
pnpm install --frozen-lockfile --prod

log "Loading environment from $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

log "Running database migrations"
pnpm run db:migrate

log "Refreshing shared maintenance assets"
cp "$RELEASE_DIR/deploy/nginx/maintenance.html" "$SHARED_DIR/nginx-maintenance/maintenance.html"
cp "$RELEASE_DIR/deploy/nginx/maintenance.js" "$SHARED_DIR/nginx-maintenance/maintenance.js"

log "Activating release ${RELEASE_DIR}"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

log "Restarting ${SERVICE_NAME}"
if ! sudo systemctl restart "$SERVICE_NAME"; then
  rollback_release
  fail "Failed to restart ${SERVICE_NAME}"
fi

log "Waiting for service to settle"
sleep 3

log "Health check"
if ! curl --fail --show-error --silent "$HEALTH_URL"; then
  rollback_release
  fail "Health check failed"
fi
printf '\n'

log "Readiness check"
if ! curl --fail --show-error --silent "$READY_URL"; then
  rollback_release
  fail "Readiness check failed"
fi
printf '\n'

log "Service status"
sudo systemctl status "$SERVICE_NAME" --no-pager -l

log "Recent logs"
sudo journalctl -u "$SERVICE_NAME" -n 40 --no-pager

log "Pruning old releases"
prune_old_releases
