# Full repository review — 31 July 2026

## Executive assessment

The repository is in a strong, production-oriented state. Its most mature
areas are authorization, database-backed integration testing, deploy identity
and artifact integrity, browser smoke coverage, supply-chain controls, and
explicit bundle budgets. The architecture consistently treats the browser as
untrusted: route guards improve navigation UX, while server functions and API
routes independently resolve a verified session and enforce resource-scoped
authorization.

No release-blocking correctness or authentication vulnerability was found in
this review. The remaining work is principally performance maintenance,
stricter compiler adoption, dependency lifecycle evidence, and incremental
movement of client-side orchestration into router/query primitives.

### Priority summary

| Priority     | Recommendation                                                         | Rationale                                                                                                  |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| High         | Move the single-company redirect into route loading                    | Avoid an avoidable hydrated landing-page paint and client redirect                                         |
| High/ongoing | Preserve and tighten route/panel bundle budgets                        | Current authenticated bundles have deliberately limited headroom                                           |
| Medium       | Migrate export polling and modal reads to TanStack Query               | Gain cancellation, deduplication, cache ownership, retry policy, and fewer hand-written effects            |
| Medium       | Burn down the opt-in strict TypeScript lane                            | Promote `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` without destabilizing the release gate |
| Medium       | Establish a repeatable dependency freshness report                     | The framework cohort is controlled, but all direct packages need recorded upgrade decisions                |
| Medium       | Consolidate repeated period aggregates in `ProjectWorkspace`           | Four reductions over the same collection can be one typed accumulator                                      |
| Low          | Raise emitted-language targets only from runtime/browserslist evidence | `ES2026` is not currently a TypeScript target contract; avoid a cosmetic target change                     |

## Scope and method

The review covered application and server source, generated route boundaries,
configuration, package and lock policy, tests, database migrations, scripts,
Docker/systemd/nginx/CDK deployment, GitHub Actions, security documentation,
architecture records, and the current engineering/product backlogs.

Evidence gathered locally included:

- repository inventory and largest-source review;
- all `useEffect`, `lazy`, collection traversal, authorization, route-loader,
  and server-function call sites;
- TypeScript/Vite/pnpm/framework-cohort configuration;
- CI, release, deploy, infrastructure, runtime-hardening, and operational
  documentation;
- the repository security verifier, audit, format, lint, typecheck, dead-code,
  unit/component tests, selected-domain coverage, build, and bundle gates.

The React Doctor playbook and npm registry freshness query were also attempted.
Both external services were unavailable from the review environment, so this
document does not invent a Doctor score or claim that registry versions are
current. Package upgrades must be verified again in a network-enabled CI or
developer environment.

## Architecture, SSR, routing, and API boundaries

### Strengths

- TanStack Start owns the SSR/Vite integration, while file routes express
  authenticated layouts, loaders, API handlers, and errors rather than a
  parallel custom routing layer.
- Authenticated loaders prefetch session and resource data into the shared
  QueryClient. The browser therefore hydrates from server-resolved state
  instead of universally fetching after mount.
- API route context resolves a server-owned request context and session.
  Server functions use shared guards and authorization helpers rather than
  accepting a caller-supplied user identity as proof.
- Response schemas are split by feature and validated at trust boundaries.
  Generated route output is correctly treated as generated source.
- Dynamic imports already defer developer tools, company summary/settings,
  and project transactions/import/settings panels. Intent preloading is a
  sensible default for the authenticated application.

### Improvements

1. **Remove the post-hydration single-company redirect.** The companies route
   already loads the verified session, memberships, companies, and current
   user. Determine the sole allowed/default company there and return a router
   redirect before rendering. The current `LandingPage` effect necessarily
   paints the landing state, runs an additional server call, then navigates.
   Preserve a client fallback only if data can genuinely change after loader
   completion.
2. **Prefer query primitives for server state.** `CompanyExportPanel` manually
   fetches, polls, retries, cancels, and stores a job; the reversal modal also
   fetches suggestions in an effect. Model these as keyed queries with
   `enabled`, `refetchInterval`, and explicit retry/stale policies. Keep an
   effect only for the true external side effect of initiating a download.
3. **Do not add a general client API layer.** Existing typed query options,
   response schemas, server functions, and narrow API endpoints are the right
   boundaries. Consolidate only repeated transport/error decoding where it
   has identical semantics.
4. **Keep browser identity out of authorization decisions.** Some query keys
   accept `userId` for cache partitioning and compatibility. Continue proving
   that every server read/mutation derives the effective user from the
   verified request session and treats any input ID as non-authoritative.

## React rendering, effects, and data traversal

The production application has a small effect footprint for its size. Most
effects synchronize with timers, navigation, browser downloads, or remote
state and are therefore legitimate. There is no evidence of effects being
used broadly to derive render-only values; derived collections are normally
computed directly or memoized.

