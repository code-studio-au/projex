import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const CLIENT_ASSETS_DIR = path.resolve(
  process.env.PROJEX_BUNDLE_CLIENT_ASSETS_DIR ?? 'dist/client/assets'
);
const SERVER_ASSETS_DIR = path.resolve(
  process.env.PROJEX_BUNDLE_SERVER_ASSETS_DIR ?? 'dist/server/assets'
);

const ROOT_ROUTE_ID = '__root__';
const COMPANY_DASHBOARD_ROUTE_ID = '/_authed/c/$companyId/';
const PROJECT_WORKSPACE_ROUTE_ID = '/_authed/c/$companyId/p/$projectId';

// These budgets intentionally leave modest build-to-build headroom. The route
// budgets cover every generated dependency needed for a direct route load,
// while navigation budgets cover the additional payload beyond root preloads.
const BUNDLE_TARGETS = [
  {
    label: 'Root initial',
    routeId: ROOT_ROUTE_ID,
    firstLoadBudget: {
      js: 160 * 1024,
      css: 45 * 1024,
    },
  },
  {
    label: 'Company dashboard',
    routeId: COMPANY_DASHBOARD_ROUTE_ID,
    componentAssetPrefix: 'CompanyDashboardPage-',
    firstLoadBudget: {
      js: 345 * 1024,
      css: 48 * 1024,
    },
    navigationBudget: {
      js: 200 * 1024,
      css: 8 * 1024,
    },
    lazyNavigationTargets: [
      {
        label: 'Company summary tab',
        assetPrefix: 'CompanySummaryPanel-',
        budget: { js: 10 * 1024, css: 1 * 1024 },
      },
      {
        label: 'Company settings tab',
        assetPrefix: 'CompanySettingsPanel-',
        budget: { js: 30 * 1024, css: 1 * 1024 },
      },
    ],
  },
  {
    label: 'Project workspace',
    routeId: PROJECT_WORKSPACE_ROUTE_ID,
    componentAssetPrefix: 'ProjectWorkspacePage-',
    firstLoadBudget: {
      js: 370 * 1024,
      css: 48 * 1024,
    },
    navigationBudget: {
      js: 225 * 1024,
      css: 8 * 1024,
    },
    lazyNavigationTargets: [
      {
        label: 'Transactions tab',
        assetPrefix: 'TransactionsPanel-',
        budget: { js: 40 * 1024, css: 1 * 1024 },
      },
      {
        label: 'Import tab',
        assetPrefix: 'PowerBiImporterPanel-',
        budget: { js: 20 * 1024, css: 1 * 1024 },
      },
      {
        label: 'Project settings tab',
        assetPrefix: 'ProjectSettingsPanel-',
        budget: { js: 25 * 1024, css: 1 * 1024 },
      },
    ],
  },
];

function normalizeAssetPath(value, property) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${property} entry: ${String(value)}`);
  }

  let relativeAssetPath = value;
  if (relativeAssetPath.startsWith('/assets/')) {
    relativeAssetPath = relativeAssetPath.slice('/assets/'.length);
  } else if (relativeAssetPath.startsWith('assets/')) {
    relativeAssetPath = relativeAssetPath.slice('assets/'.length);
  } else if (relativeAssetPath.startsWith('./')) {
    relativeAssetPath = relativeAssetPath.slice(2);
  } else {
    throw new Error(`Invalid ${property} entry: ${value}`);
  }

  relativeAssetPath = relativeAssetPath.split(/[?#]/, 1)[0];
  const resolvedAssetPath = path.resolve(CLIENT_ASSETS_DIR, relativeAssetPath);
  if (
    !relativeAssetPath ||
    !resolvedAssetPath.startsWith(`${CLIENT_ASSETS_DIR}${path.sep}`)
  ) {
    throw new Error(`Unsafe ${property} entry: ${value}`);
  }

  return relativeAssetPath;
}

function normalizeAssetPaths(value, property) {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${property} to be an array.`);
  }
  return value.map((assetPath) => normalizeAssetPath(assetPath, property));
}

