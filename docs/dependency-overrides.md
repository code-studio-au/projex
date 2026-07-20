# Dependency Overrides

Projex keeps a small root `overrides` block in
[pnpm-workspace.yaml](../pnpm-workspace.yaml) to pin transitive dependencies
when upstream trees lag behind known-good or security-fixed releases. pnpm 11
reads dependency-resolution settings from the workspace configuration rather
than the `pnpm` field in `package.json`.

Current overrides:

- `brace-expansion@<1.1.16`, `brace-expansion@>=2.0.0 <2.1.2`, and
  `brace-expansion@>=3.0.0 <5.0.7`
  Keep each transitive major on its compatible patched line for
  `GHSA-3jxr-9vmj-r5cp` without forcing old ExcelJS or current lint tooling
  across a package major boundary.
- `js-yaml@>=4.0.0 <4.3.0`
  Keep TanStack Start and tooling YAML parsing on the patched 4.3.x line for
  `GHSA-52cp-r559-cp3m`.

Update policy:

- remove an override as soon as the direct dependency tree resolves to an equal
  or newer safe version without it
- keep the override list intentionally short
- re-check overrides whenever lockfile refreshes or Dependabot opens grouped
  dependency updates
