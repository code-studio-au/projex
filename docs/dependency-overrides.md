# Dependency Overrides

Projex keeps a small `pnpm.overrides` block in the root [package.json](../package.json)
to pin transitive dependencies when upstream trees lag behind known-good or
security-fixed releases.

Current overrides:

- `flatted`
  Security and parser-hardening floor used by multiple dependency trees.
- `minimatch`
  Keep glob parsing on a patched major to avoid older vulnerable ranges.
- `picomatch`
  Keep transitive glob matching aligned with patched releases.
- `postcss`
  Ensure transitive CSS tooling resolves to the patched 8.5.x line.
- `yaml`
  Keep YAML parsing on the audited 1.10.x floor expected by the repo security gate.

Update policy:

- remove an override as soon as the direct dependency tree resolves to an equal
  or newer safe version without it
- keep the override list intentionally short
- re-check overrides whenever lockfile refreshes or Dependabot opens grouped
  dependency updates
