export const IMMUTABLE_ASSET_CACHE_CONTROL =
  'public, max-age=31536000, immutable';
export const REVALIDATE_CACHE_CONTROL = 'no-cache';

const FINGERPRINTED_CLIENT_ASSET_PATTERN =
  /^assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8}\.(?:avif|css|eot|gif|ico|jpe?g|js|map|mjs|otf|png|svg|ttf|webp|woff2?)$/i;

function addManifestAsset(assetPaths, candidate) {
  if (
    typeof candidate !== 'string' ||
    !FINGERPRINTED_CLIENT_ASSET_PATTERN.test(candidate) ||
    candidate.includes('?') ||
    candidate.includes('#') ||
    candidate.split('/').some((segment) => segment === '..')
  ) {
    return;
  }

  assetPaths.add(`/${candidate}`);
}

export function collectViteManifestAssetPaths(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Vite client manifest must be an object.');
  }

  const assetPaths = new Set();
  for (const entry of Object.values(manifest)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

    addManifestAsset(assetPaths, entry.file);
    for (const field of ['css', 'assets']) {
      const candidates = entry[field];
      if (!Array.isArray(candidates)) continue;
      for (const candidate of candidates) {
        addManifestAsset(assetPaths, candidate);
      }
    }
  }

  if (assetPaths.size === 0) {
    throw new Error('Vite client manifest did not contain any client assets.');
  }

  return assetPaths;
}

export function cacheControlForClientAsset(pathname, immutableAssetPaths) {
  return immutableAssetPaths.has(pathname)
    ? IMMUTABLE_ASSET_CACHE_CONTROL
    : REVALIDATE_CACHE_CONTROL;
}
