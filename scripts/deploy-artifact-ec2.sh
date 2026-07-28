#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/projex}"
RELEASE_ID="${RELEASE_ID:-}"
RELEASE_DIR="${RELEASE_DIR:-}"
EXPECTED_GIT_SHA="${EXPECTED_GIT_SHA:-}"
CURRENT_LINK="${CURRENT_LINK:-}"
ENV_FILE="${ENV_FILE:-/etc/projex/projex.env}"
SERVICE_NAME="${SERVICE_NAME:-projex}"
DEPLOY_USER="${DEPLOY_USER:-projex-deploy}"
DEPLOY_HOME="${DEPLOY_HOME:-/var/lib/projex-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/usr/local/bin:/usr/bin:/bin}"
PNPM_BIN="${PNPM_BIN:-/usr/local/bin/pnpm}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
READY_URL="${READY_URL:-http://127.0.0.1:3000/api/ready}"
SHARED_DIR="${SHARED_DIR:-}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-60}"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-60}"
HTTP_CHECK_INTERVAL_SECONDS="${HTTP_CHECK_INTERVAL_SECONDS:-2}"
NGINX_REQUEST_LIMITS_PATH="${NGINX_REQUEST_LIMITS_PATH:-/etc/nginx/conf.d/projex-request-limits.conf}"
SYSTEMD_SERVICE_PATH="${SYSTEMD_SERVICE_PATH:-}"
RELEASES_DIR=""
NEXT_LINK=""
SYSTEMD_RENDER_PATH=""
SYSTEMD_BACKUP_PATH=""
SYSTEMD_UNIT_EXISTED="false"
SYSTEMD_UNIT_UPDATED="false"
SYSTEMD_SERVICE_WAS_ENABLED="false"
DEPLOY_GROUP=""
RELEASE_OWNED_BY_DEPLOY_USER="false"

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

validate_identifier() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[a-z0-9][a-z0-9.-]{0,127}$ ]]; then
    fail "$label must match ^[a-z0-9][a-z0-9.-]{0,127}$"
  fi
}

validate_system_user() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
    fail "$label must be a valid system user name"
  fi
}

validate_systemd_path() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
    fail "$label must be an absolute path containing only systemd-safe path characters"
  fi
}