### Specific opportunities

- Replace the landing redirect effect as described above; this is the clearest
  unnecessary extra-paint path.
- Replace manual export and suggestion fetching effects with TanStack Query.
  Query cancellation should use the provided `AbortSignal`, rather than only
  suppressing state updates with a local `cancelled` boolean.
- Retain the transaction-search cleanup effect: clearing a pending timer on
  unmount is external-resource cleanup, not redundant derived state.
- Retain URL synchronization and settings synchronization until their ownership
  can move to route search parameters or controlled component boundaries; do
  not delete them merely to reduce an effect count.
- Combine the four reductions of `visiblePeriods` in `ProjectWorkspace` into
  one accumulator producing uncoded count/amount and pending reversal
  count/amount. This is a low-risk improvement that makes aggregate semantics
  atomic and avoids four traversals on every relevant recomputation.
- The chained filters/maps used for UI option construction are generally
  readable and operate on bounded administrative collections. Do not replace
  them with harder-to-read loops without profiling. For large import previews,
  compute related row partitions/counts in one memoized pass when the same row
  set is currently filtered repeatedly.
- Continue decomposing coordinators by responsibility, not arbitrary line
  count. `SmokeDashboardPage` is test tooling and lower priority; production
  coordinators should remain focused on data/permission/navigation ownership
  while heavy panels remain deferred.

## Lazy loading and bundle strategy

Current code splitting is well placed: route modules are handled by the
framework, developer tooling is development-only, and heavy authenticated tab
panels are lazy. The bundle verifier measures direct route graphs and
post-root/deferred navigation payloads, which is substantially stronger than a
single Rollup chunk-size warning.

Recommended next steps:

1. Record bundle reports as CI artifacts and trend gzip bytes by route and
   deferred panel. Fail on regression, not on an aspirational number detached
   from user flows.
2. Profile parse/evaluation and interaction latency before adding manual
   chunks. The existing React vendor chunk is stable and cache-friendly; broad
   vendor chunking can create waterfalls and should not be added by package
   name alone.
3. Consider deferring table-heavy code on the companies landing page and
   taxonomy/import editor modals only if the route graph report shows they are
   in the initial payload and real-user or browser traces show a material win.
4. Keep `Suspense` fallbacks stable in size and accessible so deferred panels
   do not introduce layout shift or ambiguous loading states.

## Authentication and authorization

### Current posture

- Public email/password signup is disabled; a separate server-only BetterAuth
  instance performs trusted provisioning and is not mounted as an HTTP handler.
- Sessions are resolved from request headers, normalized to a minimal internal
  type, checked against an active application user, and never recovered from a
  client assertion.
- Company/project roles and financial mutation scopes are enforced server-side
  and have direct database integration coverage, including cross-tenant
  negative cases.
- Same-origin/trusted-origin handling, credentialed CORS, CSP/security headers,
  rate limits, sanitized logs, invite/password email escaping, and no-store
  session responses are regression tested.
- Deployment uses protected GitHub environments, OIDC, SHA-pinned actions,
  attested artifacts, checksum verification, constrained SSM, atomic release
  activation, IMDSv2, and hardened runtime identities.

### Professional hardening follow-ups

1. Add explicit automated tests for session expiry, cookie attributes in the
   production HTTPS configuration, password-reset replay/expiry, credential
   rotation, and logout invalidation if they are not already asserted at the
   raw-header/database level.
2. Document a recurring access review: global superadmins, company admins,
   GitHub environment reviewers, AWS deploy roles, and dormant accounts.
3. Keep destructive operations transactionally audited and require recent
   authentication for future unusually sensitive account/security changes.
4. Treat framework auth plugins as a coordinated security upgrade. Re-run the
   entire auth boundary, DB integration, smoke, and deployed-header suites for
   every BetterAuth/TanStack cohort change.
5. Do not weaken server enforcement because route `beforeLoad` redirects appear
   to protect a screen; those redirects are navigation UX only.

## TypeScript, ECMAScript level, and dependencies

### ECMAScript recommendation

The browser config targets `ES2022`; Node-side code targets `ES2023` while the
supported runtime is Node 24. Raising targets can reduce transforms, but target
selection must reflect the oldest supported browser/runtime and measured
output—not the calendar year.

The repository now pins TypeScript 6.0.3. TypeScript 6 defines a stable
`ES2025` compiler target/library contract, but it does not define `ES2026`.
Therefore:

- do **not** label the project `ES2026` by substituting `ESNext`; `ESNext`
  deliberately moves over time and weakens reproducibility;
- evaluate `ES2025` for Node 24 code separately, with build/test/deploy
  verification;
- keep the browser target at `ES2022` until an explicit browser support policy
  and Vite compatibility build prove a newer baseline is safe;
