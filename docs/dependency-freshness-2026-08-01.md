# Dependency Freshness Review — 1 August 2026

This report records the network-enabled direct-dependency review required by
the 31 July repository review. Versions are eligible only after pnpm's seven-day
minimum release age and provenance checks, peer validation, and the repository's
full verification gate.

## Tested upgrade batch

The following direct dependencies were upgraded together and retained after
peer, application, infrastructure, database, server, and browser verification:

| Area            | Upgraded packages                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | AWS S3 SDK `3.1095.0`, Mantine `9.4.2`, Tabler icons `3.45.0`, Better Auth `1.6.25`, Kysely `0.29.4`, pg `8.22.0`, React and React DOM `19.2.8`, tsx `4.23.1`, and Zod `4.4.3`                                |
| Quality tooling | ESLint 9 and `@eslint/js` `9.39.5`, React Hooks lint `7.1.1`, React Refresh lint `0.4.26`, TypeScript ESLint `8.65.0`, Prettier `3.9.6`, Vitest and coverage `4.1.10`, and current Node 24/React type patches |
| Infrastructure  | AWS CDK library `2.262.1`, CDK CLI `2.1133.0`, and Constructs `10.7.1`                                                                                                                                        |

Prettier 3.9.6's canonical output was applied to the files it reported. The
new dependency typings also reduced the tracked optional-property strictness
diagnostics without weakening compiler settings.

## Holds

| Package or cohort                    | Installed                      | Eligible/latest seen           | Decision and evidence                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-query` and devtools | `5.100.14`                     | `5.101.4`                      | Exact hold. Two WebKit runs on `5.101.4` reproducibly raised a page error when a transaction-comment summary server-function request was cancelled during navigation. The same suite passed on `5.100.14` with all other upgrades retained. Revisit after a newer React Query release or an upstream fix. |
| Vite and React plugin                | `8.0.16` / `6.0.2`             | `8.1.5` / `6.0.4`              | Hold for the exact-pinned framework cohort; upgrade only with TanStack Start/Router and full SSR/server/browser verification.                                                                                                                                                                             |
| H3 and Srvx                          | `2.0.1-rc.20` / `0.11.22`      | `2.0.1-rc.26` / `0.12.4`       | Hold for the framework HTTP cohort and its security/streaming smoke coverage.                                                                                                                                                                                                                             |
| Playwright                           | `1.61.0`                       | `1.62.0`                       | Exact toolchain hold. Upgrade the package and Chromium, Firefox, and WebKit binaries together in a focused browser PR.                                                                                                                                                                                    |
| Knip                                 | `6.26.0`                       | `6.29.0`                       | Exact static-analysis hold. Upgrade separately and review every new dead-code finding.                                                                                                                                                                                                                    |
| ESLint, `@eslint/js`, and `globals`  | `9.39.5` / `9.39.5` / `16.5.0` | `10.8.0` / `10.0.1` / `17.7.0` | Major tooling cohort; migrate config and plugins together after compatibility review.                                                                                                                                                                                                                     |
| TypeScript                           | `6.0.3`                        | `7.0.2`                        | Major compiler hold. The repository has just adopted TypeScript 6 and should complete its strictness burn-down before a TypeScript 7 migration.                                                                                                                                                           |
| Node types                           | `24.13.3`                      | `26.1.1`                       | Match the pinned Node 24 runtime rather than adopting Node 26 declarations.                                                                                                                                                                                                                               |
| `pg-types`                           | `2.2.0`                        | `4.1.0`                        | Major runtime hold pending focused parser/API compatibility and database integration testing.                                                                                                                                                                                                             |
| React Refresh lint plugin            | `0.4.26`                       | `0.5.3`                        | Zero-major compatibility hold; review with the Vite/React tooling cohort.                                                                                                                                                                                                                                 |

Repository maintainers should revisit these holds by 1 September 2026, or
earlier for a relevant security advisory. The framework cohort remains governed
by [its coordinated upgrade policy](framework-dependency-cohort.md).

## Trust-policy result

`pnpm update --recursive` was intentionally not forced through. Re-resolving
all transitive packages encountered a provenance downgrade for `semver@6.3.1`
through `eslint-plugin-react-hooks` and Babel. Direct dependency updates and the
frozen lockfile remain reproducible, and the audit reported zero advisories.
The transitive refresh should be retried after its evidence is no longer a
downgrade; the trust policy must not be bypassed or suppressed.
