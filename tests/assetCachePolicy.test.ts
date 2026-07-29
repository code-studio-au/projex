import { describe, expect, test } from 'vitest';

import {
  cacheControlForClientAsset,
  collectViteManifestAssetPaths,
  IMMUTABLE_ASSET_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
} from '../scripts/cache-policy.mjs';

describe('production client asset cache policy', () => {
  test('marks only manifest-backed fingerprinted assets immutable', () => {
    const immutableAssetPaths = collectViteManifestAssetPaths({
      'src/entry.tsx': {
        assets: [
          'assets/logo-A1b2C3d4.svg',
          'favicon.svg',
          'assets/unhashed-logo.svg',
        ],
        css: ['assets/index-Z9y8X7w6.css', 'assets/unhashed.css'],
        file: 'assets/index-Ab1_Cd2-.js',
      },
      'src/lazy.tsx': {
        file: 'assets/lazy-Ef3-Gh4_.js',
      },
    });

    expect([...immutableAssetPaths].sort()).toEqual([
      '/assets/index-Ab1_Cd2-.js',
      '/assets/index-Z9y8X7w6.css',
      '/assets/lazy-Ef3-Gh4_.js',
      '/assets/logo-A1b2C3d4.svg',
    ]);
    expect(
      cacheControlForClientAsset(
        '/assets/index-Ab1_Cd2-.js',
        immutableAssetPaths
      )
    ).toBe(IMMUTABLE_ASSET_CACHE_CONTROL);
    expect(
      cacheControlForClientAsset('/assets/unhashed.css', immutableAssetPaths)
    ).toBe(REVALIDATE_CACHE_CONTROL);
    expect(
      cacheControlForClientAsset('/favicon.svg', immutableAssetPaths)
    ).toBe(REVALIDATE_CACHE_CONTROL);
  });

  test('rejects a missing or malformed Vite manifest inventory', () => {
    expect(() => collectViteManifestAssetPaths(null)).toThrow(
      'Vite client manifest must be an object.'
    );
    expect(() =>
      collectViteManifestAssetPaths({
        entry: { file: 'assets/unhashed.js' },
      })
    ).toThrow('Vite client manifest did not contain any client assets.');
  });
});
