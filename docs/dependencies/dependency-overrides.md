# Dependency Overrides

Projex keeps a small root `overrides` block in
[pnpm-workspace.yaml](../../pnpm-workspace.yaml) to pin transitive dependencies
when upstream trees lag behind known-good or security-fixed releases. pnpm 11
reads dependency-resolution settings from the workspace configuration rather
than the `pnpm` field in `package.json`.

Current overrides:

- `@babel/core@7.29.7>semver` and
  `@babel/helper-compilation-targets@7.29.7>semver`
  Keep Babel 7's SemVer consumers on the compatible SemVer 7 API because
  pnpm 11's `no-downgrade` trust policy rejects the older unprovenanced
  `semver@6.3.1` release as a high-risk trust downgrade. Retain these narrow
  parent-scoped overrides until the TanStack/Babel tree declares SemVer 7 or
  moves to Babel 8; do not weaken the workspace trust policy to restore the
  old package.
- `brace-expansion@<5.0.9`
  Keep transitive archive and lint tooling on the patched release for
  `GHSA-mh99-v99m-4gvg` and `GHSA-rgw5-rvv9-x895`. Retain the override and
  compatibility patch until the legacy CommonJS consumers are gone. See
  [the dependency patch note](../../patches/README.md) for the exact behavior,
  security constraints, and removal procedure.
- `fast-uri@>=3.0.0 <3.1.5`
  Keep React Doctor's Ajv tree on the patched compatible-major release for
  `GHSA-7p8r-x3mc-p8w7`. Ajv's declared major-three range means this is not
  permission to force `fast-uri` 4.
- `js-yaml@>=4.0.0 <4.3.1`
  Keep TanStack Start and tooling YAML parsing on the patched 4.3.x line for
  `GHSA-52cp-r559-cp3m` and `GHSA-5p4m-2wfm-xmqj`.
- `nanoid@<3.3.18`
  Keep Vite and PostCSS identifier generation on the patched compatible-major
  release for `GHSA-2v37-7h3g-55p8`.
- `undici@>=7.0.0 <7.29.0`
  Keep any remaining Undici 7 consumers on the first patched compatible release
  for the response-desynchronization, cache disclosure, CRLF injection, and
  cookie parsing advisories published in August 2026. Version `7.29.0` was
  already outside the release-age quarantine when selected. jsdom 30 declares
  Undici 8 and resolves that major naturally; this override must remain scoped
  to the vulnerable Undici 7 range.

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