async function readStartManifest() {
  const manifestFiles = (await readdir(SERVER_ASSETS_DIR)).filter((file) =>
    file.startsWith('_tanstack-start-manifest_v-')
  );
  if (manifestFiles.length !== 1) {
    throw new Error(
      `Expected one TanStack Start manifest, found ${manifestFiles.length}. Run the production build first.`
    );
  }

  const manifestPath = path.join(SERVER_ASSETS_DIR, manifestFiles[0]);
  const manifestModule = await import(
    `${pathToFileURL(manifestPath).href}?bundle-check=${Date.now()}`
  );
  if (typeof manifestModule.tsrStartManifest !== 'function') {
    throw new Error(
      'The TanStack Start manifest did not export tsrStartManifest.'
    );
  }

  const manifest = manifestModule.tsrStartManifest();
  if (!manifest?.routes || typeof manifest.routes !== 'object') {
    throw new Error('The TanStack Start manifest did not contain routes.');
  }
  return manifest;
}

function findStaticDependencies(contents, assetPath) {
  if (!assetPath.endsWith('.js')) return [];

  const dependencies = [];
  const importPattern =
    /(?:\bfrom\s*|\bimport\s*)["'](\.\/[^"'?#]+(?:[?#][^"']*)?)["']/g;
  for (const match of contents.matchAll(importPattern)) {
    dependencies.push(
      normalizeAssetPath(match[1], `static import in ${assetPath}`)
    );
  }
  return dependencies;
}

function findViteMappedDependencies(contents, assetPath) {
  if (!assetPath.endsWith('.js')) return [];

  return findViteDependencyMaps(contents, assetPath).flat();
}

