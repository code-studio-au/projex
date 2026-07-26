import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const CLIENT_ASSETS_DIR = path.resolve('dist/client/assets');
const SERVER_ASSETS_DIR = path.resolve('dist/server/assets');

// These budgets include every asset TanStack Start preloads for the root route.
// They intentionally leave modest build-to-build headroom while preventing the
// former eager UI/query bundle (about 275 kB gzip) from returning.
const MAX_INITIAL_JS_GZIP_BYTES = 160 * 1024;
const MAX_INITIAL_CSS_GZIP_BYTES = 45 * 1024;

function normalizeAssetPaths(value, property) {
  if (!Array.isArray(value)) {
    throw new Error(
      `Expected ${property} to be an array in the root route manifest.`
    );
  }

  return value.map((assetPath) => {
    if (typeof assetPath !== 'string' || !assetPath.startsWith('/assets/')) {
      throw new Error(
        `Invalid ${property} entry in the root route manifest: ${String(assetPath)}`
      );
    }

    const relativeAssetPath = assetPath.slice('/assets/'.length);
    const resolvedAssetPath = path.resolve(
      CLIENT_ASSETS_DIR,
      relativeAssetPath
    );
    if (
      !relativeAssetPath ||
      !resolvedAssetPath.startsWith(`${CLIENT_ASSETS_DIR}${path.sep}`)
    ) {
      throw new Error(
        `Unsafe ${property} entry in the root route manifest: ${assetPath}`
      );
    }

    return relativeAssetPath;
  });
}

async function readRootAssets() {
  const manifestFiles = (await readdir(SERVER_ASSETS_DIR)).filter((file) =>
    file.startsWith('_tanstack-start-manifest_v-')
  );
  if (manifestFiles.length !== 1) {
    throw new Error(
      `Expected one TanStack Start manifest, found ${manifestFiles.length}. Run the production build first.`
    );
  }

  const manifestPath = path.join(SERVER_ASSETS_DIR, manifestFiles[0]);
  const manifestModule = await import(pathToFileURL(manifestPath).href);
  if (typeof manifestModule.tsrStartManifest !== 'function') {
    throw new Error(
      'The TanStack Start manifest did not export tsrStartManifest.'
    );
  }

  const manifest = manifestModule.tsrStartManifest();
  const rootRoute = manifest?.routes?.__root__;
  if (!rootRoute || typeof rootRoute !== 'object') {
    throw new Error('Could not find the root route in the build manifest.');
  }

  return {
    js: normalizeAssetPaths(rootRoute.preloads, 'preloads'),
    css: normalizeAssetPaths(rootRoute.css ?? [], 'css'),
  };
}

async function measureAssets(assetPaths) {
  return Promise.all(
    assetPaths.map(async (assetPath) => {
      const contents = await readFile(path.join(CLIENT_ASSETS_DIR, assetPath));
      return {
        assetPath,
        rawBytes: contents.byteLength,
        gzipBytes: gzipSync(contents).byteLength,
      };
    })
  );
}

function formatKib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function printGroup(label, assets) {
  for (const asset of assets) {
    console.log(
      `${label.padEnd(3)} ${asset.assetPath.padEnd(48)} ${formatKib(asset.gzipBytes)} gzip`
    );
  }
}

const rootAssets = await readRootAssets();
const [jsAssets, cssAssets] = await Promise.all([
  measureAssets(rootAssets.js),
  measureAssets(rootAssets.css),
]);

printGroup('JS', jsAssets);
printGroup('CSS', cssAssets);

const initialJsGzipBytes = jsAssets.reduce(
  (total, asset) => total + asset.gzipBytes,
  0
);
const initialCssGzipBytes = cssAssets.reduce(
  (total, asset) => total + asset.gzipBytes,
  0
);

console.log(
  `Initial bundle: ${formatKib(initialJsGzipBytes)} JS gzip / ${formatKib(initialCssGzipBytes)} CSS gzip`
);
console.log(
  `Budgets: ${formatKib(MAX_INITIAL_JS_GZIP_BYTES)} JS gzip / ${formatKib(MAX_INITIAL_CSS_GZIP_BYTES)} CSS gzip`
);

const failures = [];
if (initialJsGzipBytes > MAX_INITIAL_JS_GZIP_BYTES) {
  failures.push(
    `Initial JavaScript exceeds its budget by ${formatKib(initialJsGzipBytes - MAX_INITIAL_JS_GZIP_BYTES)}.`
  );
}
if (initialCssGzipBytes > MAX_INITIAL_CSS_GZIP_BYTES) {
  failures.push(
    `Initial CSS exceeds its budget by ${formatKib(initialCssGzipBytes - MAX_INITIAL_CSS_GZIP_BYTES)}.`
  );
}
if (failures.length) {
  throw new Error(failures.join('\n'));
}

console.log('Client bundle budgets passed.');
