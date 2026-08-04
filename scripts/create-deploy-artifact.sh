#!/usr/bin/env bash
set -euo pipefail

ARTIFACTS_DIR="${ARTIFACTS_DIR:-artifacts}"
GIT_SHA="${GIT_SHA:-$(git rev-parse HEAD)}"
BUILD_WORKFLOW="${BUILD_WORKFLOW:-local}"
BUILD_MODE="${BUILD_MODE:-local}"
BUILD_RUN_ID="${BUILD_RUN_ID:-local}"
BUILD_RUN_ATTEMPT="${BUILD_RUN_ATTEMPT:-1}"
RELEASE_ID="${RELEASE_ID:-${BUILD_MODE}-${GIT_SHA:0:12}-run${BUILD_RUN_ID}-attempt${BUILD_RUN_ATTEMPT}}"
ARTIFACT_NAME="${ARTIFACT_NAME:-projex-${RELEASE_ID}.tar.gz}"
ARTIFACT_PATH="${ARTIFACT_PATH:-${ARTIFACTS_DIR}/${ARTIFACT_NAME}}"
RELEASE_SOURCE_ROOT="${RELEASE_SOURCE_ROOT:-.}"
RELEASE_TOOLING_ROOT="${RELEASE_TOOLING_ROOT:-$RELEASE_SOURCE_ROOT}"
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

require_source_path() {
  require_path "${release_source_root_resolved}/$1"
}

require_tooling_path() {
  require_path "${release_tooling_root_resolved}/$1"
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

validate_identifier "BUILD_WORKFLOW" "$BUILD_WORKFLOW"
validate_identifier "BUILD_MODE" "$BUILD_MODE"
validate_identifier "BUILD_RUN_ID" "$BUILD_RUN_ID"
validate_identifier "BUILD_RUN_ATTEMPT" "$BUILD_RUN_ATTEMPT"
validate_identifier "RELEASE_ID" "$RELEASE_ID"

release_source_root_resolved="$(cd "$RELEASE_SOURCE_ROOT" && pwd -P)"
release_tooling_root_resolved="$(cd "$RELEASE_TOOLING_ROOT" && pwd -P)"

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

require_source_path "dist/server/server.js"
require_source_path "dist/client"
require_source_path "dist/client/.vite/manifest.json"
require_source_path "src"
require_source_path "scripts/start-server.mjs"
require_source_path "scripts/cache-policy.mjs"
require_source_path "scripts/cli-args.mjs"
require_source_path "scripts/env-file.mjs"
require_source_path "scripts/node-runtime.mjs"
require_source_path "scripts/run-release-migrations.mjs"
require_source_path "scripts/bootstrap-app-user.mjs"
require_source_path "scripts/link-auth-user.mjs"
require_source_path "scripts/smoke-server.mjs"
require_source_path "package.json"
require_source_path "pnpm-lock.yaml"
require_source_path "pnpm-workspace.yaml"
require_source_path ".pnpmfile.cjs"
require_source_path "patches/brace-expansion@5.0.9.patch"

require_tooling_path "scripts/deploy-artifact-ssm.sh"
require_tooling_path "scripts/deploy-artifact-ec2.sh"
require_tooling_path "deploy/systemd/projex.service"
require_tooling_path "deploy/systemd/projex-journald.conf"
require_tooling_path "deploy/nginx/maintenance.html"
require_tooling_path "deploy/nginx/maintenance.js"
require_tooling_path "deploy/nginx/projex-compression.conf"
require_tooling_path "deploy/nginx/projex-request-limits.conf"

rm -f "$ARTIFACT_PATH"

MANIFEST_DIR="$(mktemp -d)"
printf \
  '{\n  "schemaVersion": 2,\n  "releaseId": "%s",\n  "gitSha": "%s",\n  "buildWorkflow": "%s",\n  "buildMode": "%s",\n  "buildRunId": "%s",\n  "buildRunAttempt": "%s"\n}\n' \
  "$RELEASE_ID" \
  "$GIT_SHA" \
  "$BUILD_WORKFLOW" \
  "$BUILD_MODE" \
  "$BUILD_RUN_ID" \
  "$BUILD_RUN_ATTEMPT" \
  >"$MANIFEST_DIR/.projex-release.json"

log "Creating deploy artifact at $ARTIFACT_PATH"
tar -czf "$ARTIFACT_PATH" \
  -C "$release_source_root_resolved" \
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
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  .pnpmfile.cjs \
  patches \
  -C "$release_tooling_root_resolved" \
  scripts/deploy-artifact-ssm.sh \
  scripts/deploy-artifact-ec2.sh \
  deploy/systemd/projex.service \
  deploy/systemd/projex-journald.conf \
  deploy/nginx \
  -C "$MANIFEST_DIR" \
  .projex-release.json

log "Artifact ready"
printf '%s\n' "$ARTIFACT_PATH"