function findViteDependencyMaps(contents, assetPath) {
  if (!assetPath.endsWith('.js')) return [];

  const dependencyMaps = [];
  const mapPattern = /\b([A-Za-z_$][\w$]*)\.f\|\|\(\1\.f=(\[[^\]]*])\)/g;
  for (const match of contents.matchAll(mapPattern)) {
    let values;
    try {
      values = JSON.parse(match[2]);
    } catch (error) {
      throw new Error(
        `Could not parse Vite dependency map in ${assetPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    dependencyMaps.push(
      normalizeAssetPaths(values, `Vite dependency map in ${assetPath}`)
    );
  }
  return dependencyMaps;
}

function findViteLazyDependencyGroup(contents, assetPath, assetPrefix) {
  const dependencyMaps = findViteDependencyMaps(contents, assetPath);
  if (dependencyMaps.length !== 1) {
    throw new Error(
      `Expected one Vite dependency map in ${assetPath}, found ${dependencyMaps.length}.`
    );
  }

  const dependencyMap = dependencyMaps[0];
  const dynamicImportPattern =
    /import\(\s*[`"']\.\/([^`"']+)[`"']\s*\)\s*,\s*__vite__mapDeps\(\[([0-9,\s]+)]\)/g;
  const matches = [...contents.matchAll(dynamicImportPattern)].filter((match) =>
    match[1].startsWith(assetPrefix)
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${assetPrefix} lazy import in ${assetPath}, found ${matches.length}.`
    );
  }

  const importedAsset = matches[0][1];
  const indices = matches[0][2]
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10));
  const dependencies = indices.map((index) => {
    const dependency = dependencyMap[index];
    if (!dependency) {
      throw new Error(
        `Vite dependency index ${index} for ${importedAsset} is invalid in ${assetPath}.`
      );
    }
    return dependency;
  });
  if (!dependencies.includes(importedAsset)) {
    throw new Error(
      `Vite dependency group for ${importedAsset} does not include its imported asset.`
    );
  }
  return dependencies;
}

const assetContents = new Map();

async function readAssetContents(assetPath) {
  const cached = assetContents.get(assetPath);
  if (cached !== undefined) return cached;

  const contents = await readFile(
    path.join(CLIENT_ASSETS_DIR, assetPath),
    'utf8'
  );
  assetContents.set(assetPath, contents);
  return contents;
}

async function expandStaticDependencies(assetPaths) {
  const expanded = new Set(assetPaths);
  const pending = [...expanded];

  while (pending.length > 0) {
    const assetPath = pending.pop();
    const contents = await readAssetContents(assetPath);
    for (const dependency of findStaticDependencies(contents, assetPath)) {
      if (expanded.has(dependency)) continue;
      expanded.add(dependency);
      pending.push(dependency);
    }
  }

  return expanded;
}

function buildRouteParents(routes) {
  const parents = new Map();
  for (const [routeId, route] of Object.entries(routes)) {
    for (const childId of route.children ?? []) {
      if (parents.has(childId)) {
        throw new Error(`Route ${childId} has more than one parent.`);
      }
      parents.set(childId, routeId);
    }
  }
  return parents;
}

function buildRouteChain(routes, routeId) {
  if (!routes[routeId]) {
    throw new Error(`Could not find route ${routeId} in the build manifest.`);
  }

  const parents = buildRouteParents(routes);
  const routeChain = [];
  const visited = new Set();
  let currentRouteId = routeId;

  while (currentRouteId) {
    if (visited.has(currentRouteId)) {
      throw new Error(`Route parent cycle detected at ${currentRouteId}.`);
    }
    visited.add(currentRouteId);
    routeChain.unshift(currentRouteId);
    currentRouteId = parents.get(currentRouteId);
  }

  if (routeChain[0] !== ROOT_ROUTE_ID) {
    throw new Error(`Route ${routeId} is not descended from ${ROOT_ROUTE_ID}.`);
  }
  return routeChain;
}

async function collectRootAssets(routes) {
  const rootRoute = routes[ROOT_ROUTE_ID];
  if (!rootRoute || typeof rootRoute !== 'object') {
    throw new Error('Could not find the root route in the build manifest.');
  }

  const rootAssets = [
    ...normalizeAssetPaths(rootRoute.preloads, 'root route preloads'),
    ...normalizeAssetPaths(rootRoute.css ?? [], 'root route css'),
  ];
  return expandStaticDependencies(rootAssets);
}

async function collectRouteAssets(routes, routeId, rootAssets) {
  if (routeId === ROOT_ROUTE_ID) return new Set(rootAssets);

  const routeAssets = new Set(rootAssets);
  const routeChain = buildRouteChain(routes, routeId);

  for (const chainRouteId of routeChain.slice(1)) {
    const route = routes[chainRouteId];
    const preloads = normalizeAssetPaths(
      route.preloads ?? [],
      `${chainRouteId} preloads`
    );
    const css = normalizeAssetPaths(route.css ?? [], `${chainRouteId} css`);
    const routeEntries = await expandStaticDependencies([...preloads, ...css]);
    for (const assetPath of routeEntries) routeAssets.add(assetPath);

    for (const preload of preloads) {
      const contents = await readAssetContents(preload);
      const mappedDependencies = findViteMappedDependencies(contents, preload);
      const expandedDependencies =
        await expandStaticDependencies(mappedDependencies);
      for (const assetPath of expandedDependencies) {
        routeAssets.add(assetPath);
      }
    }
  }

  return routeAssets;
}

async function findRouteComponentAsset(routes, target) {
  const route = routes[target.routeId];
  const preloads = normalizeAssetPaths(
    route.preloads ?? [],
    `${target.routeId} preloads`
  );
  const matches = [];

  for (const preload of preloads) {
    const contents = await readAssetContents(preload);
    matches.push(
      ...findViteMappedDependencies(contents, preload).filter((assetPath) =>
        assetPath.startsWith(target.componentAssetPrefix)
      )
    );
  }

  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${target.componentAssetPrefix} route component asset, found ${matches.length}.`
    );
  }
  return matches[0];
}

async function collectLazyNavigationAssets(routes, target, firstLoadAssets) {
  if (!target.lazyNavigationTargets?.length) return [];

  const componentAsset = await findRouteComponentAsset(routes, target);
  const contents = await readAssetContents(componentAsset);
  const reports = [];

  for (const lazyTarget of target.lazyNavigationTargets ?? []) {
    const dependencyGroup = findViteLazyDependencyGroup(
      contents,
      componentAsset,
      lazyTarget.assetPrefix
    );
    const expandedDependencies =
      await expandStaticDependencies(dependencyGroup);
    const additionalAssets = new Set(
      [...expandedDependencies].filter(
        (assetPath) => !firstLoadAssets.has(assetPath)
      )
    );
    reports.push({ target: lazyTarget, assetPaths: additionalAssets });
  }

  return reports;
}