validate_service_sandbox_path() {
  local label="$1"
  local value="$2"
  case "$value" in
    /home | /home/* | /root | /root/* | /run/user | /run/user/*)
      fail "$label must not be located under /home, /root, or /run/user because the service sandbox protects home directories"
      ;;
  esac
}

resolve_existing_path() {
  node -e \
    'process.stdout.write(require("node:fs").realpathSync(process.argv[1]))' \
    "$1"
}

read_manifest_value() {
  node -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const value = manifest[process.argv[2]];
    if (typeof value !== "string" && typeof value !== "number") {
      process.exit(2);
    }
    process.stdout.write(String(value));
  ' "$1" "$2"
}

render_systemd_service() {
  local source_path="$1"
  local destination_path="$2"
  node -e '
    const fs = require("node:fs");
    const [sourcePath, destinationPath, currentLink, envFile] =
      process.argv.slice(1);
    let service = fs.readFileSync(sourcePath, "utf8");
    for (const [placeholder, value] of [
      ["/opt/projex/current", currentLink],
      ["/etc/projex/projex.env", envFile],
    ]) {
      if (!service.includes(placeholder)) {
        throw new Error(`Missing expected systemd path: ${placeholder}`);
      }
      service = service.replaceAll(placeholder, value);
    }
    fs.writeFileSync(destinationPath, service, { flag: "wx", mode: 0o600 });
  ' "$source_path" "$destination_path" "$CURRENT_LINK" "$ENV_FILE"
}

preserve_systemd_service() {
  if [[ -L "$SYSTEMD_SERVICE_PATH" ]]; then
    fail "Systemd service path must not be a symlink: $SYSTEMD_SERVICE_PATH"
  fi
  if [[ -e "$SYSTEMD_SERVICE_PATH" && ! -f "$SYSTEMD_SERVICE_PATH" ]]; then
    fail "Systemd service path must be a regular file: $SYSTEMD_SERVICE_PATH"
  fi

  if [[ -f "$SYSTEMD_SERVICE_PATH" ]]; then
    SYSTEMD_BACKUP_PATH="${RELEASE_DIR}/.projex-systemd-backup-${RELEASE_ID}.$$.service"
    sudo install -o root -g root -m 0600 \
      "$SYSTEMD_SERVICE_PATH" \
      "$SYSTEMD_BACKUP_PATH"
    SYSTEMD_UNIT_EXISTED="true"
  fi
  if sudo systemctl is-enabled --quiet "$SERVICE_NAME"; then
    SYSTEMD_SERVICE_WAS_ENABLED="true"
  fi
}

restore_systemd_service() {
  if [[ "$SYSTEMD_UNIT_UPDATED" != "true" ]]; then
    return 0
  fi

  local restore_failed="false"
  log "Restoring the previous systemd service configuration"
  if [[ "$SYSTEMD_UNIT_EXISTED" == "true" ]]; then
    if ! sudo install -o root -g root -m 0644 \
      "$SYSTEMD_BACKUP_PATH" \
      "$SYSTEMD_SERVICE_PATH"; then
      restore_failed="true"
    fi
  elif ! sudo rm -f -- "$SYSTEMD_SERVICE_PATH"; then
    restore_failed="true"
  fi

  if ! sudo systemctl daemon-reload; then
    restore_failed="true"
  fi
  if [[ "$SYSTEMD_SERVICE_WAS_ENABLED" == "true" ]]; then
    if ! sudo systemctl enable "$SERVICE_NAME"; then
      restore_failed="true"
    fi
  elif ! sudo systemctl disable "$SERVICE_NAME"; then
    restore_failed="true"
  fi

  SYSTEMD_UNIT_UPDATED="false"
  if [[ -n "$SYSTEMD_BACKUP_PATH" ]]; then
    rm -f -- "$SYSTEMD_BACKUP_PATH"
    SYSTEMD_BACKUP_PATH=""
  fi
  if [[ "$restore_failed" == "true" ]]; then
    log "WARNING: failed to fully restore the previous systemd service configuration"
    return 1
  fi
}

ensure_deploy_identity() {
  if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    log "Creating constrained deployment identity ${DEPLOY_USER}"
    sudo useradd \
      --system \
      --user-group \
      --home-dir "$DEPLOY_HOME" \
      --create-home \
      --shell /sbin/nologin \
      "$DEPLOY_USER"
  fi

  local deploy_uid
  deploy_uid="$(id -u "$DEPLOY_USER")"
  if [[ "$deploy_uid" == "0" ]]; then
    fail 'The constrained deployment identity must not be root.'
  fi
  DEPLOY_GROUP="$(id -gn "$DEPLOY_USER")"
  sudo install \
    -d \
    -o "$DEPLOY_USER" \
    -g "$DEPLOY_GROUP" \
    -m 0750 \
    "$DEPLOY_HOME"
}

run_as_deploy_user() {
  sudo --non-interactive --user "$DEPLOY_USER" -- "$@"
}

current_release_dir() {
  if [[ ! -L "$CURRENT_LINK" ]]; then
    return 1
  fi
  resolve_existing_path "$CURRENT_LINK"
}

validate_release_dir() {
  local path="$1"
  if [[ "$(dirname "$path")" != "$RELEASES_DIR" ]]; then
    fail "Release path must be a direct child of $RELEASES_DIR: $path"
  fi
}

activate_release() {
  local target="$1"
  local link_parent
  link_parent="$(dirname "$CURRENT_LINK")"
  mkdir -p "$link_parent"
  NEXT_LINK="${link_parent}/.$(basename "$CURRENT_LINK").next.${RELEASE_ID}.$$"
  if [[ -e "$NEXT_LINK" || -L "$NEXT_LINK" ]]; then
    fail "Temporary activation link already exists: $NEXT_LINK"
  fi
  ln -s "$target" "$NEXT_LINK"
  node -e \
    'require("node:fs").renameSync(process.argv[1], process.argv[2])' \
    "$NEXT_LINK" \
    "$CURRENT_LINK"
  NEXT_LINK=""
}

cleanup() {
  restore_systemd_service || true
  if [[ -n "$NEXT_LINK" && -L "$NEXT_LINK" ]]; then
    rm -f -- "$NEXT_LINK"
  fi
  if [[ -n "$SYSTEMD_RENDER_PATH" ]]; then
    rm -f -- "$SYSTEMD_RENDER_PATH"
  fi
  if [[ -n "$SYSTEMD_BACKUP_PATH" ]]; then
    rm -f -- "$SYSTEMD_BACKUP_PATH"
  fi
  if [[ "$RELEASE_OWNED_BY_DEPLOY_USER" == "true" && -d "$RELEASE_DIR" ]]; then
    sudo chown -R root:root "$RELEASE_DIR" || true
    sudo chmod -R a+rX,go-w "$RELEASE_DIR" || true
  fi
}

trap cleanup EXIT

wait_for_http_ok() {
  local url="$1"
  local timeout_seconds="$2"
  local label="$3"
  local deadline=$((SECONDS + timeout_seconds))

  while (( SECONDS < deadline )); do
    if curl --fail --show-error --silent "$url"; then
      printf '\n'
      return 0
    fi
    sleep "$HTTP_CHECK_INTERVAL_SECONDS"
  done

  printf '\n'
  return 1
}

rollback_release() {
  restore_systemd_service || true
  if [[ -n "${PREVIOUS_RELEASE_DIR:-}" && -d "${PREVIOUS_RELEASE_DIR:-}" ]]; then
    log "Rolling back to previous release ${PREVIOUS_RELEASE_DIR}"
    activate_release "$PREVIOUS_RELEASE_DIR"
    sudo systemctl restart "$SERVICE_NAME" || true
  else
    log "Removing failed first-release activation"
    sudo systemctl stop "$SERVICE_NAME" || true
    rm -f -- "$CURRENT_LINK"
  fi
}

prune_old_releases() {
  local releases_dir="${APP_ROOT}/releases"
  if [[ ! "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]]; then
    fail "KEEP_RELEASES must be a positive integer"
  fi
  local keep_count="$KEEP_RELEASES"

  local release_dirs=()
  while IFS= read -r dir; do
    release_dirs+=("$dir")
  done < <(
    find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -print0 |
      xargs -0 ls -1dt 2>/dev/null || true
  )
  local kept=0
  for dir in "${release_dirs[@]}"; do
    validate_release_dir "$dir"
    active_release_dir="$(current_release_dir 2>/dev/null || true)"
    if [[ "$dir" == "$active_release_dir" || "$dir" == "$RELEASE_DIR" || "$dir" == "${PREVIOUS_RELEASE_DIR:-}" ]]; then
      continue
    fi
    kept=$((kept + 1))
    if (( kept <= keep_count )); then
      continue
    fi
    active_release_dir="$(current_release_dir 2>/dev/null || true)"
    if [[ "$dir" == "$active_release_dir" ]]; then
      continue
    fi
    rm -rf -- "$dir"
  done
}

require_command curl
require_command sudo
require_command node
require_command id
require_command systemd-analyze

APP_ROOT="${APP_ROOT%/}"
if [[ -z "$APP_ROOT" || "$APP_ROOT" == "/" || "$APP_ROOT" != /* ]]; then
  fail 'APP_ROOT must be a non-root absolute path.'
fi
validate_service_sandbox_path "APP_ROOT" "$APP_ROOT"
APP_ROOT="$(resolve_existing_path "$APP_ROOT")"
validate_systemd_path "APP_ROOT" "$APP_ROOT"
validate_service_sandbox_path "APP_ROOT" "$APP_ROOT"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${CURRENT_LINK:-${APP_ROOT}/current}"
SHARED_DIR="${SHARED_DIR:-${APP_ROOT}/shared}"
validate_systemd_path "CURRENT_LINK" "$CURRENT_LINK"
validate_service_sandbox_path "CURRENT_LINK" "$CURRENT_LINK"

validate_identifier "RELEASE_ID" "$RELEASE_ID"
validate_identifier "SERVICE_NAME" "$SERVICE_NAME"
if [[ "$SERVICE_NAME" == *.service ]]; then
  fail 'SERVICE_NAME must omit the .service suffix.'
fi
validate_system_user "DEPLOY_USER" "$DEPLOY_USER"
if [[ ! "$EXPECTED_GIT_SHA" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
  fail 'EXPECTED_GIT_SHA must be a full lowercase Git object ID.'
fi
if [[ -z "$DEPLOY_HOME" || "$DEPLOY_HOME" == "/" || "$DEPLOY_HOME" != /* ]]; then
  fail 'DEPLOY_HOME must be a non-root absolute path.'
fi
validate_systemd_path "ENV_FILE" "$ENV_FILE"
validate_service_sandbox_path "ENV_FILE" "$ENV_FILE"
if [[ "$PNPM_BIN" != /* ]]; then
  fail 'PNPM_BIN must be an absolute path.'
fi
if [[ ! -x "$PNPM_BIN" ]]; then
  fail "PNPM_BIN must be an executable file: $PNPM_BIN"
fi
SYSTEMD_SERVICE_PATH="${SYSTEMD_SERVICE_PATH:-/etc/systemd/system/${SERVICE_NAME}.service}"
if [[ "$SYSTEMD_SERVICE_PATH" != /* || "$SYSTEMD_SERVICE_PATH" == "/" ]]; then
  fail 'SYSTEMD_SERVICE_PATH must be a non-root absolute path.'
fi
validate_systemd_path "SYSTEMD_SERVICE_PATH" "$SYSTEMD_SERVICE_PATH"

require_dir "$RELEASE_DIR"
RELEASE_DIR="$(resolve_existing_path "$RELEASE_DIR")"
expected_release_dir="${RELEASES_DIR}/${RELEASE_ID}"
if [[ "$RELEASE_DIR" != "$expected_release_dir" ]]; then
  fail "RELEASE_DIR must match the validated release ID: $expected_release_dir"
fi
validate_release_dir "$RELEASE_DIR"
require_file "$ENV_FILE"
if [[ -L "$ENV_FILE" ]]; then
  fail "Environment file must not be a symlink: $ENV_FILE"
fi
require_file "$RELEASE_DIR/.projex-release.json"
require_file "$RELEASE_DIR/package.json"
require_file "$RELEASE_DIR/pnpm-lock.yaml"
require_file "$RELEASE_DIR/pnpm-workspace.yaml"
require_file "$RELEASE_DIR/.pnpmfile.cjs"
require_file "$RELEASE_DIR/patches/brace-expansion@5.0.8.patch"
require_file "$RELEASE_DIR/scripts/start-server.mjs"
require_file "$RELEASE_DIR/scripts/env-file.mjs"
require_file "$RELEASE_DIR/scripts/node-runtime.mjs"
require_file "$RELEASE_DIR/scripts/deploy-artifact-ec2.sh"
require_file "$RELEASE_DIR/deploy/nginx/maintenance.html"
require_file "$RELEASE_DIR/deploy/nginx/maintenance.js"
require_file "$RELEASE_DIR/deploy/nginx/projex-request-limits.conf"
require_file "$RELEASE_DIR/deploy/systemd/projex.service"

manifest_release_id="$(
  read_manifest_value "$RELEASE_DIR/.projex-release.json" releaseId
)"
manifest_git_sha="$(
  read_manifest_value "$RELEASE_DIR/.projex-release.json" gitSha
)"
if [[ "$manifest_release_id" != "$RELEASE_ID" ]]; then
  fail 'Deploy manifest release ID does not match RELEASE_ID.'
fi
if [[ "$manifest_git_sha" != "$EXPECTED_GIT_SHA" ]]; then
  fail 'Deploy manifest Git SHA does not match EXPECTED_GIT_SHA.'
fi

ensure_deploy_identity

mkdir -p "$RELEASES_DIR" "$SHARED_DIR/nginx-maintenance"
sudo chown root:root "$APP_ROOT" "$RELEASES_DIR" "$SHARED_DIR"
sudo chmod 0755 "$APP_ROOT" "$RELEASES_DIR" "$SHARED_DIR"
sudo chown -R root:root "$RELEASE_DIR"

PREVIOUS_RELEASE_DIR="$(current_release_dir 2>/dev/null || true)"
if [[ -n "$PREVIOUS_RELEASE_DIR" ]]; then
  validate_release_dir "$PREVIOUS_RELEASE_DIR"
  if [[ "$PREVIOUS_RELEASE_DIR" == "$RELEASE_DIR" ]]; then
    fail "Release is already active: $RELEASE_DIR"
  fi
fi

log "Installing runtime dependencies in ${RELEASE_DIR}"
cd "$RELEASE_DIR"
sudo chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$RELEASE_DIR"
sudo chmod -R u+rwX,go-rwx "$RELEASE_DIR"
RELEASE_OWNED_BY_DEPLOY_USER="true"
run_as_deploy_user \
  env -i \
  HOME="$DEPLOY_HOME" \
  PATH="$DEPLOY_PATH" \
  COREPACK_ENABLE_STRICT=1 \
  "$PNPM_BIN" install --frozen-lockfile --prod --ignore-scripts

log "Restricting environment access to the deployment identity"
sudo chown "root:$DEPLOY_GROUP" "$ENV_FILE"
sudo chmod 0640 "$ENV_FILE"

log "Running database migrations as ${DEPLOY_USER}"
run_as_deploy_user \
  env -i \
  HOME="$DEPLOY_HOME" \
  PATH="$DEPLOY_PATH" \
  DEPLOY_PATH="$DEPLOY_PATH" \
  ENV_FILE="$ENV_FILE" \
  PNPM_BIN="$PNPM_BIN" \
  /bin/bash -c '
    set -euo pipefail
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    export PATH="$DEPLOY_PATH"
    exec "$PNPM_BIN" run db:migrate
  '

log "Locking the completed release to root ownership"
sudo chown -R root:root "$RELEASE_DIR"
sudo chmod -R a+rX,go-w "$RELEASE_DIR"
RELEASE_OWNED_BY_DEPLOY_USER="false"

log "Validating and refreshing the systemd service"
SYSTEMD_RENDER_PATH="${RELEASE_DIR}/.projex-systemd-${RELEASE_ID}.$$.service"
render_systemd_service \
  "$RELEASE_DIR/deploy/systemd/projex.service" \
  "$SYSTEMD_RENDER_PATH"
sudo systemd-analyze verify "$SYSTEMD_RENDER_PATH"
preserve_systemd_service
sudo install -o root -g root -m 0644 \
  "$SYSTEMD_RENDER_PATH" \
  "$SYSTEMD_SERVICE_PATH"
SYSTEMD_UNIT_UPDATED="true"
rm -f -- "$SYSTEMD_RENDER_PATH"
SYSTEMD_RENDER_PATH=""
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

log "Refreshing shared maintenance assets"
sudo install -o root -g root -m 0644 \
  "$RELEASE_DIR/deploy/nginx/maintenance.html" \
  "$SHARED_DIR/nginx-maintenance/maintenance.html"
sudo install -o root -g root -m 0644 \
  "$RELEASE_DIR/deploy/nginx/maintenance.js" \
  "$SHARED_DIR/nginx-maintenance/maintenance.js"

log "Refreshing nginx request limits"
sudo install -m 0644 \
  "$RELEASE_DIR/deploy/nginx/projex-request-limits.conf" \
  "$NGINX_REQUEST_LIMITS_PATH"
if ! sudo nginx -t; then
  fail "Nginx configuration validation failed after refreshing request limits"
fi
sudo systemctl reload nginx

log "Activating release ${RELEASE_DIR}"
activate_release "$RELEASE_DIR"

log "Restarting ${SERVICE_NAME}"
if ! sudo systemctl restart "$SERVICE_NAME"; then
  rollback_release
  fail "Failed to restart ${SERVICE_NAME}"
fi

log "Waiting for service to settle"
sleep 3

log "Health check"
if ! wait_for_http_ok "$HEALTH_URL" "$HEALTH_TIMEOUT_SECONDS" "health"; then
  rollback_release
  fail "Health check failed"
fi

log "Readiness check"
if ! wait_for_http_ok "$READY_URL" "$READY_TIMEOUT_SECONDS" "readiness"; then
  rollback_release
  fail "Readiness check failed"
fi

log "Service status"
sudo systemctl status "$SERVICE_NAME" --no-pager -l

log "Recent logs"
sudo journalctl -u "$SERVICE_NAME" -n 40 --no-pager

log "Pruning old releases"
prune_old_releases

SYSTEMD_UNIT_UPDATED="false"
if [[ -n "$SYSTEMD_BACKUP_PATH" ]]; then
  rm -f -- "$SYSTEMD_BACKUP_PATH"
  SYSTEMD_BACKUP_PATH=""
fi
