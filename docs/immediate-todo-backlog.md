# Immediate TODO Backlog

This is the current engineering backlog from the full repository review
refreshed on 29 July 2026 after merging:

- `8d23e9d` — `fix: enable production response compression (#28)`
- `ee2bfea` — `fix: harden financial value editing (#29)`

The previous 26 July review and its completed eleven-item programme are retained
in the [documentation archive](archive/README.md).

This file is an engineering review and implementation backlog. Product ideas
and work awaiting business decisions remain in
[product-backlog.md](product-backlog.md).

## Current execution status

| Item | Finding                                                                        | Priority        | Status                              |
| ---: | ------------------------------------------------------------------------------ | --------------- | ----------------------------------- |
|    1 | Production responses were not compressed                                       | Immediate       | Completed in PR 28                  |
|    2 | Financial values were persisted on every keystroke                             | Immediate       | Completed in PR 29                  |
|    3 | Hashed production assets have no repository-enforced cache policy              | High            | Completed in this change            |
|    4 | Project-setting mutations have inconsistent pending and failure UX             | High            | Pending                             |
|    5 | Accessibility and small-screen behavior need systematic verification           | High            | Pending                             |
|    6 | CI and deploy rebuild independently instead of promoting one attested artifact | Medium          | Pending                             |
|    7 | Runtime observability stops at structured journald output                      | Medium          | Pending                             |
|    8 | Framework dependency versions need coordinated lifecycle management            | Medium          | Pending                             |
|    9 | Several feature coordinators and schema modules remain oversized               | Medium          | Pending                             |
|   10 | Test breadth is strong, but UI and failure-path visibility remain selective    | Medium          | Pending                             |
|   11 | Client bundles pass but have limited remaining headroom                        | Medium/ongoing  | Pending                             |
|   12 | A few server paths still log raw exception objects                             | Medium/security | Pending                             |
|   13 | Production infrastructure resilience remains a low-cost baseline               | Deferred        | Pending after organisation AWS move |

## Recommended next sequence

1. Address Item 4 with a reusable mutation-feedback pattern and focused tests.
2. Combine Items 5 and 10 into one accessibility, responsive, and component
   test tranche.
3. Address Item 12 before expanding log collection under Item 7.
4. Design Items 6 and 7 together so artifact provenance, release identity,
   logs, metrics, and alerts share the same deployment metadata.
5. Perform Items 8, 9, and 11 as measured maintenance work rather than broad
   dependency or file-size rewrites.
6. Implement Item 13 only when the deployment moves to the organisation AWS
   account, unless staging becomes actively relied upon sooner.

# Completed review items

## Item 1 — Production responses were not compressed

### Original finding

The live server returned HTML, JavaScript, and CSS without
`Content-Encoding`, even when the client advertised `gzip, br`.

Observed uncompressed responses included approximately:

- login HTML: 17 KB
- main JavaScript: 252 KB
- CSS: 243 KB

The bundle gate measured gzip output, but the deployed nginx configuration did
not provide that compression benefit to users.

### Resolution

PR 28 added one managed nginx compression policy in
[projex-compression.conf](../deploy/nginx/projex-compression.conf):

- gzip enabled for HTML, JavaScript, CSS, JSON, XML, SVG, manifests, feeds, and
  related text formats
- `gzip_vary on`, producing `Vary: Accept-Encoding`
- compression level 6
- a 1,024-byte minimum that avoids spending CPU on very small responses
- proxied responses included in the policy

The same reviewed file is now installed by:

- fresh-host CDK bootstrap in
  [hostBootstrap.ts](../deploy/cdk/lib/hostBootstrap.ts)
- every release artifact
- the EC2 deployment path, which validates nginx syntax before completing
  activation

The bootstrap HTTP configuration, managed HTTPS template, and checked-in live
nginx example all declare that compression belongs to the sibling managed
configuration file. This avoids three drifting copies of the policy.

### Verification and regression protection

[verify-deploy-security.mjs](../scripts/verify-deploy-security.mjs) now:

- advertises `Accept-Encoding: gzip, br`
- requires `gzip` or `br` for deployed HTTPS HTML
- discovers same-origin JavaScript and CSS assets from the returned page
- requires accepted compression for both asset types
- requires `Vary: Accept-Encoding`
- permits a deliberate override for non-production/local verification