async function measureAssets(assetPaths) {
  return Promise.all(
    [...assetPaths]
      .sort((a, b) => a.localeCompare(b))
      .map(async (assetPath) => {
        const contents = await readFile(
          path.join(CLIENT_ASSETS_DIR, assetPath)
        );
        return {
          assetPath,
          rawBytes: contents.byteLength,
          gzipBytes: gzipSync(contents).byteLength,
          type: assetPath.endsWith('.css') ? 'css' : 'js',
        };
      })
  );
}

function summarizeAssets(assets) {
  return {
    js: assets
      .filter((asset) => asset.type === 'js')
      .reduce((total, asset) => total + asset.gzipBytes, 0),
    css: assets
      .filter((asset) => asset.type === 'css')
      .reduce((total, asset) => total + asset.gzipBytes, 0),
  };
}

function formatKib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function formatSummary(summary) {
  return `${formatKib(summary.js)} JS gzip / ${formatKib(summary.css)} CSS gzip`;
}

function printRootAssets(assets) {
  const orderedAssets = [...assets].sort(
    (a, b) =>
      Number(a.type === 'css') - Number(b.type === 'css') ||
      a.assetPath.localeCompare(b.assetPath)
  );
  for (const asset of orderedAssets) {
    console.log(
      `${asset.type.toUpperCase().padEnd(3)} ${asset.assetPath.padEnd(48)} ${formatKib(asset.gzipBytes)} gzip`
    );
  }
}

function appendBudgetFailures({ failures, label, actual, budget }) {
  for (const type of ['js', 'css']) {
    if (actual[type] <= budget[type]) continue;
    failures.push(
      `${label} ${type.toUpperCase()} exceeds its budget by ${formatKib(actual[type] - budget[type])}.`
    );
  }
}

const manifest = await readStartManifest();
const rootAssetPaths = await collectRootAssets(manifest.routes);
const rootAssets = await measureAssets(rootAssetPaths);
const rootSummary = summarizeAssets(rootAssets);
const failures = [];

printRootAssets(rootAssets);

for (const target of BUNDLE_TARGETS) {
  const firstLoadAssetPaths = await collectRouteAssets(
    manifest.routes,
    target.routeId,
    rootAssetPaths
  );
  const firstLoadAssets = await measureAssets(firstLoadAssetPaths);
  const firstLoadSummary = summarizeAssets(firstLoadAssets);

  console.log(`\n${target.label}`);
  console.log(`  First load: ${formatSummary(firstLoadSummary)}`);
  console.log(`  First-load budget: ${formatSummary(target.firstLoadBudget)}`);
  appendBudgetFailures({
    failures,
    label: `${target.label} first-load`,
    actual: firstLoadSummary,
    budget: target.firstLoadBudget,
  });

  if (target.navigationBudget) {
    const navigationAssetPaths = new Set(
      [...firstLoadAssetPaths].filter(
        (assetPath) => !rootAssetPaths.has(assetPath)
      )
    );
    const navigationAssets = await measureAssets(navigationAssetPaths);
    const navigationSummary = summarizeAssets(navigationAssets);
    console.log(
      `  Navigation beyond root: ${formatSummary(navigationSummary)}`
    );
    console.log(
      `  Navigation budget: ${formatSummary(target.navigationBudget)}`
    );
    appendBudgetFailures({
      failures,
      label: `${target.label} navigation`,
      actual: navigationSummary,
      budget: target.navigationBudget,
    });
  }

  const lazyNavigationReports = await collectLazyNavigationAssets(
    manifest.routes,
    target,
    firstLoadAssetPaths
  );
  for (const report of lazyNavigationReports) {
    const assets = await measureAssets(report.assetPaths);
    const summary = summarizeAssets(assets);
    console.log(
      `  ${report.target.label} additional payload: ${formatSummary(summary)}`
    );
    console.log(
      `  ${report.target.label} budget: ${formatSummary(report.target.budget)}`
    );
    appendBudgetFailures({
      failures,
      label: report.target.label,
      actual: summary,
      budget: report.target.budget,
    });
  }
}

if (failures.length > 0) {
  throw new Error(failures.join('\n'));
}

console.log('\nClient bundle budgets passed.');
