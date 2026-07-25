import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const CLIENT_ASSETS_DIR = path.resolve('dist/client/assets');
const SERVER_ASSETS_DIR = path.resolve('dist/server/assets');

// These budgets include every asset TanStack Start preloads for the root route.
// They intentionally leave modest build-to-build headroom while preventing the
// former eager UI/query bundle (about 275 kB gzip) from returning.
const MAX_INITIAL_JS_GZIP_BYTES = 160 * 1024;
const MAX_INITIAL_CSS_GZIP_BYTES = 45 * 1024;

function extractAssetPaths(source, property) {
  const match = source.match(new RegExp(`${property}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) {
    throw new Error(`Could not find ${property} in the root route manifest.`);
  }

  return [...match[1].matchAll(/"\/assets\/([^"]+)"/g)].map(
    ([, assetPath]) => assetPath
  );
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

  const manifest = await readFile(
    path.join(SERVER_ASSETS_DIR, manifestFiles[0]),
    'utf8'
  );
  const rootBlock = manifest.match(
    /__root__:\s*\{([\s\S]*?)\n\s*\},\n\s*"\/":/
  )?.[1];
  if (!rootBlock) {
    throw new Error('Could not find the root route in the build manifest.');
  }

  return {
    js: extractAssetPaths(rootBlock, 'preloads'),
    css: extractAssetPaths(rootBlock, 'css'),
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
