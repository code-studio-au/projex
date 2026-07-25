# Dependency Overrides

Projex keeps a small root `overrides` block in
[pnpm-workspace.yaml](../pnpm-workspace.yaml) to pin transitive dependencies
when upstream trees lag behind known-good or security-fixed releases. pnpm 11
reads dependency-resolution settings from the workspace configuration rather
than the `pnpm` field in `package.json`.

Current overrides:

- `brace-expansion@<5.0.8`
  Keep transitive archive and lint tooling on the only patched release for
  `GHSA-mh99-v99m-4gvg`. Version `5.0.8` is explicitly exempted from the
  minimum-release-age quarantine because it is the security release. A local
  compatibility patch preserves the callable CommonJS export required by
  legacy consumers while retaining the patched expansion implementation. See
  [the dependency patch note](../patches/README.md) for the exact behavior,
  security constraints, and removal procedure.
- `js-yaml@>=4.0.0 <4.3.0`
  Keep TanStack Start and tooling YAML parsing on the patched 4.3.x line for
  `GHSA-52cp-r559-cp3m`.
- `postcss@<8.5.18`
  Keep Vite and its consumers on the patched PostCSS line for
  `GHSA-r28c-9q8g-f849`.

Update policy:

- remove an override as soon as the direct dependency tree resolves to an equal
  or newer safe version without it
- keep the override list intentionally short
- re-check overrides whenever lockfile refreshes or Dependabot opens grouped
  dependency updates
