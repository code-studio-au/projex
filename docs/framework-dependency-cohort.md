# Framework Dependency Cohort

Projex treats its full-stack framework and production HTTP adapter as one
tested compatibility cohort. The packages do not share one numeric release
train, so alignment means preserving the exact set published and exercised
together, not forcing matching version numbers.

The machine-readable source of truth is
[framework-dependency-cohort.json](../config/framework-dependency-cohort.json).
The root `package.json` exact-pins every direct member, and
`pnpm-lock.yaml` records one version of each related TanStack, Vite, H3, and
SRVX package.

## Supported cohort

| Package                           | Exact version        | Role                                                              |
| --------------------------------- | -------------------- | ----------------------------------------------------------------- |
| `@tanstack/react-start`           | `1.168.32`           | SSR, server functions, route and production builds                |
| `@tanstack/react-router`          | `1.170.18`           | Router version required by React Start `1.168.32`                 |
| `@tanstack/react-router-devtools` | `1.167.0`            | Development diagnostics with a compatible Router peer range       |
| `vite`                            | `8.0.16`             | Framework build integration                                       |
| `@vitejs/plugin-react`            | `6.0.2`              | React transform matched to Vite 8                                 |
| `srvx`                            | `0.11.22`            | Node HTTP adapter used by the production SSR server               |
| `h3-v2`                           | `npm:h3@2.0.1-rc.20` | H3 release candidate selected by the Start server-core dependency |

React Start `1.168.32` is the 19 July 2026 release-age-eligible train. Its
published dependencies select Router `1.170.18` and the internal Start and
Router versions recorded in the cohort file. The direct H3 alias remains on
`rc.20` because that is also the version selected by the Start server core.
SRVX `0.11.22` matches the Start plugin and H3 resolution, leaving one H3/SRVX
runtime stack in the lockfile.

## Enforcement

Run:

```bash
pnpm run verify:framework-cohort
```

The check fails when:

- a direct cohort dependency uses a caret, tilde, tag, or other independently
  moving range
- `package.json` and the root lockfile importer disagree
- a related framework package resolves at a missing, unexpected, or duplicate
  version
- a server-function bridge reintroduces the deprecated `inputValidator()` API
- pnpm's strict seven-day release-age policy is weakened
- a release-age exclusion covers any cohort package
- the recorded selection predates the end of a package's quarantine period

`verify:security:repo`, and therefore `verify:app` and CI, run the cohort check
automatically.

## Upgrade procedure

Upgrade the cohort only in a dedicated pull request:

1. Review the official TanStack, Vite, H3, and SRVX release metadata.
2. Select packages that have all passed `minimumReleaseAge: 10080`. Do not add a
   cohort package to `minimumReleaseAgeExclude`.
3. Confirm the selected React Start package's exact Router and internal package
   dependencies before changing direct declarations.
4. Update `package.json`, the lockfile, and the cohort record together.
5. Use `pnpm why` for deprecated transitives. Assign them to their direct owner
   instead of adding suppressions or arbitrary overrides.
6. Run the framework cohort check, dependency audit, full application gate,
   server and browser smoke suites, bundle verification, deploy-artifact
   creation and verification, static analysis, and CDK synthesis.

An H3 or SRVX transition is accepted only after the production server passes
login, authenticated session, API, readiness, Chromium, and Firefox smoke
coverage. Keep the `h3-v2` alias and this reproduction boundary until a tested
upstream release replaces it.

The currently deprecated `fstream`, `glob@7`, `inflight`, `lodash.isequal`, and
`rimraf@2` transitives are owned by `exceljs@4.4.0`, not the framework cohort.
They remain visible for an ExcelJS-owned upgrade rather than being suppressed
or forced through overrides.
