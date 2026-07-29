#!/usr/bin/env bash
set -euo pipefail

ARTIFACTS_DIR="${ARTIFACTS_DIR:-artifacts}"
GIT_SHA="${GIT_SHA:-$(git rev-parse HEAD)}"
DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-local}"
DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-local}"
DEPLOY_RUN_ATTEMPT="${DEPLOY_RUN_ATTEMPT:-1}"
RELEASE_ID="${RELEASE_ID:-${DEPLOY_ENVIRONMENT}-${GIT_SHA:0:12}-run${DEPLOY_RUN_ID}-attempt${DEPLOY_RUN_ATTEMPT}}"
ARTIFACT_NAME="${ARTIFACT_NAME:-projex-${RELEASE_ID}.tar.gz}"
ARTIFACT_PATH="${ARTIFACT_PATH:-${ARTIFACTS_DIR}/${ARTIFACT_NAME}}"
MANIFEST_DIR=""

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

validate_identifier() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[a-z0-9][a-z0-9.-]{0,127}$ ]]; then
    printf '%s must match ^[a-z0-9][a-z0-9.-]{0,127}$\n' "$label" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "$MANIFEST_DIR" && -d "$MANIFEST_DIR" ]]; then
    rm -rf -- "$MANIFEST_DIR"
  fi
}

trap cleanup EXIT

if [[ ! "$GIT_SHA" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
  printf 'GIT_SHA must be a full lowercase Git object ID.\n' >&2
  exit 1
fi

validate_identifier "DEPLOY_ENVIRONMENT" "$DEPLOY_ENVIRONMENT"
validate_identifier "DEPLOY_RUN_ID" "$DEPLOY_RUN_ID"
validate_identifier "DEPLOY_RUN_ATTEMPT" "$DEPLOY_RUN_ATTEMPT"
validate_identifier "RELEASE_ID" "$RELEASE_ID"

if [[ ! "$ARTIFACT_NAME" =~ ^projex-[a-z0-9][a-z0-9.-]{0,127}\.tar\.gz$ ]]; then
  printf 'ARTIFACT_NAME is not a valid Projex deploy artifact name.\n' >&2
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR"
artifacts_dir_resolved="$(cd "$ARTIFACTS_DIR" && pwd -P)"
artifact_parent="$(dirname "$ARTIFACT_PATH")"
if [[ ! -d "$artifact_parent" ]]; then
  printf 'ARTIFACT_PATH parent directory does not exist.\n' >&2
  exit 1
fi
artifact_parent_resolved="$(cd "$artifact_parent" && pwd -P)"
if [[ "$artifact_parent_resolved" != "$artifacts_dir_resolved" || "$(basename "$ARTIFACT_PATH")" != "$ARTIFACT_NAME" ]]; then
  printf 'ARTIFACT_PATH must be ARTIFACTS_DIR/ARTIFACT_NAME.\n' >&2
  exit 1
fi
ARTIFACT_PATH="${artifacts_dir_resolved}/${ARTIFACT_NAME}"

require_path "dist/server/server.js"
require_path "dist/client"
require_path "dist/client/.vite/manifest.json"
require_path "src"
require_path "scripts/start-server.mjs"
require_path "scripts/cache-policy.mjs"
require_path "scripts/cli-args.mjs"
require_path "scripts/env-file.mjs"
require_path "scripts/node-runtime.mjs"
require_path "scripts/run-release-migrations.mjs"
require_path "scripts/bootstrap-app-user.mjs"
require_path "scripts/link-auth-user.mjs"
require_path "scripts/smoke-server.mjs"
require_path "scripts/deploy-artifact-ssm.sh"
require_path "deploy/systemd/projex.service"
require_path "deploy/nginx/maintenance.html"
require_path "deploy/nginx/maintenance.js"
require_path "deploy/nginx/projex-compression.conf"
require_path "deploy/nginx/projex-request-limits.conf"
require_path "package.json"
require_path "pnpm-lock.yaml"
require_path "pnpm-workspace.yaml"
require_path ".pnpmfile.cjs"
require_path "patches/brace-expansion@5.0.8.patch"

rm -f "$ARTIFACT_PATH"

MANIFEST_DIR="$(mktemp -d)"
printf \
  '{\n  "schemaVersion": 1,\n  "releaseId": "%s",\n  "gitSha": "%s",\n  "environment": "%s",\n  "runId": "%s",\n  "runAttempt": "%s"\n}\n' \
  "$RELEASE_ID" \
  "$GIT_SHA" \
  "$DEPLOY_ENVIRONMENT" \
  "$DEPLOY_RUN_ID" \
  "$DEPLOY_RUN_ATTEMPT" \
  >"$MANIFEST_DIR/.projex-release.json"

log "Creating deploy artifact at $ARTIFACT_PATH"
tar -czf "$ARTIFACT_PATH" \
  dist \
  src \
  scripts/start-server.mjs \
  scripts/cache-policy.mjs \
  scripts/cli-args.mjs \
  scripts/env-file.mjs \
  scripts/node-runtime.mjs \
  scripts/run-release-migrations.mjs \
  scripts/bootstrap-app-user.mjs \
  scripts/link-auth-user.mjs \
  scripts/smoke-server.mjs \
  scripts/deploy-artifact-ssm.sh \
  scripts/deploy-artifact-ec2.sh \
  deploy/systemd/projex.service \
  deploy/nginx \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  .pnpmfile.cjs \
  patches \
  -C "$MANIFEST_DIR" \
  .projex-release.json

log "Artifact ready"
printf '%s\n' "$ARTIFACT_PATH"
