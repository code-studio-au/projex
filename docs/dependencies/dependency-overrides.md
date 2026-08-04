# Dependency Overrides

Projex keeps a small root `overrides` block in
[pnpm-workspace.yaml](../../pnpm-workspace.yaml) to pin transitive dependencies
when upstream trees lag behind known-good or security-fixed releases. pnpm 11
reads dependency-resolution settings from the workspace configuration rather
than the `pnpm` field in `package.json`.

Current overrides:

- `brace-expansion@<5.0.9`
  Keep transitive archive and lint tooling on the patched release for
  `GHSA-mh99-v99m-4gvg` and `GHSA-rgw5-rvv9-x895`. Version `5.0.9` is
  explicitly exempted from the minimum-release-age quarantine because it is
  the security release. Remove that release-age exception after 6 August 2026
  at 10:00 UTC; retain the override and compatibility patch until the legacy
  CommonJS consumers are gone. See
  [the dependency patch note](../../patches/README.md) for the exact behavior,
  security constraints, and removal procedure.
- `fast-uri@>=3.0.0 <3.1.5`
  Keep React Doctor's Ajv tree on the patched compatible-major release for
  `GHSA-7p8r-x3mc-p8w7`. Version `3.1.5` is temporarily exempted from the
  minimum-release-age quarantine because the high-severity advisory requires
  it. Remove that exception after 7 August 2026 at 09:16 UTC. Ajv's declared
  major-three range means this is not permission to force `fast-uri` 4.
- `js-yaml@>=4.0.0 <4.3.0`
  Keep TanStack Start and tooling YAML parsing on the patched 4.3.x line for
  `GHSA-52cp-r559-cp3m`.
- `postcss@<8.5.23`
  Keep Vite and its consumers at or above the patched PostCSS floor for
  `GHSA-fxqj-rqcc-2cmp` as well as the earlier
  `GHSA-r28c-9q8g-f849` repair. Version `8.5.23` was already outside the
  release-age quarantine when selected.
- `undici@>=7.0.0 <7.29.0`
  Keep jsdom and Vitest's Undici 7 tree on the first patched compatible release
  for the response-desynchronization, cache disclosure, CRLF injection, and
  cookie parsing advisories published in August 2026. Version `7.29.0` was
  already outside the release-age quarantine when selected; do not force the
  separate Undici 8 major into jsdom's range.

Update policy:

- remove an override as soon as the direct dependency tree resolves to an equal
  or newer safe version without it
- keep the override list intentionally short
- re-check overrides whenever lockfile refreshes or Dependabot opens grouped
  dependency updates
- update the exact-pinned
  [framework dependency cohort](framework-dependency-cohort.md) as one tested
  unit; do not use overrides to manufacture compatibility between independently
  selected framework versions
- keep any minimum-release-age bypass exact, advisory-driven, documented with
  a removal time, and shorter-lived than the security override itself
