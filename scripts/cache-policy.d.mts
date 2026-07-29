export declare const IMMUTABLE_ASSET_CACHE_CONTROL: string;
export declare const REVALIDATE_CACHE_CONTROL: string;

export type ViteManifest = Record<
  string,
  {
    assets?: unknown;
    css?: unknown;
    file?: unknown;
  }
>;

export declare function collectViteManifestAssetPaths(
  manifest: unknown
): Set<string>;

export declare function cacheControlForClientAsset(
  pathname: string,
  immutableAssetPaths: ReadonlySet<string>
): string;
