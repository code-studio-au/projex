#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/projex}"
RELEASE_ID="${RELEASE_ID:-}"
EXPECTED_GIT_SHA="${EXPECTED_GIT_SHA:-}"
EXPECTED_BUILD_MODE="${EXPECTED_BUILD_MODE:-}"
EXPECTED_BUILD_RUN_ID="${EXPECTED_BUILD_RUN_ID:-}"
EXPECTED_BUILD_RUN_ATTEMPT="${EXPECTED_BUILD_RUN_ATTEMPT:-}"
DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-}"
DEPLOY_MODE="${DEPLOY_MODE:-promote}"
ARTIFACT_SHA256="${ARTIFACT_SHA256:-}"
ENV_FILE="${ENV_FILE:-/etc/projex/projex.env}"
SERVICE_NAME="${SERVICE_NAME:-projex}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
READY_URL="${READY_URL:-http://127.0.0.1:3000/api/ready}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
ARTIFACT_S3_URI="${ARTIFACT_S3_URI:-}"
ARTIFACT_AWS_REGION="${ARTIFACT_AWS_REGION:-}"
ARTIFACT_LOCAL_PATH="${ARTIFACT_LOCAL_PATH:-}"
CURRENT_LINK=""
RELEASES_DIR=""
RELEASE_DIR=""
STAGING_DIR=""
ARCHIVE_LIST_PATH=""
RECOVER_EXISTING_RELEASE="false"

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

validate_identifier() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[a-z0-9][a-z0-9.-]{0,127}$ ]]; then
    fail "$label must match ^[a-z0-9][a-z0-9.-]{0,127}$"
  fi
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

validate_manifest_identity() {
  local manifest_path="$1"
  if [[ ! -f "$manifest_path" || -L "$manifest_path" ]]; then
    fail "Release manifest must be a regular file: $manifest_path"
  fi

  local manifest_schema_version
  local manifest_release_id
  local manifest_git_sha
  local manifest_build_workflow
  local manifest_build_mode
  local manifest_build_run_id
  local manifest_build_run_attempt
  manifest_schema_version="$(read_manifest_value "$manifest_path" schemaVersion)"
  manifest_release_id="$(read_manifest_value "$manifest_path" releaseId)"
  manifest_git_sha="$(read_manifest_value "$manifest_path" gitSha)"
  manifest_build_workflow="$(read_manifest_value "$manifest_path" buildWorkflow)"
  manifest_build_mode="$(read_manifest_value "$manifest_path" buildMode)"
  manifest_build_run_id="$(read_manifest_value "$manifest_path" buildRunId)"
  manifest_build_run_attempt="$(read_manifest_value "$manifest_path" buildRunAttempt)"

  if [[ "$manifest_schema_version" != "2" ]]; then
    fail "Unsupported deploy manifest schema: $manifest_schema_version"
  fi
  if [[ "$manifest_release_id" != "$RELEASE_ID" ]]; then
    fail 'Deploy manifest release ID does not match the requested release.'
  fi
  if [[ "$manifest_git_sha" != "$EXPECTED_GIT_SHA" ]]; then
    fail 'Deploy manifest Git SHA does not match the immutable build revision.'
  fi
  if [[ "$manifest_build_workflow" != "release" ]]; then
    fail 'Deploy manifest was not produced by the release workflow.'
  fi
  if [[ "$manifest_build_mode" != "$EXPECTED_BUILD_MODE" ]]; then
    fail 'Deploy manifest build mode does not match the selected release.'
  fi
  if [[ "$manifest_build_run_id" != "$EXPECTED_BUILD_RUN_ID" ]]; then
    fail 'Deploy manifest build run ID does not match the selected release.'
  fi
  if [[ "$manifest_build_run_attempt" != "$EXPECTED_BUILD_RUN_ATTEMPT" ]]; then
    fail 'Deploy manifest build run attempt does not match the selected release.'
  fi
}

cleanup() {
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    case "$STAGING_DIR" in
      "${RELEASES_DIR}/.${RELEASE_ID}.staging."*)
        rm -rf -- "$STAGING_DIR"
        ;;
      *)
        printf 'Refusing to clean unexpected staging path: %s\n' "$STAGING_DIR" >&2
        ;;
    esac
  fi
  if [[ -n "$ARCHIVE_LIST_PATH" ]]; then
    rm -f -- "$ARCHIVE_LIST_PATH"
  fi
  if [[ -n "$ARTIFACT_LOCAL_PATH" ]]; then
    rm -f -- "$ARTIFACT_LOCAL_PATH"
  fi
}

