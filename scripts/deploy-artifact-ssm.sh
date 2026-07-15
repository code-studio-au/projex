#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/projex}"
RELEASE_DIR="${RELEASE_DIR:-}"
ENV_FILE="${ENV_FILE:-/etc/projex/projex.env}"
SERVICE_NAME="${SERVICE_NAME:-projex}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
READY_URL="${READY_URL:-http://127.0.0.1:3000/api/ready}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
ARTIFACT_S3_URI="${ARTIFACT_S3_URI:-}"
ARTIFACT_AWS_REGION="${ARTIFACT_AWS_REGION:-}"
ARTIFACT_LOCAL_PATH="${ARTIFACT_LOCAL_PATH:-}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "Missing required command: $command_name"
  fi
}

if [[ -z "$RELEASE_DIR" ]]; then
  fail 'RELEASE_DIR must be set.'
fi

if [[ -z "$ARTIFACT_S3_URI" ]]; then
  fail 'ARTIFACT_S3_URI must be set.'
fi

if [[ -z "$ARTIFACT_AWS_REGION" ]]; then
  fail 'ARTIFACT_AWS_REGION must be set.'
fi

require_command aws
require_command tar
require_command mktemp

mkdir -p "${APP_ROOT}/releases" "${APP_ROOT}/shared"

if [[ -z "$ARTIFACT_LOCAL_PATH" ]]; then
  artifact_name="$(basename "$ARTIFACT_S3_URI")"
  ARTIFACT_LOCAL_PATH="/tmp/${artifact_name}"
fi

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

log "Downloading deploy artifact from ${ARTIFACT_S3_URI}"
aws s3 cp --region "$ARTIFACT_AWS_REGION" "$ARTIFACT_S3_URI" "$ARTIFACT_LOCAL_PATH"

log "Extracting deploy artifact into ${RELEASE_DIR}"
tar -xzf "$ARTIFACT_LOCAL_PATH" -C "$RELEASE_DIR"
rm -f "$ARTIFACT_LOCAL_PATH"

log "Handing off to deploy-artifact-ec2.sh"
APP_ROOT="$APP_ROOT" \
RELEASE_DIR="$RELEASE_DIR" \
ENV_FILE="$ENV_FILE" \
SERVICE_NAME="$SERVICE_NAME" \
HEALTH_URL="$HEALTH_URL" \
READY_URL="$READY_URL" \
KEEP_RELEASES="$KEEP_RELEASES" \
bash "$RELEASE_DIR/scripts/deploy-artifact-ec2.sh"
