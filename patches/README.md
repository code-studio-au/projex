# Dependency Patches

## `brace-expansion@5.0.8` CommonJS compatibility

Projex forces transitive `brace-expansion` versions onto `5.0.8`, the patched
release for `GHSA-mh99-v99m-4gvg`. Do not downgrade the package or suppress the
advisory.

The current dependency graph still contains legacy Minimatch 3 and 5 consumers
through ExcelJS 4.4's `archiver`, `glob`, and `unzipper` tree. ESLint 10 uses
Minimatch 10 and does not depend on this compatibility patch.

Those Minimatch releases load `brace-expansion` as a callable CommonJS module:

```js
const expand = require('brace-expansion');
expand(pattern);
```

`brace-expansion` 5 exposes named exports instead. The local
[`brace-expansion@5.0.8.patch`](brace-expansion@5.0.8.patch) restores the
callable CommonJS shape with:

```js
module.exports = Object.assign(expand, exports);
```

The secure 5.0.8 expansion implementation and its expansion limits remain
unchanged. `Object.assign` also retains the named exports for current
consumers.

### How it is applied

[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) contains three related settings:

- an override that resolves older `brace-expansion` versions to `5.0.8`
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
