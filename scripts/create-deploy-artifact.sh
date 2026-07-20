#!/usr/bin/env bash
set -euo pipefail

ARTIFACTS_DIR="${ARTIFACTS_DIR:-artifacts}"
GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD)}"
ARTIFACT_NAME="${ARTIFACT_NAME:-projex-${GIT_SHA}.tar.gz}"
ARTIFACT_PATH="${ARTIFACT_PATH:-${ARTIFACTS_DIR}/${ARTIFACT_NAME}}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_path() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    printf 'Missing required path: %s\n' "$path" >&2
    exit 1
  fi
}

mkdir -p "$ARTIFACTS_DIR"

require_path "dist/server/server.js"
require_path "dist/client"
require_path "src"
require_path "scripts/start-server.mjs"
require_path "scripts/env-file.mjs"
require_path "scripts/node-runtime.mjs"
require_path "scripts/bootstrap-app-user.mjs"
require_path "scripts/link-auth-user.mjs"
require_path "scripts/smoke-server.mjs"
require_path "deploy/nginx/maintenance.html"
require_path "deploy/nginx/maintenance.js"
require_path "deploy/nginx/projex-request-limits.conf"
require_path "package.json"
require_path "pnpm-lock.yaml"
require_path "pnpm-workspace.yaml"
require_path ".pnpmfile.cjs"

rm -f "$ARTIFACT_PATH"

log "Creating deploy artifact at $ARTIFACT_PATH"
tar -czf "$ARTIFACT_PATH" \
  dist \
  src \
  scripts/start-server.mjs \
  scripts/env-file.mjs \
  scripts/node-runtime.mjs \
  scripts/bootstrap-app-user.mjs \
  scripts/link-auth-user.mjs \
  scripts/smoke-server.mjs \
  scripts/deploy-artifact-ec2.sh \
  deploy/nginx \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  .pnpmfile.cjs

log "Artifact ready"
printf '%s\n' "$ARTIFACT_PATH"
