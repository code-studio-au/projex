# Dependency Freshness Review — 1 August 2026

This report records the network-enabled direct-dependency review required by
the 31 July repository review. Versions are eligible only after pnpm's seven-day
minimum release age and provenance checks, peer validation, and the repository's
full verification gate.

## Tested upgrade batch

The following direct dependencies were upgraded together and retained after
peer, application, infrastructure, database, server, and browser verification:

| Area            | Upgraded packages                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | AWS S3 SDK `3.1095.0`, Mantine `9.4.2`, Tabler icons `3.45.0`, Better Auth `1.6.25`, Kysely `0.29.4`, pg `8.22.0`, React and React DOM `19.2.8`, tsx `4.23.1`, and Zod `4.4.3`                                                                          |
| Quality tooling | ESLint `10.8.0` and `@eslint/js` `10.0.1`, React Hooks lint `7.1.1`, React Refresh lint `0.5.3`, TypeScript ESLint `8.65.0`, Prettier `3.9.6`, Vitest and coverage `4.1.10`, Playwright `1.62.0`, Knip `6.29.0`, and current Node 24/React type patches |
| Build tooling   | Vite `8.1.5` and `@vitejs/plugin-react` `6.0.4`, exact-pinned and verified with the recorded TanStack/H3/Srvx cohort                                                                                                                                    |
| Infrastructure  | AWS CDK library `2.262.1`, CDK CLI `2.1133.0`, and Constructs `10.7.1`                                                                                                                                                                                  |

Prettier 3.9.6's canonical output was applied to the files it reported. The
new dependency typings also reduced the tracked optional-property strictness
diagnostics without weakening compiler settings.

The standalone `pg-types` dependency was removed instead of moving from 2.2.0
to its incompatible 4.1.0 major. PostgreSQL `DATE` parsing now uses the public
registry exposed by the installed `pg` driver, preventing a second parser
registry from converting date-only values through the EC2 host timezone.

## Holds

A package appears in this register only while a newer published release exists.
Remove its row after the upgrade lands or the newer release is withdrawn. A
review date is a prompt to re-check the evidence, not permission to bypass an
unmet compatibility trigger.

| Package or cohort                    | Retained                  | Newer release reviewed   | Why it is held                                                                                                                                                                                                                      | Upgrade trigger                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-query` and devtools | `5.100.14`                | `5.101.4`                | Two WebKit runs on `5.101.4` reproducibly raised a page error when navigation cancelled a transaction-comment summary server-function request. The same suite passed on `5.100.14` with the rest of the upgrade batch retained.     | Upgrade React Query and its devtools together after a newer release or upstream fix addresses the cancellation path. Acceptance requires the full CI gate and a clean authenticated navigation run in Chromium, Firefox, and WebKit, with particular attention to server-function cancellation during route changes.                  |
| H3 and Srvx                          | `2.0.1-rc.20` / `0.11.22` | `2.0.1-rc.26` / `0.12.4` | The current TanStack Start server packages still resolve H3 `rc.20` and Srvx `0.11.22`. Updating only the direct production wrapper creates two HTTP stacks in the lockfile, which the framework-cohort verifier correctly rejects. | Upgrade when a release-age-eligible TanStack Start train selects the newer pair, or a coordinated framework upgrade otherwise produces exactly one H3 and one Srvx resolution. Re-run framework enforcement, production SSR build, release-artifact verification, auth/readiness/server smoke, all browsers, and nginx-facing checks. |
| TypeScript                           | `6.0.3`                   | `7.0.2`                  | The repository has only just moved to TypeScript 6, and `typescript-eslint` `8.65.0` currently declares TypeScript support below `6.1.0`; TypeScript 7 is therefore outside the installed lint toolchain's peer contract.           | Upgrade only after the TypeScript ESLint cohort and the repository's build, test, code-generation, and framework tooling declare or demonstrate TypeScript 7 support. Complete the tracked strictness burn-down first, then migrate in a dedicated PR and run the full CI and deployment gates.                                       |
| Node types                           | `24.13.3`                 | `26.1.1`                 | EC2 bootstrap, Docker, GitHub Actions, CDK documentation, and the root engine contract all run Node 24. Node 26 declarations could allow APIs that do not exist on the deployed runtime.                                            | Upgrade with a deliberate Node 26 runtime migration, never independently. Change the root engine, version files, Docker images, CI/release jobs, EC2 bootstrap, and operational documentation together; rebuild a release artifact and pass CDK, database, server, browser, and nginx-fronted deployment verification.                |

Repository maintainers should revisit these holds by 1 September 2026, when a
listed trigger becomes true, or earlier for a relevant security advisory. The
framework cohort remains governed by
[its coordinated upgrade policy](framework-dependency-cohort.md).

## Trust-policy result

`pnpm update --recursive` was intentionally not forced through. Re-resolving
all transitive packages encountered a provenance downgrade for `semver@6.3.1`
through `eslint-plugin-react-hooks` and Babel. Direct dependency updates and the
frozen lockfile remain reproducible, and the audit reported zero advisories.
The transitive refresh should be retried after its evidence is no longer a
downgrade; the trust policy must not be bypassed or suppressed.