trap cleanup EXIT

APP_ROOT="${APP_ROOT%/}"
if [[ -z "$APP_ROOT" || "$APP_ROOT" == "/" || "$APP_ROOT" != /* ]]; then
  fail 'APP_ROOT must be a non-root absolute path.'
fi

validate_identifier "RELEASE_ID" "$RELEASE_ID"
validate_identifier "DEPLOY_ENVIRONMENT" "$DEPLOY_ENVIRONMENT"
validate_identifier "EXPECTED_BUILD_MODE" "$EXPECTED_BUILD_MODE"
validate_identifier "EXPECTED_BUILD_RUN_ID" "$EXPECTED_BUILD_RUN_ID"
validate_identifier "EXPECTED_BUILD_RUN_ATTEMPT" "$EXPECTED_BUILD_RUN_ATTEMPT"
validate_identifier "DEPLOY_MODE" "$DEPLOY_MODE"

if [[ "$DEPLOY_ENVIRONMENT" != "staging" && "$DEPLOY_ENVIRONMENT" != "production" ]]; then
  fail 'DEPLOY_ENVIRONMENT must be staging or production.'
fi
if [[ "$EXPECTED_BUILD_MODE" != "verified" && "$EXPECTED_BUILD_MODE" != "recovery" ]]; then
  fail 'EXPECTED_BUILD_MODE must be verified or recovery.'
fi
if [[ ! "$EXPECTED_BUILD_RUN_ID" =~ ^[1-9][0-9]*$ ]]; then
  fail 'EXPECTED_BUILD_RUN_ID must be a positive GitHub run ID.'
fi
if [[ ! "$EXPECTED_BUILD_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]; then
  fail 'EXPECTED_BUILD_RUN_ATTEMPT must be a positive GitHub run attempt.'
fi
if [[ "$DEPLOY_MODE" != "promote" && "$DEPLOY_MODE" != "rollback" ]]; then
  fail 'DEPLOY_MODE must be promote or rollback.'
fi

if [[ ! "$EXPECTED_GIT_SHA" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
  fail 'EXPECTED_GIT_SHA must be a full lowercase Git object ID.'
fi

if [[ ! "$ARTIFACT_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  fail 'ARTIFACT_SHA256 must be a lowercase SHA-256 digest.'
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
require_command node
require_command sha256sum
require_command flock
require_command chmod

mkdir -p "$APP_ROOT"
APP_ROOT="$(resolve_existing_path "$APP_ROOT")"
RELEASES_DIR="${APP_ROOT}/releases"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
CURRENT_LINK="${APP_ROOT}/current"

mkdir -p "$RELEASES_DIR" "${APP_ROOT}/shared"
exec 9>"${APP_ROOT}/shared/deploy.lock"
if ! flock -n 9; then
  fail 'Another host deployment is already in progress.'
fi

if [[ -L "$CURRENT_LINK" ]]; then
  active_release_dir="$(resolve_existing_path "$CURRENT_LINK" 2>/dev/null || true)"
  if [[ -z "$active_release_dir" ]]; then
    log "Removing broken current-release symlink ${CURRENT_LINK}"
    rm -f -- "$CURRENT_LINK"
  elif [[ "$active_release_dir" == "$RELEASE_DIR" ]]; then
    if [[ "$DEPLOY_MODE" == "rollback" ]]; then
      fail 'Rollback target must be the retained immediately previous release.'
    fi
    validate_manifest_identity "$RELEASE_DIR/.projex-release.json"
    log "Selected release is already active; no host changes are required"
    exit 0
  fi
fi

if [[ "$DEPLOY_MODE" == "rollback" ]]; then
  previous_link="${APP_ROOT}/previous"
  if [[ ! -L "$previous_link" ]]; then
    fail 'Rollback requires a retained immediately previous release.'
  fi
  previous_release_dir="$(resolve_existing_path "$previous_link" 2>/dev/null || true)"
  if [[ -z "$previous_release_dir" || "$previous_release_dir" != "$RELEASE_DIR" ]]; then
    fail 'Rollback target must be the retained immediately previous release.'
  fi
  validate_manifest_identity "$previous_release_dir/.projex-release.json"
fi

if [[ -L "$RELEASE_DIR" ]]; then
  fail "Release path must not be a symlink: $RELEASE_DIR"
elif [[ -e "$RELEASE_DIR" ]]; then
  if [[ ! -d "$RELEASE_DIR" ]]; then
    fail "Release path must be a directory: $RELEASE_DIR"
  fi
  validate_manifest_identity "$RELEASE_DIR/.projex-release.json"
  RECOVER_EXISTING_RELEASE="true"
  log "Found an inactive release from an earlier attempt; it will be replaced only after the artifact is fully validated"
fi

if [[ -z "$ARTIFACT_LOCAL_PATH" ]]; then
  ARTIFACT_LOCAL_PATH="$(
    mktemp "${APP_ROOT}/shared/.${RELEASE_ID}.artifact.XXXXXX"
  )"
fi

log "Downloading deploy artifact from ${ARTIFACT_S3_URI}"
aws s3 cp --region "$ARTIFACT_AWS_REGION" "$ARTIFACT_S3_URI" "$ARTIFACT_LOCAL_PATH"

actual_artifact_sha256=""
read -r actual_artifact_sha256 _ < <(sha256sum "$ARTIFACT_LOCAL_PATH")
if [[ "$actual_artifact_sha256" != "$ARTIFACT_SHA256" ]]; then
  fail 'Downloaded artifact SHA-256 does not match the build output.'
fi

ARCHIVE_LIST_PATH="$(
  mktemp "${APP_ROOT}/shared/.${RELEASE_ID}.archive-list.XXXXXX"
)"
tar -tzf "$ARTIFACT_LOCAL_PATH" >"$ARCHIVE_LIST_PATH"
while IFS= read -r archive_entry; do
  case "$archive_entry" in
    /* | .. | ../* | */.. | */../*)
      fail "Deploy artifact contains an unsafe path: $archive_entry"
      ;;
  esac
done <"$ARCHIVE_LIST_PATH"

STAGING_DIR="$(mktemp -d "${RELEASES_DIR}/.${RELEASE_ID}.staging.XXXXXX")"

log "Extracting deploy artifact into fresh staging directory ${STAGING_DIR}"
tar --no-same-owner --no-same-permissions \
  -xzf "$ARTIFACT_LOCAL_PATH" \
  -C "$STAGING_DIR"

manifest_path="${STAGING_DIR}/.projex-release.json"
if [[ ! -f "$manifest_path" ]]; then
  fail 'Deploy artifact is missing .projex-release.json.'
fi
if [[ ! -f "${STAGING_DIR}/scripts/deploy-artifact-ec2.sh" ]]; then
  fail 'Deploy artifact is missing scripts/deploy-artifact-ec2.sh.'
fi

validate_manifest_identity "$manifest_path"
chmod 0755 "$STAGING_DIR"

if [[ -e "$RELEASE_DIR" || -L "$RELEASE_DIR" ]]; then
  if [[ "$RECOVER_EXISTING_RELEASE" != "true" || -L "$RELEASE_DIR" || ! -d "$RELEASE_DIR" ]]; then
    fail "Release directory appeared during staging; refusing to overwrite it: $RELEASE_DIR"
  fi
  active_release_dir="$(resolve_existing_path "$CURRENT_LINK" 2>/dev/null || true)"
  if [[ "$active_release_dir" == "$RELEASE_DIR" ]]; then
    fail "Refusing to replace active release: $RELEASE_DIR"
  fi
  validate_manifest_identity "$RELEASE_DIR/.projex-release.json"
  log "Removing matching inactive failed release before retry promotion"
  rm -rf -- "$RELEASE_DIR"
fi

log "Promoting validated release atomically to ${RELEASE_DIR}"
node -e \
  'require("node:fs").renameSync(process.argv[1], process.argv[2])' \
  "$STAGING_DIR" \
  "$RELEASE_DIR"
STAGING_DIR=""

log "Handing off to deploy-artifact-ec2.sh"
export APP_ROOT
export RELEASE_ID
export RELEASE_DIR
export EXPECTED_GIT_SHA
export EXPECTED_BUILD_MODE
export EXPECTED_BUILD_RUN_ID
export EXPECTED_BUILD_RUN_ATTEMPT
export ENV_FILE
export SERVICE_NAME
export HEALTH_URL
export READY_URL
export KEEP_RELEASES
bash "$RELEASE_DIR/scripts/deploy-artifact-ec2.sh"
