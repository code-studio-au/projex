import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readPinnedNodeVersion() {
  for (const fileName of ['.node-version', '.nvmrc']) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;
    const value = readFileSync(filePath, 'utf8').trim();
    if (value) {
      return {
        fileName,
        version: value.replace(/^v/i, ''),
      };
    }
  }
  return null;
}

function parseMajor(version) {
  const match = /^v?(\d+)/.exec(version.trim());
  return match ? Number.parseInt(match[1], 10) : null;
}

export function resolveNodeExecutable() {
  return process.env.PROJEX_NODE_EXECUTABLE?.trim() || process.execPath;
}

function getNodeRuntimeInfo() {
  const pinned = readPinnedNodeVersion();
  const currentMajor = parseMajor(process.version);
  const pinnedMajor = pinned ? parseMajor(pinned.version) : null;

  return {
    executable: resolveNodeExecutable(),
    version: process.version,
    pinned,
    matchesPinnedMajor:
      pinnedMajor == null || currentMajor == null
        ? true
        : currentMajor === pinnedMajor,
  };
}

export function logNodeRuntime(label) {
  const runtime = getNodeRuntimeInfo();
  const pinnedSuffix = runtime.pinned
    ? `; pinned ${runtime.pinned.version} from ${runtime.pinned.fileName}`
    : '';
  console.info(
    `[runtime] ${label}: ${runtime.version} (${runtime.executable})${pinnedSuffix}`
  );

  if (!runtime.matchesPinnedMajor && runtime.pinned) {
    console.warn(
      `[runtime] ${label}: active Node ${runtime.version} does not match pinned ${runtime.pinned.version} from ${runtime.pinned.fileName}`
    );
  }
}