Regression tests cover compressed HTML, JavaScript, and CSS; missing
compression; missing `Vary`; invalid overrides; and non-HTTPS local behavior.
Repository-boundary and bootstrap tests require the managed nginx file to
remain installed and shipped.

This matches nginx's documented `gzip`, `gzip_types`, and `gzip_vary`
behavior:
[ngx_http_gzip_module](https://nginx.org/en/docs/http/ngx_http_gzip_module.html).

### Residual position

Dynamic gzip is the supported baseline. Brotli is not required for correctness
and should not be installed through an unverified third-party nginx module.
Precompressed Brotli or gzip can be reconsidered only after Item 3 establishes
the long-lived hashed-asset cache policy and measurements show a worthwhile
additional gain.

## Item 2 — Financial values were persisted on every keystroke

### Original finding

Budget allocation editing and transaction amount editing called their server
mutations directly from `NumberInput.onChange`.

That behavior was unsafe because Mantine represents valid editing states as
both numbers and strings. Empty input, a standalone minus sign, trailing
decimals such as `0.`, and other intermediate values could therefore be
converted into unintended numeric updates.

It also allowed:

- overlapping slow requests
- responses completing out of order
- a transaction editor closing when an earlier request completed while a newer
  edit was unresolved
- rejected values being difficult to recover or retry

Mantine documents the mixed `number | string` value contract in its
[NumberInput documentation](https://mantine.dev/core/number-input/).

### Resolution

PR 29 introduced the shared
[MoneyAmountEditor.tsx](../src/components/finance/MoneyAmountEditor.tsx) and
[moneyAmountDraft.ts](../src/components/finance/moneyAmountDraft.ts).

The editor now:

- keeps the entered value in local component state
- preserves Mantine's intermediate string values without converting them
- validates complete amounts to integer cents
- rejects incomplete input and more than two decimal places
- supports non-negative budgets while retaining valid negative transaction
  amounts
- saves only through an explicit Save action or Enter
- cancels and restores the persisted value through Cancel or Escape
- disables editing while the save is pending
- prevents a second write from the same editor while the first is unresolved
- keeps the editor and draft open when persistence fails
- exposes an accessible inline error and allows a retry
- closes an inline transaction editor only after successful persistence

The shared behavior is used by:

- budget allocation rows in [BudgetPanel.tsx](../src/components/BudgetPanel.tsx)
- transaction amount editing in
  [transactionTableColumns.tsx](../src/components/transactions/transactionTableColumns.tsx)
- project budget totals in
  [ProjectBudgetSummary.tsx](../src/components/budget/ProjectBudgetSummary.tsx)

### Mutation ordering

Budget and transaction update mutations now use stable project-scoped mutation
IDs from [mutationScopes.ts](../src/queries/mutationScopes.ts). TanStack Query
serializes mutations sharing a `scope.id`, so a later write cannot overtake an
earlier project mutation. This follows the documented
[TanStack Query mutation-scope behavior](https://tanstack.com/query/latest/docs/framework/react/guides/mutations#mutation-scopes).

The project scope is deliberately conservative. If measured queueing becomes a
real usability problem, the scope can be narrowed to a stable resource and
field identity, but ordering safety must not be removed.

### Verification and regression protection

Focused tests prove:

- typing does not persist
- Enter and Save persist the complete amount once
- incomplete values do not persist
- negative transaction amounts remain valid
- negative budgets are rejected
- a slow request disables the editor and prevents overlap
- a rejected request preserves the draft and editor
- retry after rejection succeeds
- the transaction table editor closes only after success
- requests with the same TanStack mutation scope execute in order even when
  the second would otherwise finish first

The merged change passed the complete application gate: 79 Vitest files and
373 tests, repository security checks, zero dependency advisories, formatting,
ESLint, strict TypeScript, Knip, selected-domain coverage, the production build,
and every client bundle budget.

## Item 3 — Enforce production caching for fingerprinted assets

### Finding

The repository now enforces compression, but its nginx configurations proxy all
application traffic through Node and do not express a cache policy for Vite's
content-hashed assets. The deployed-security verifier checks compression and
security headers but does not currently assert cache behavior.

The asset filenames are fingerprinted, so long-lived immutable caching is safe
for those files. HTML and data responses must remain independently
revalidatable so a deployment can advertise the new asset graph immediately.

This is a repository-enforcement gap rather than a confirmed claim that every
live asset lacks a cache header: the runtime may add one. The implementation
must first capture current live HTML, JavaScript, CSS, font, and image headers.

### Recommendation

- Establish one explicit policy for fingerprinted client assets, preferably
  `Cache-Control: public, max-age=31536000, immutable`.
- Keep HTML non-immutable and suitable for immediate revalidation.
- Do not apply immutable caching to API, auth, readiness, maintenance, or
  unhashed files.
- Decide whether nginx or the Node static handler owns the header; do not allow
  competing policies.
- Add `ETag` or `Last-Modified` assertions where revalidation is expected.
- Extend deployed-security tests to prove both sides of the boundary.
- Add an nginx syntax/bootstrap regression test for the cache configuration.
- Measure repeat-visit transferred bytes before and after the change.

### Acceptance criteria

- A deployed hashed JavaScript and CSS asset returns the approved immutable
  policy.
- `/login` and authenticated HTML do not return an immutable policy.
- APIs and maintenance responses retain their existing no-store or operational
  behavior.
- Fresh-host bootstrap and release deployment install the same reviewed policy.

### Live baseline captured before implementation

The public production origin was inspected on 29 July 2026 before changing the
policy:

- `/login` returned no `Cache-Control` header
- the current content-hashed JavaScript and CSS returned
  `public, max-age=31536000, immutable`
- `/favicon.svg`, the only referenced image, returned
  `public, max-age=3600`
- the current CSS did not reference external font or image files
- `/api/health`, `/api/ready`, and `/api/auth/get-session` returned no
  `Cache-Control` header
- `/api/session` returned `no-store`
- `/__maintenance.js` returned the nginx-owned no-store policy

The lowercase upstream asset header and direct runtime inspection confirmed
that [start-server.mjs](../scripts/start-server.mjs), not nginx, already owned
the proxied static-asset policy. The gap was narrower but still material: every
file below `/assets/` was treated as immutable without proving that it belonged
to Vite's fingerprinted output, HTML had no explicit revalidation policy, and
the deployed verifier did not protect either boundary.

### Resolution

The Node response layer is now the documented single owner of proxied
`Cache-Control` headers:

- Vite emits a client manifest during the production build
- the runtime derives an allowlist from manifest-backed filenames with Vite's
  eight-character content fingerprint
- only those JavaScript, CSS, font, and image assets receive
  `public, max-age=31536000, immutable`
- any other file under `/assets/` is immediately revalidatable with `no-cache`
- HTML receives `no-cache`, so every navigation revalidates the current asset
  graph and HTML is never immutable
- the unhashed favicon retains its existing one-hour non-immutable policy
- API and auth responses retain their application-defined behavior
- nginx continues to own only the explicit maintenance no-store responses and
  transparently preserves proxied application headers

The manifest and policy module are required by artifact creation and release
activation, so a partial artifact cannot be promoted. Fresh CDK hosts,
managed-HTTPS hosts, and existing hosts all execute the same policy through the
versioned `start-server.mjs` in the activated release; the three nginx variants
document and regression-test that ownership boundary.

### Verification and regression protection

[verify-deploy-security.mjs](../scripts/verify-deploy-security.mjs) now requires:

- exact immutable caching for the page's hashed JavaScript and CSS
- `no-cache` for HTML
- no immutable caching for the unhashed favicon, health, readiness, and auth
  responses
- `no-store` for the application session and maintenance endpoints
- the existing compression and security-header behavior

Focused tests cover the correct policy, missing and malformed immutable
headers, immutable HTML, immutable unhashed assets, unsafe API/auth/maintenance
caching, manifest filtering, CDK bootstrap, managed nginx variants, release
artifacts, and existing-host activation boundaries.

# Pending review items

## Item 4 — Standardize pending, success, and failure behavior for settings

### Finding

Financial editing now has deliberate persistence semantics, but project
settings still mix several interaction models.

In [ProjectSettingsPanel.tsx](../src/components/ProjectSettingsPanel.tsx),
project type, programme, currency, visibility, standards sync, and transfer
capability call `updateProject.mutate(...)` directly from select or switch
changes. These are complete values rather than intermediate financial strings,
so they do not share Item 2's data-conversion defect. The remaining problem is
user feedback and recovery:

- most fields have no local error message
- pending state is not consistently visible at field level
- some controls remain enabled while a related update is pending
- rapid changes share one mutation observer without an explicit ordering
  policy
- a rejected change can appear to snap back without explaining why
- successful auto-save is not consistently acknowledged

Other application areas use inline alerts or `showAppToast`, but there is no
single documented mutation-feedback contract.

### Recommendation

- Define a shared pattern for auto-save versus explicit-save controls.
- Use explicit Save for coupled or high-impact settings such as project type,
  programme relationship, and visibility.
- Auto-save simple independent switches only when pending, success, rollback,
  and failure states are clear.
- Disable only the field or related field group being persisted.
- Serialize writes by stable project and setting identity where rapid writes
  remain possible.
- Preserve the last confirmed value and display a retryable error.
- Ensure toasts complement rather than replace field-associated accessible
  errors.
- Add focused tests for slow, rejected, retried, and deliberately out-of-order
  updates.

## Item 5 — Systematically verify accessibility and small-screen usability

### Finding

The UI has a consistent Mantine design system, global focus-visible styling,
many accessible labels, responsive navigation, and keyboard coverage in the
browser workflows. Those are strong foundations.

The remaining review gap is systematic evidence:

- there is no automated accessibility scanner in the test dependencies
- dense budget, transaction, taxonomy, and membership tables remain
  desktop-first
- the wider explicit-save money editor increases the minimum horizontal space
  needed by financial tables
- browser smoke validates workflows but is not a WCAG audit
- modal focus order, focus restoration, live status announcements, contrast,
  zoom, and reduced-motion behavior are not enforced as regression gates
- responsive behavior is not exercised across a defined viewport matrix

### Recommendation

- Add automated accessibility checks to representative Playwright pages using
  an established axe integration or equivalent.
- Test login, company dashboard, project workspace, transaction editing,
  import review, and nested modal paths.
- Add keyboard-only assertions for opening, saving, cancelling, error recovery,
  and returning focus to the trigger.
- Add 320/390 px, tablet, and desktop viewport coverage for critical paths.
- Decide explicitly whether dense tables use responsive cards or deliberate
  horizontal scrolling with sticky identifying/action columns.
- Ensure pending and success messages use appropriate live-region semantics.
- Record any accepted third-party table limitations with narrow regression
  tests rather than broad exclusions.

## Item 6 — Promote one verified artifact and add provenance

### Finding

The current delivery design is secure and substantially hardened:

- GitHub actions are SHA-pinned
- EC2 deployment is restricted to protected `main`
- OIDC replaces static AWS keys
- source SHA and physical release identity are immutable
- release manifests and SHA-256 checks are verified across GitHub, S3, and EC2
- extraction and activation are atomic
- failed readiness restores the previous compatible application

CI and the manual deploy workflow still install, build, and verify
independently. The deploy workflow protects itself by rerunning application,
CDK, database, server-smoke, and Chromium browser gates before packaging, but
that means:

- CI and deployment spend substantial duplicate time and compute
- the artifact verified in CI is not the artifact later promoted
- provenance is represented by internal manifests and checksums but not a
  signed GitHub artifact attestation
- no software bill of materials is retained with a release

### Recommendation

- Design a protected-main release workflow that builds the deploy artifact
  once from the immutable SHA after required CI succeeds.
- Retain the existing manifest and checksum validation.
- Add GitHub artifact attestation or an equivalent signed provenance record.
- Generate and retain an SBOM for the deployed production dependency graph.
- Promote the exact verified artifact to staging and later production rather
  than rebuilding it.
- Preserve explicit environment approvals and environment-specific OIDC roles.
- Keep a manual rebuild path for recovery, but label and audit it distinctly.
- Add a controlled manual rollback workflow that selects only a retained,
  manifest-verified, schema-compatible release.

## Item 7 — Add operational metrics, retention, and alerts

### Finding

API routes and server functions emit request IDs and structured logs, while
systemd sends stdout and stderr to journald. Health, readiness, smoke, and
deployed-security verification are comprehensive.

The production operating model still depends on manually opening an SSM
session and reading `journalctl`. The repository does not define:

- centralized application-log collection and retention
- alerting for repeated 5xx responses, auth failure spikes, readiness failure,
  process restarts, disk pressure, or database saturation
- dashboards for request latency, deploy version, export-job failures, or email
  delivery failures
- an explicit RTO/RPO and disaster-recovery exercise

### Recommendation

- Add the deployed release ID and source SHA to every structured runtime log.
- Forward structured journald output to a retained searchable destination.
- Define privacy-aware retention and prevent user-entered financial text,
  credentials, cookies, tokens, and email contents from entering logs.
- Add health/readiness, systemd restart, EC2, disk, RDS, and application-error
  alarms.
- Correlate deploy annotations, request IDs, export jobs, and email provider
  events.
- Write and test a minimal incident and database-restore runbook.
- Establish explicit RTO/RPO targets before selecting production backup and
  Multi-AZ settings under Item 13.

## Item 8 — Manage framework dependencies as tested cohorts

### Finding

The dependency policy is strong: frozen lockfile, a seven-day release-age
delay, no-downgrade trust policy, explicit build-script allowlisting, audit
gates, and documented overrides.

The TanStack declarations currently span different versions:

- `@tanstack/react-start` — `^1.168.13`
- `@tanstack/react-router` — `^1.170.8`
- `@tanstack/react-router-devtools` — `^1.167.0`

The lockfile also resolves related internal plugin packages across several
nearby versions. This is not a demonstrated runtime defect, but it makes
compatibility intent harder to review because TanStack Start is powered by
TanStack Router and remains a release-candidate framework. See the official
[TanStack Start overview](https://tanstack.com/start/latest/docs/framework/react/overview).

The repository also intentionally retains the known-good `h3-v2` release
candidate alias because a direct upstream move regressed SSR login smoke.
Several deprecated transitive packages remain in the lockfile and should be
traced to their owning dependency before action.

### Recommendation

- Treat TanStack Start, Router, router devtools, Vite integration, `srvx`, and
  `h3` as one compatibility cohort.
- Record the exact supported cohort rather than relying on independently moving
  caret ranges.
- Upgrade the cohort in a dedicated pull request with full SSR, auth, browser,
  bundle, and deploy-artifact verification.
- Use `pnpm why` to assign deprecated transitives to direct owners; do not add
  suppressions or arbitrary overrides.
- Keep the `h3-v2` compatibility note and smoke reproduction until an upstream
  version demonstrably replaces it.
- Review package release notes before Node 26 or another framework-runtime
  transition.

## Item 9 — Continue responsibility-based decomposition

### Finding

The earlier maintainability tranche removed the circular dependency, split
response schemas, extracted major views and workflow services, removed
duplicate migration wrappers, and established regression boundaries. The
architecture is materially healthier.

Current production hotspots still include:

- `CompanyDefaultTaxonomyModal.tsx` — approximately 984 lines
- `CompanySummaryPanel.tsx` — approximately 945 lines
- `ProjectWorkspace.tsx` — approximately 895 lines
- `CompanyDashboardPage.tsx` — approximately 847 lines
- `transactions/importServers.ts` — approximately 819 lines
- `transactions/importPreviewCommit.ts` — approximately 814 lines
- `validation/apiSchemas.ts` — approximately 802 lines
- `BudgetPanel.tsx` — approximately 788 lines
- `taxonomy/companyDefaultServers.ts` — approximately 778 lines
- `taxonomy/projectCrud.ts` — approximately 771 lines
- `TaxonomyManagerModal.tsx` — approximately 763 lines
- `PowerBiImporterPanel.tsx` — approximately 750 lines
- `TransactionsPanel.tsx` — approximately 736 lines
- `api/types.ts` — approximately 720 lines

Line count alone is not a defect. The risk is that some of these files still
combine data acquisition, permission decisions, mutation orchestration,
derived models, modal state, and presentation.

### Recommendation

- Prioritize files where one change routinely touches unrelated concerns.
- Extract pure derivation models and mutation controllers before extracting
  presentational fragments.
- Keep route/page coordinators responsible for access, loader/query state, and
  navigation, not full feature presentation.
- Continue splitting API schemas and types by transport/domain ownership while
  preserving shared primitive boundaries.
- Keep server transaction boundaries in one visible orchestration layer; do not
  fragment atomic business operations into opaque helpers.
- Add boundary or focused tests with each extraction.
- Avoid arbitrary maximum-line rules that encourage cosmetic file splitting.

Suggested next candidates:

1. Company-default taxonomy editing and destructive action orchestration.
2. Company summary derivation versus dashboard presentation.
3. Project settings mutation and confirmation orchestration.
4. Remaining import preview commit phases.
5. The residual API schema/type modules.

## Item 10 — Expand risk-based test visibility

### Finding

The verification system is a major strength:

- 79 Vitest files and 373 passing application tests in the latest gate
- 24 database-integration files
- fresh migration and generated-type verification
- four isolated Playwright Test workflow specs
- Chromium and Firefox browser smoke in CI
- deploy-script, CDK assertion, ShellCheck, actionlint, security, dead-code, and
  bundle gates
- selected-domain coverage clearly labelled rather than represented as
  whole-repository coverage

The remaining visibility gaps are concentrated rather than broad:

- only eight current `.component.test.tsx` files
- project settings auto-save and error recovery are not component-tested
- accessibility and viewport behavior are not automated
- production cache behavior is not asserted
- raw logging boundaries do not have a regression test
- the selected-domain coverage allowlist intentionally excludes most
  components, queries, and server orchestration

### Recommendation

- Add tests as part of Items 3, 4, 5, and 12 rather than creating a detached
  percentage campaign.
- Expand component tests around high-state UI: project settings, membership
  changes, taxonomy destructive actions, transaction comments, and import
  failure recovery.
- Add accessibility and responsive Playwright projects without duplicating the
  entire functional browser suite at every viewport.
- Add mutation-controller tests for slow and reordered responses.
- Preserve the selected-domain label; expand the allowlist only for modules
  where coverage produces meaningful decision visibility.
- Keep database integration focused on constraints, concurrency, migration
  compatibility, and multi-step transaction boundaries.

## Item 11 — Protect bundle headroom and measure user performance

### Finding

All current bundle budgets pass. The latest measured first-load closures were:

| Target                                  |        Current |  Budget |
| --------------------------------------- | -------------: | ------: |
| Root JavaScript                         | 139.9 KiB gzip | 160 KiB |
| Root CSS                                |  36.2 KiB gzip |  45 KiB |
| Company dashboard JavaScript            | 322.4 KiB gzip | 345 KiB |
| Project workspace JavaScript            | 346.0 KiB gzip | 370 KiB |
| Company post-root navigation JavaScript | 182.5 KiB gzip | 200 KiB |
| Project post-root navigation JavaScript | 206.1 KiB gzip | 225 KiB |

The earlier chunk refactor delivered substantial improvement and now budgets
direct routes, navigation payloads, and lazy feature panels. The remaining
headroom is roughly 6–13 percent across the primary JavaScript budgets, so a
single large dependency can consume it quickly.

Bundle bytes also do not directly measure parse/execute time, responsiveness,
or repeat visits.

### Recommendation

- Keep existing budgets fixed unless a reviewed user benefit justifies a
  measured increase.
- Upload a concise per-PR bundle diff artifact.
- Investigate remaining shared root/runtime and CSS weight before adding
  another UI framework or editor dependency.
- Combine Item 3 cache measurements with cold and repeat navigation tests.
- Add a small real-browser performance baseline for login and project
  workspace, including LCP and interaction latency, without turning variable
  lab metrics into flaky merge blockers.
- Prefer structural lazy-loading and dependency removal over manual chunk rules
  that create cycles or unstable filenames.

## Item 12 — Route all production exceptions through structured sanitization

### Finding

The main HTTP and server-function error boundaries return generic unexpected
errors to clients and write request-ID-correlated structured logs. That is the
correct baseline.

A few production paths still bypass it and pass raw exception objects directly
to `console.error` or `console.warn`, notably:

- BetterAuth session resolution in
  [betterAuth.ts](../src/server/auth/betterAuth.ts)
- assignment-email failure in
  [transactionComments.ts](../src/server/fns/transactionComments.ts)

Raw provider, database, or HTTP exceptions can contain more context than the
operator needs and produce log shapes that are difficult to search. This is a
defence-in-depth and consistency issue; no tracked secret exposure was found.

### Recommendation

- Add one server logging helper for sanitized exceptions, request IDs, stable
  event names, and approved metadata.
- Never log request headers, cookies, authorization values, connection URLs,
  email bodies, reset links, or imported financial text.
- Replace raw production exception logging with that helper.
- Keep CLI errors separate where direct terminal output is intentional, but
  avoid printing secrets there as well.
- Add tests that pass adversarial error objects and prove sensitive fields are
  not serialized.
- Complete this before forwarding logs to a centralized destination under
  Item 7.

## Item 13 — Raise infrastructure resilience after the organisation AWS move

### Finding

The current AWS stack is an intentionally low-cost, secure baseline:

- private encrypted RDS
- encrypted non-public S3
- SSM rather than SSH
- IMDSv2
- restricted OIDC deployment roles
- retained and deletion-protected production database resources
- tested CDK security assertions

Defaults still favor cost over production resilience:

- one-day backup retention unless overridden
- Single-AZ unless overridden
- no default storage autoscaling
- no repository-defined CloudWatch alarms
- no enhanced monitoring or database log exports
- no tested disaster-recovery restoration exercise

### Recommendation

Defer material implementation until the application moves to the organisation
AWS account, as previously decided. Before that move:

- define production RTO and RPO
- choose backup retention and restore-testing cadence
- enable Multi-AZ according to the approved availability requirement
- set storage autoscaling limits
- add EC2, systemd, disk, RDS, readiness, and application-error alarms
- define log retention, database log exports, and privacy boundaries
- test a database restore and full application recovery
- document DNS, certificate, bootstrap-superadmin, email, and rollback steps as
  one fresh-environment exercise

# Full repository review

## Executive assessment

| Area                  | Assessment               | Current position                                                                                       |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Architecture          | Strong                   | Clear client/server and transport boundaries; several large coordinators remain                        |
| Financial correctness | Strong                   | Server-owned decisions, integer cents, DB constraints, and explicit financial saves                    |
| Type and code quality | Strong                   | Strict TypeScript, no application `any`, lint, formatting, Knip, and boundary tests                    |
| Security              | Strong                   | Central authorization, CSP, exact origins, TLS, invite-only auth, hosted scanning, and hardened deploy |
| CI                    | Strong                   | Five protected lanes, pinned actions, DB/CDK/static/browser coverage                                   |
| Deployment            | Strong                   | OIDC, immutable releases, atomic activation, rollback, constrained host identities, and compression    |
| Testing               | Strong                   | Broad unit/integration/smoke coverage; selective component, accessibility, and viewport evidence       |
| Client performance    | Good                     | All route and panel budgets pass; headroom and repeat-visit caching need attention                     |
| UI and usability      | Good                     | Consistent design and accessible foundations; dense mobile workflows and mutation feedback need work   |
| Operations            | Functional               | Excellent runbooks and health gates; centralized telemetry, alerts, and DR exercises remain            |
| Infrastructure        | Secure low-cost baseline | Higher availability is deferred until the organisation AWS move                                        |
| Documentation         | Strong                   | Current and historical reviews now have separate sources of truth                                      |

## Architecture and boundaries

Strengths:

- TanStack Start server functions are exposed through explicit bridge modules.
- Browser-compilable code cannot import arbitrary server infrastructure.
- API routes remain transport-focused and delegate to server adapters.
- Validation and response contracts are centralized and tested.
- Authorization is server-owned and scoped to company/project resources.
- Migration, transaction, reversal, import-preview, and audit invariants are
  enforced below the UI.
- Hydration behavior remains centralized in `useIsHydrated`.

Remaining work:

- complete the responsibility-based decompositions in Item 9
- keep the TanStack runtime cohort aligned under Item 8
- retain direct boundary tests whenever a new server/client bridge is added

## Security and privacy

Strengths:

- no tracked credentials, environment files, certificates, or private keys
  were identified
- dependency audit is clean
- GitHub secret scanning, push protection, Dependabot, and CodeQL are enabled
- public sign-up is disabled; trusted provisioning is server-only
- session, company, project, and workflow authorization are centralized
- exact-origin enforcement, HTTPS validation, PostgreSQL certificate
  verification, CSP, rate limiting, and request-size controls are present
- deploy access uses environment-scoped GitHub OIDC
- the runtime and deployment users are constrained independently
- HTML email escaping is shared and regression-tested

Residual risks and actions:

- complete raw log sanitization in Item 12
- retain the documented Mantine `style-src 'unsafe-inline'` residual risk
- reassess CSP only when the UI stack can remove runtime inline styles
- add accessibility security/privacy checks for information exposure at narrow
  viewports

## Database and financial integrity

Strengths:

- money is represented as integer cents at application boundaries
- financial import previews and workflow decisions are server-owned
- database constraints, row/advisory locks, optimistic workflow versions, and
  transaction boundaries protect concurrent work
- migrations are forward-only with explicit `N`/`N-1` compatibility
- deploy regression tests prove migration-bearing readiness rollback
- generated Kysely types are checked against migrated schemas
- reversal provenance and audit history are extensively tested

Remaining work:

- retain Item 2's explicit draft-and-save pattern for all future financial
  inputs
- do not widen mutation scopes or add optimistic financial writes without
  concurrency tests
- keep destructive schema contracts delayed until the previous release is no
  longer a rollback candidate

## CI, deploy, and supply chain

Strengths:

- required application, database, CDK/static, server-smoke, and dual-browser
  lanes
- immutable action SHAs
- frozen pnpm lockfile and delayed dependency adoption
- OIDC-only AWS deployment
- immutable source and physical release identities
- manifest/checksum verification at every artifact handoff
- archive traversal protection, atomic activation, safe pruning, and readiness
  rollback
- nginx, systemd, runtime-user, and IMDSv2 hardening

Remaining work:

- promote one attested artifact under Item 6
- manage framework dependencies as a cohort under Item 8
- add production telemetry and alerts under Item 7

## Testing and verification

Strengths:

- unit, component, database, deploy-script, CDK, smoke, and browser layers
- Chromium and Firefox coverage
- isolated generated fixtures and Playwright page objects
- selected-domain coverage is honestly labelled
- bundle budgets walk route and dependency closures
- ShellCheck and actionlint run in CI

Remaining work:

- risk-based component and failure-path tests in Item 10
- accessibility and viewport projects in Item 5
- cache-header and log-sanitization regression tests in Items 3 and 12

## Client performance and chunking

Strengths:

- root, authenticated routes, navigation payloads, and deferred panels have
  separate budgets
- heavy panels load only when their tabs are selected
- response contracts and feature modules have narrower client boundaries
- production compression is enforced

Remaining work:

- immutable repeat-visit caching in Item 3
- preserve budget headroom and add user-performance measurements in Item 11
- treat Brotli as an optional measured optimization, not a required package
  installation

## UI design and usability

Strengths:

- consistent Mantine surfaces, spacing, badges, tables, modals, and feedback
- a shared visible focus treatment
- responsive application navigation
- accessible names on most icon-only controls
- explicit destructive confirmations
- improved financial-editing recovery and keyboard actions

Remaining work:

- standard mutation feedback under Item 4
- mobile table and modal behavior under Item 5
- automated accessibility evidence, focus restoration, and status
  announcements
- maintain clear read-only and permission-denied states after hydration

## Documentation and repository hygiene

Strengths:

- README, contributing guidance, deployment, migration, email, permission,
  architecture, and staging sources of truth are extensive
- proprietary licensing is explicit
- repository security checks prevent earlier documentation and workflow drift
- the old completed review is now archived rather than mixed with current work

Ongoing rule:

- update this file when a current review item changes state
- move completed review generations to the archive when a new full review
  supersedes them
- keep product ideas in `product-backlog.md`
- keep operational procedures in their existing runbooks instead of copying
  them into the backlog

## Review evidence

The review used the repository at merged commit `ee2bfea` and the latest
successful application verification associated with PR 29:

- `pnpm run verify:app` passed
- 79 Vitest files / 373 tests passed
- selected-domain coverage passed at 99.18 percent lines
- repository security checks and dependency audit passed with zero advisories
- formatting, ESLint, strict TypeScript, and Knip passed
- production client and server builds passed
- all root, authenticated-route, navigation, and deferred-panel bundle budgets
  passed
- the worktree was clean before this documentation update

This review did not claim that the deferred infrastructure improvements are
already present, nor that selected-domain coverage represents whole-repository
coverage.
