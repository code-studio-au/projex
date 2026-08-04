# Dependency Patches

## `brace-expansion@5.0.9` CommonJS compatibility

Projex forces vulnerable transitive `brace-expansion` versions onto `5.0.9`,
the patched release for `GHSA-mh99-v99m-4gvg` and
`GHSA-rgw5-rvv9-x895`. Do not downgrade the package or suppress either
advisory.

The current dependency graph still contains legacy Minimatch 3 and 5 consumers
through ExcelJS 4.4's `archiver`, `glob`, and `unzipper` tree. ESLint 10 and the
current TypeScript tooling use newer Minimatch releases and do not require the
callable legacy export, although the security override also gives those paths
the patched implementation.

Those Minimatch releases load `brace-expansion` as a callable CommonJS module:

```js
const expand = require('brace-expansion');
expand(pattern);
```

`brace-expansion` 5 exposes named exports instead. The local
[`brace-expansion@5.0.9.patch`](brace-expansion@5.0.9.patch) restores the
callable CommonJS shape with:

```js
module.exports = Object.assign(expand, exports);
```

The secure 5.0.9 expansion implementation and its expansion limits remain
unchanged. `Object.assign` also retains the named exports for current
consumers.

### How it is applied

[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) contains three related settings:

- an override that resolves vulnerable `brace-expansion` versions to `5.0.9`
- an exact minimum-release-age exception for the security release
- a `patchedDependencies` entry for the compatibility patch

The lockfile records the patch hash. Do not edit the patch or its lockfile hash
independently; regenerate them with `pnpm patch` and `pnpm patch-commit`.

### Removal criteria

Remove this patch only when the installed dependency graph no longer contains a
consumer that expects the callable legacy export. Check the graph with:

```sh
pnpm why minimatch --recursive
```

After removing the override, patch entry, release-age exception, and patch
file, verify all of the following:

```sh
pnpm install --frozen-lockfile
pnpm audit --json
pnpm run verify:app
pnpm run verify:db:gate
```

The audit must pass without ignoring or suppressing the advisory.
