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

| Package or cohort                    | Retained                  | Newer release reviewed   | Why it is held                                                                                                                                                                                                                                            | Upgrade trigger                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-query` and devtools | `5.100.14`                | `5.101.4`                | Two WebKit runs on `5.101.4` reproducibly raised a page error when navigation cancelled a transaction-comment summary server-function request. The same suite passed on `5.100.14` with the rest of the upgrade batch retained.                           | Upgrade React Query and its devtools together after a newer release or upstream fix addresses the cancellation path. Acceptance requires the full CI gate and a clean authenticated navigation run in Chromium, Firefox, and WebKit, with particular attention to server-function cancellation during route changes.                  |
| H3 and Srvx                          | `2.0.1-rc.20` / `0.11.22` | `2.0.1-rc.26` / `0.12.5` | React Start `1.168.46` still resolves H3 `rc.20`, while its plugin's `srvx` range remains on the `0.11` line. Updating only the direct production wrapper creates two HTTP stacks in the lockfile, which the framework-cohort verifier correctly rejects. | Upgrade when a release-age-eligible TanStack Start train selects the newer pair, or a coordinated framework upgrade otherwise produces exactly one H3 and one Srvx resolution. Re-run framework enforcement, production SSR build, release-artifact verification, auth/readiness/server smoke, all browsers, and nginx-facing checks. |

Repository maintainers should revisit these holds by 1 September 2026, when a
listed trigger becomes true, or earlier for a relevant security advisory. The
framework cohort remains governed by
[its coordinated upgrade policy](framework-dependency-cohort.md).

## 4 August security advisory follow-up

Registry advisories published after the original review required an immediate
transitive refresh. The repository now enforces these safe compatible releases:

- `brace-expansion@5.0.9`, with the existing legacy CommonJS compatibility
  behavior carried forward
- `fast-uri@3.1.5` for React Doctor's Ajv tree
- `postcss@8.5.23` as the then-current minimum safe Vite/PostCSS floor
- `undici@7.29.0` for jsdom and Vitest

Only `brace-expansion@5.0.9` and `fast-uri@3.1.5` require temporary exact
release-age exceptions. Their removal times and the continuing pin rationale
are recorded in the
[dependency override policy](dependency-overrides.md). The other direct and
cohort holds above are unchanged.

## Trust-policy result

`pnpm update --recursive` was intentionally not forced through. Re-resolving
all transitive packages encountered a provenance downgrade for `semver@6.3.1`
through `eslint-plugin-react-hooks` and Babel. Direct dependency updates and the
frozen lockfile remained reproducible, and the audit reported zero advisories
at the time of the review. The 4 August advisory response above updates only
the newly vulnerable paths; the broader transitive refresh should be retried
after its evidence is no longer a downgrade. The trust policy must not be
bypassed or suppressed.

## 24 August Node 26 runtime migration

The Node runtime hold was resolved as a coordinated runtime cohort:

- Node `26` is now the root engine, local version-file, Docker, GitHub Actions,
  release, and EC2 bootstrap target; the migration was exercised locally on
  Node `26.7.0`
- `@types/node` moved to `26.2.0` in both application and CDK workspaces, and
  jsdom moved to `30.0.1`, whose engine contract explicitly includes Node 26
- pnpm moved to `11.22.0`; because Node 26 does not bundle Corepack, Docker and
  EC2 bootstrap now install exact `corepack@0.35.0` before activating the pinned
  pnpm release
- the existing `no-downgrade` trust policy remains enabled. Two parent-scoped
  Babel overrides move its compatible SemVer consumers from rejected,
  unprovenanced `semver@6.3.1` to `semver@7.8.5`; the rationale and removal
  trigger are recorded in the dependency override policy

The migrated lockfile passed frozen installation, peer and provenance checks,
zero-advisory audit, application/type/lint/coverage/build/bundle verification,
CDK tests/build/synthesis, disposable database verification, full disposable
server smoke, and Chromium, Firefox, and WebKit browser smoke. A release
artifact was also rebuilt successfully. The Docker bootstrap sequence was
independently exercised under Node 26 with the exact Corepack and pnpm pins;
the local Docker image build could not proceed past its base-image pull because
Docker Hub's anonymous token endpoint timed out before the public
`node:26-alpine` base could be downloaded.

## 24 August TypeScript 7 dual-compiler migration

TypeScript 7.0.2 is now the primary compiler without forcing compiler-API
consumers outside their supported peer range:

- `@typescript/native` aliases exact `typescript@7.0.2` and supplies the `tsc`
  executable used by primary application, strictness, and CDK checks
- the package named `typescript` aliases exact
  `@typescript/typescript6@6.0.2`; it supplies `tsc6` and reports the maintained
  TypeScript `6.0.3` compiler/API to `typescript-eslint`, `ts-node`,
  Kysely tooling, and other programmatic consumers
- `pnpm run typecheck` requires TS7 and TS6 to pass in that order, and the CDK
  build emits with TS7 before validating the same source with TS6
- one Mantine table row callback now carries an explicit generic row type where
  TS7 no longer preserved contextual inference through a conditional spread

Both compiler generations pass the root project references and CDK source.
TypeScript 7 also passes the zero-diagnostic strictness ratchet, and the focused
React component regression test and changed-scope React Doctor scan remain
clean.

## 24 August eligible dependency refresh

Every remaining direct dependency that was both release-age eligible and
compatible with the tested runtime graph was refreshed:

| Area             | Selected versions                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI               | Mantine core, dates, hooks, and notifications `9.5.1`; Tabler icons `3.46.0`                                                                                                       |
| Framework        | React Start `1.168.46`, Router `1.170.29`, Router devtools `1.167.1`, Vite `8.2.1`, and React plugin `6.0.5`                                                                       |
| Runtime and data | AWS S3 SDK `3.1111.0`, Better Auth `1.6.29`, Kysely `0.29.5`, pg `8.23.0`, and tsx `4.23.12`                                                                                       |
| Quality tooling  | Playwright `1.62.1`, Axe Playwright `4.13.0`, ESLint `10.8.1`, React Refresh lint `0.5.4`, globals `17.11.0`, Knip `6.32.2`, React Doctor `0.9.12`, and TypeScript ESLint `8.67.0` |
| Infrastructure   | AWS CDK library `2.265.0`, CDK CLI `2.1136.0`, CDK Nag `3.0.2`, and Constructs `10.8.1`                                                                                            |

Vite `8.2.1` now resolves PostCSS `8.5.26` and is the only PostCSS owner in the
installed graph. Because Vite itself requires `postcss@^8.5.25`, the former
`postcss@<8.5.23` security-floor override is no longer needed and has been
removed. The release-age and trust policies were not weakened, and the
refreshed graph has no peer dependency or audit findings.

The only packages still reported by `pnpm outdated` are the two deliberate
holds above: React Query and its devtools remain on `5.100.14`, while H3 and
Srvx remain on `2.0.1-rc.20` and `0.11.22` respectively.

pnpm `11.23.0` was published on 23 August 2026 at 14:56 UTC and remains in the
seven-day quarantine until 30 August 2026 at 14:56 UTC. Runtime provisioning
therefore remains on the validated pnpm `11.22.0` and Corepack `0.35.0` pair.

The final Node 26 production image also builds successfully. That validation
identified and repaired a pre-existing Docker context omission: both pnpm
install stages now copy the registered `patches/` directory before frozen
installation, and repository security verification guards that requirement.