- revisit a named `ES2026` target only after the installed TypeScript version
  supports it and every production runtime in the support matrix implements
  the required features.

Add a non-blocking strictness project/configuration and burn down findings for
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, then promote each
flag to the main configs independently. Keep `skipLibCheck` only as a measured
build-time/framework compatibility decision.

### Dependency lifecycle

The repository has unusually strong supply-chain defaults: frozen lockfiles,
minimum release age, trust downgrade protection, exotic dependency blocking,
an allowlist for lifecycle builds, patches/overrides with documentation,
Dependabot, `pnpm audit`, SBOM generation, and a tested TanStack/Vite runtime
cohort.

Recommended process:

1. In network-enabled CI, generate a machine-readable `pnpm outdated` report
   on a schedule and open grouped changes for: framework cohort, React/Mantine,
   database/auth, AWS/CDK, and development tooling.
2. Record for every held direct dependency: installed version, eligible version
   after the seven-day policy, reason held, upstream issue/advisory, owner, and
   revisit date. Never upgrade the TanStack/Vite/H3/Srvx group one package at a
   time without regenerating and verifying the cohort.
3. Prioritize security and patch releases, then minors. Treat major releases as
   migrations with release notes, codemods where official, and full CI/smoke
   evidence.
4. Remove overrides only after the resolved graph proves the vulnerable range
   cannot return. Preserve the local `brace-expansion` patch until its exact
   compatibility/security reason is no longer applicable.

## Database, correctness, and performance

- Kysely, generated DB types, ordered SQL migrations, disposable Postgres,
  upgrade testing, transaction boundaries, audit records, and resource guards
  form a strong persistence layer.
- Continue requiring expand/migrate/contract compatibility with the immediately
  previous deployable application because application rollback does not roll
  back schema.
- Keep pagination and aggregate operations in SQL. Avoid moving transaction or
  import datasets into browser memory for convenient filtering.
- The transaction query profile script and documented query profile are the
  right basis for index changes. Require `EXPLAIN (ANALYZE, BUFFERS)` evidence
  with representative cardinality before adding redundant indexes.
- For bulk/import paths, prefer one validation/indexing pass and maps/sets for
  repeated lookup. Preserve deterministic ordering and all-or-nothing database
  semantics when consolidating traversals.

## Testing, CI, release, and operations

### Strengths

- The SDLC includes format, lint, strict typecheck, dead-code analysis,
  security/audit, selected-domain coverage, build/bundle budgets, database
  migration/type/integration gates, CDK synthesis/security assertions,
  ShellCheck/actionlint, server smoke, and Chromium/Firefox Playwright suites.
- CI permissions are minimal and actions are immutable-SHA pinned. Release and
  deployment separate verification, attestation, environment approval, and
  activation.
- Disposable fixtures and page objects provide repeatable isolation; failure
  artifacts are retained.

### Gaps and recommendations

1. Selected-domain coverage is honestly named but is not whole-repository
   coverage. Add periodic whole-repo coverage reporting (initially non-blocking)
   so unmeasured feature areas remain visible; retain risk-based thresholds for
   security, authorization, validation, and financial workflows.
2. Add mutation-testing or focused fault-injection sampling for authorization,
   money, migration, and deploy scripts. Line coverage alone cannot demonstrate
   that negative controls fail closed.
3. Measure hydration warnings, route-level Web Vitals, and accessibility in the
   browser lane. Keep visual/small-screen work in the product backlog, but make
   semantic accessibility regressions an engineering gate.
4. Preserve release provenance/SBOM attestations and periodically rehearse
   restore, rollback, certificate renewal, database recovery, and compromised
   deploy-credential response—not only successful deployment.
5. Infrastructure resilience remains a conscious product/organisation decision.
   Before production growth, define RPO/RTO, alarm ownership, backup restore
   evidence, multi-AZ requirements, log retention/export, and incident runbooks.

## Recommended delivery sequence

1. Move the single-company redirect to route loading and add an SSR/browser
   regression proving that the landing UI is not painted first.
2. Consolidate the `visiblePeriods` aggregates and add a pure-model unit test.
3. Convert export job reads/polling to TanStack Query; then convert reversal
   suggestions using the same cancellation/error conventions.
4. Add the non-blocking TypeScript strictness and whole-repo coverage reports.
5. Run the network-enabled dependency freshness/cohort review and document
   upgrade/hold decisions.
6. Continue bundle and browser-performance maintenance using measured route
   budgets and traces.

## Definition of done for follow-up changes

Every follow-up should include focused regression tests, `verify:app`, relevant
database/CDK/smoke lanes, bundle comparison for client-visible changes, updated
documentation, and an explicit security/rollback statement. Authentication,
authorization, migration, or deployment changes require the full corresponding
integration and negative-path suites; no UI guard may substitute for a server
control.
