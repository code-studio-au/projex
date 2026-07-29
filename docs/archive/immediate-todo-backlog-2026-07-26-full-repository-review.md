# Immediate TODO Backlog

This backlog preserves the full repository review completed on 26 July 2026.
The review is retained as the evidence and recommendation baseline even after
individual items are completed.

## Execution status

- **Item 1 — GitHub hosted controls:** Completed 26 July 2026.
- **Item 2 — Deploy release identity:** Completed 26 July 2026.
- **Item 3 — AWS deploy access via OIDC:** Completed 27 July 2026.
- **Item 4 — On-host and runtime privileges:** Completed 28 July 2026.
- **Item 5 — Migration rollback compatibility:** Completed 28 July 2026.
- **Item 6 — Invite-only authentication:** Completed 28 July 2026.
- **Item 7 — Testing review:** Completed 28 July 2026.
- **Item 8 — Bundle and chunk review:** Completed 28 July 2026.
- **Item 9 — Structure and maintainability:** Completed 28 July 2026.
- **Item 10 — Documentation and repository hygiene:** Completed 28 July 2026.
- **Item 11 — Browser test isolation and CodeQL follow-up:** Completed
  28 July 2026.
- **Infrastructure and operational resilience:** Deferred until the application
  moves to the organisation AWS account.

Item 1 completion retained the original review below as a point-in-time record
and applied these controls:

- `main` requires all five CI jobs, an up-to-date branch, a pull request,
  resolved conversations, linear history, and the same enforcement for
  administrators; force pushes and deletions remain disabled.
- Required approval count is zero while the repository has only one
  collaborator, avoiding an unmergeable self-approval requirement. Stale
  reviews are dismissed so an approval can be required safely when a second
  reviewer is available.
- `staging` and `production` require owner approval, accept deployments only
  from protected branches, and disallow administrator bypass.
- GitHub Actions accepts GitHub-owned actions plus only the pnpm setup and AWS
  credential action families, with immutable SHA pinning required.
- Dependabot vulnerability alerts and security updates, secret scanning, and
  push protection are enabled.
- GitHub CodeQL default setup analyzes JavaScript and TypeScript on pull
  requests, changes to `main`, and a weekly schedule.
- The first CodeQL analysis exposed two clear-text logging paths in the
  BetterAuth linking utility; the Item 1 source changes remove the email from
  success and error output and replace raw error logging with a safe message.
- The manual EC2 deploy workflow limits its environment choices to `staging`
  and `production` and rejects artifacts built from any source other than a
  workflow dispatched on protected `main`.
- [README.md](../../README.md) now matches the enforced controls.

Item 2 completion retained the original finding below as a point-in-time record
and applied these changes:

- The build job resolves the checked-out commit with `git rev-parse HEAD` and
  passes that full immutable SHA to every later deployment step.
- The deployment job checks out that exact SHA rather than resolving the
  mutable workflow input a second time.
- Physical release IDs include the protected environment, commit prefix,
  `GITHUB_RUN_ID`, and `GITHUB_RUN_ATTEMPT`, so retrying the same commit creates
  a distinct release.
- Every artifact contains a release manifest, and its SHA-256 is verified after
  GitHub artifact download and again after the EC2 instance downloads it from
  S3.
- Environment and release identifiers use strict allowlist validation.
- The host extracts into a unique staging directory, rejects unsafe archive
  paths, validates the manifest, and atomically renames the complete directory
  into place. Existing release directories are never overwritten.
- Current-release activation and rollback use atomic symlink replacement.
  Pruning resolves and rechecks the active target immediately before deletion
  and never removes the active or rollback release.
- Twelve deploy-path regression tests cover manifest creation, invalid
  identifiers, same-commit redeploys, failed downloads, checksum and manifest
  mismatch, active-release overwrite refusal, broken-symlink recovery,
  failed-job retry identity, migration failure, activation, and both
  first-release and previous-release readiness rollback.

Item 3 completion retained the original finding below as a point-in-time
record and applied these changes:

- CDK owns one account-wide GitHub Actions OIDC provider and creates each
  environment deploy role in a separate identity stack that cannot update the
  EC2/RDS/VPC stack.
- Each role trusts only the exact protected GitHub environment identity for
  `code-studio-au/projex`, with the standard STS audience.
- Deploy permissions are limited to the environment's artifact prefix,
  `AWS-RunShellScript` on that environment's EC2 instance, and command-result
  reads.
- The deploy workflow grants `id-token: write` only to the deployment job and
  requires the CDK role ARN through a GitHub environment variable.
- All static AWS access-key inputs and fallback logic were removed from the
  workflow.
- CDK synthesis tests and repository boundary checks prevent broad trust,
  wildcard service permissions, or static-key fallback from returning.
- Deployment documentation now describes the OIDC-only setup and the required
  post-verification deletion and revocation of legacy access keys.
- The unused staging stack was deliberately destroyed and recreated from the
  reviewed CDK definition. The fresh host uses an automatically renewing
  Let's Encrypt certificate and a temporary IP-derived staging hostname.
- The account-wide OIDC provider and staging-scoped role are live, and the
  GitHub staging environment points at the new role, instance, artifact
  bucket, and HTTPS origin.
- Protected-main deploy run
  [30266888167](https://github.com/code-studio-au/projex/actions/runs/30266888167)
  passed the application, CDK, database, full server smoke, browser smoke,
  OIDC, SSM activation, and deployed-public-surface gates.
- The deployment failure review also closed two fresh-host gaps: CDK bootstrap
  now installs the verified Amazon RDS CA bundle, and atomic release promotion
  normalizes the release root to a service-traversable mode while keeping the
  payload root-owned.
- The legacy staging `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` GitHub
  secrets were deleted after the successful OIDC run, and the associated root
  access key was revoked. No root access keys remain active.

Item 4 implementation preserves the original finding below as a point-in-time
record and adds these controls:

- A dedicated non-login `projex-deploy` identity owns only its package-manager
  home. Application releases and shared deployment directories remain
  root-owned.
- The host still installs only frozen production dependencies for its native
  architecture; dependency lifecycle scripts are disabled. Installation and
  migrations run as `projex-deploy` through a clean environment.
- The runtime environment file is `root:projex-deploy` mode `0640`, so it is
  not sourced by the elevated SSM shell.
- The artifact carries the reviewed systemd unit. Each deployment validates
  and refreshes it before restart.
- The `ec2-user` runtime starts Node directly and has no capabilities, no
  privilege escalation, a read-only filesystem, private temporary/device
  views, protected kernel and home surfaces, restricted namespaces/address
  families, and only `/var/lib/projex` as explicit writable state.
- CDK explicitly requires IMDSv2, with synthesis and repository-boundary tests
  preventing a return to optional instance-metadata tokens.

Item 5 completion preserves the original finding below as a point-in-time
record and formalizes the existing forward-migration deployment model:

- Every migration in release `N` must remain compatible with both `N` and the
  immediately previous application release `N-1`.
- Schema changes follow explicit expand, migrate, and delayed contract phases;
  destructive changes cannot remove a contract still used by the rollback
  candidate.
- Pull requests with schema changes must document compatibility, rollback
  evidence, and the provenance of any destructive contract step.
- Deployment regression coverage proves that a successful forward migration
  remains applied when readiness failure atomically restores the previous
  compatible application release.

Item 6 completion preserves the original finding below as a point-in-time
record and applies these controls:

- The BetterAuth instance exposed through `/api/auth/*` disables public
  email/password sign-up in every environment.
- Trusted credential provisioning uses a separate server-only BetterAuth
  instance that is never exposed through an HTTP handler.
- First-user `auth:create-user` bootstrap and generated smoke fixtures use that
  controlled provisioning path; company invitations continue creating
  passwordless auth identities followed by password-setup email.
- A source-boundary regression test confines direct `signUpEmail` calls to the
  trusted auth module.
- Server smoke asserts that public sign-up returns BetterAuth's explicit
  `EMAIL_PASSWORD_SIGN_UP_DISABLED` response before confirming that the
  provisioned smoke user can still sign in.

The 28 July 2026 security-review follow-up also closes the email HTML-escaping
finding retained below:

- All authentication, account, export, and transaction-comment HTML emails use
  one shared escaping primitive for both text-node and attribute values.
- Password-setup and email-change message composition is isolated in pure,
  directly tested builders.
- Regression tests cover HTML metacharacters, attribute breakout attempts, and
  injected markup across every email-template family.

Item 7 completion preserves the testing review below as a point-in-time record
and applies every recommendation:

- Coverage output, documentation, and the CI artifact consistently call the
  allowlisted metric **selected domain coverage** and explicitly distinguish it
  from whole-repository coverage.
- Focused TSX component tests cover reversal submission and read-only
  permissions, controlled project tabs, pre/post-hydration access, programme
  restrictions, and import-review decisions.
- Browser smoke now runs as focused Playwright Test specs with reusable
  generated fixtures and page objects. Playwright owns Chromium/Firefox
  execution, retries, traces, screenshots, video, isolation, and reporting.
- Deploy regression coverage exercises same-SHA releases, download and
  integrity failures, migration failures, readiness failures, and both
  previous-release and first-release rollback paths.
- CDK assertions cover encrypted storage, IMDSv2, public ingress, RDS privacy,
  backups, retention, and production deletion protection. A project-specific
  cdk-nag pack enforces those controls during the CDK gate and includes a
  negative test proving violations fail the analysis.
- CI runs pinned, containerized ShellCheck and actionlint without suppressing
  findings. The findings discovered during adoption were fixed, including
  workflow output grouping and moving release environment loading/migration
  launch into a constrained Node helper shipped in the deploy artifact.
- The resulting application suite contains 62 passing Vitest files and 314
  tests, and the full generated-fixture browser suite passes in both Chromium
  and Firefox.

Item 8 completion preserves the bundle review below as a point-in-time record
and applies every recommendation:

- Direct-load budgets include the root, authenticated layout, nested route
  entries, lazy page component, transitive JavaScript imports, and route CSS.
- Navigation budgets report and constrain the additional payload beyond the
  root preload, so first paint and authenticated navigation cannot hide each
  other's regressions.
- The company summary/settings and project transactions/import/settings panels
  load only when their tabs are selected. Each deferred payload has its own
  JavaScript and CSS budget.
- Response schemas are split into API, account, authentication, transaction,
  shared primitive, and remaining domain modules. Client consumers import the
  narrow feature modules directly, with regression tests enforcing those
  boundaries.
- Fixture-based regression tests cover route/dependency traversal, unsafe
  generated asset paths, authenticated-route and deferred-tab budget failures.
- Compared with the pre-change baseline, the company dashboard direct-load
  JavaScript fell from about 348 KiB to 322 KiB gzip and its post-root payload
  fell from about 208 KiB to 182 KiB. The project workspace fell from about
  387 KiB to 345 KiB direct and from about 248 KiB to 205 KiB post-root.

Item 9 has completed the cross-cutting dependency and consolidation work from
the maintainability review:

- Taxonomy standards import the auto-coding sync implementation directly,
  removing the reported circular dependency and locking the boundary with a
  regression test.
- Email HTML escaping remains centralized, and public-app/auth redirect URL
  resolution now shares one implementation with consistent precedence.
- Server, browser, and disposable smoke launchers use one tested CLI parser;
  the parser is included in deploy artifacts.
- One SQL migration provider now adapts the ordered canonical SQL files
  directly to Kysely while preserving every existing migration name. The 35
  identical TypeScript wrappers have been removed, and the fresh/upgrade
  database gate verifies the replacement.
- The broad Knip export ignore has been removed in favour of statically
  analyzable imports, and its documentation now matches the configuration.
- `verify:ci` delegates application security and audit work to `verify:app`
  once instead of running those checks twice.
- The programme-only presentation, period filtering, rollup cards, and
  sub-project table have been extracted from `ProjectWorkspace` into a focused,
  component-tested view. The route-level coordinator now owns data, access, URL
  state, and navigation without also carrying the complete programme UI.
- PowerBI preview tabs, table configuration, and review columns now live behind
  focused import-review components, with component tests covering tab-scope
  resets and bulk decision routing. `PowerBiImporterPanel` remains responsible
  for the import workflow and exclusion-rule coordination.
- Project budget editing, allocation/headroom presentation, and health messaging
  now live in a component-tested summary boundary. `BudgetPanel` retains period
  filters, rollup-row construction, column visibility, and table coordination.
- Project workspace URL normalization and navigation replacement/push semantics
  now live in a tested hook boundary. The route coordinator no longer owns the
  synchronization effect or its mutable navigation intent.
- Company export polling, download, notification status, and presentation now
  live in a focused export panel with tested file-size and audit-summary models.
  `CompanySettingsPanel` retains company standards and membership coordination.
- Taxonomy move, recode, and destructive-delete workflows now live in dedicated
  action dialogs. Tested option and safe-default models keep affected
  subcategories and auto-coding rule handling explicit.
- Project taxonomy CRUD now delegates company-default promotion and
  cross-project synchronization to a dedicated service, leaving the CRUD
  aggregate focused on project-owned category and subcategory lifecycle.
- Reversal workflow coordination now delegates approval, rejection, and
  unmatching to a match-decision service. Rejection upserts and optimistic
  workflow state are shared once, while the top-level transaction dispatcher
  retains authorization, workflow locking, and action routing.

Item 10 has completed the documentation and repository-hygiene recommendations:

- The README badge, required CI-lane count, browser-smoke merge gate, and
  canonical repository identity reflect the enforced `code-studio-au/projex`
  controls.
- CONTRIBUTING and the pull-request template describe the configured CodeQL,
  dependency, and secret-scanning controls without referring to a nonexistent
  quality-rating provider.
- Full local browser verification consistently documents installation of both
  supported Playwright browsers.
- Dead-code guidance matches the narrow Knip configuration, and the repository
  security gate prevents broad export ignores or the reviewed documentation
  drift from returning.
- The public repository now carries an explicit proprietary `LICENSE`, and the
  private package is marked `UNLICENSED`; viewing the repository does not grant
  reuse or redistribution rights.

Item 11 completes the remaining browser-test isolation intent and the CodeQL
follow-up from pull request 27:

- The 1,011-line shared browser runner has been removed. Application-shell,
  taxonomy, rule-suggestion, and reversal behavior now run as four independently
  reported Playwright specs behind focused page objects.
- Each spec provisions and cleans its own generated company, project, users, and
  workflow data. A single global setup performs the stale-fixture sweep before
  workers start, avoiding destructive cross-worker cleanup.
- Chromium and Firefox both pass with two workers, providing independent
  retries, diagnostics, and safe parallel execution.
- The bundle-budget fixture no longer constructs executable JavaScript from
  serialized or interpolated values. Static manifest and dependency-map sources
  close CodeQL alert 6 without suppression while retaining the unsafe-path and
  oversized-payload regression cases.
- Maintainability boundary tests prevent the monolithic browser runner or
  single-worker configuration from returning.

# Full Repository Review

Overall, the current application is technically healthy and substantially
stronger than the earlier audit. Architecture, validation, database integrity,
hydration handling, and verification breadth are all good. The reviewed commit
was green locally, in CI, and in deployment.

The repository is production-capable but not yet fully production-hardened. The
most important remaining risks are GitHub enforcement, deploy idempotency and
identity, AWS credential handling, and recovery assumptions around database
migrations.

## Executive assessment

| Area                     | Assessment                 | Main concern                                                             |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| Application architecture | Strong                     | Large coordinators and one circular dependency                           |
| Type/code quality        | Strong                     | Very little unsafe typing or suppression                                 |
| CI definitions           | Strong                     | Hosted branch protection requires only 3 of 5 jobs                       |
| Testing breadth          | Strong                     | Coverage percentage represents a narrow selected scope                   |
| Browser verification     | Good                       | Comprehensive but concentrated in one 1,160-line script                  |
| Deployment               | Functional                 | Release identity, same-SHA retry, migration rollback and privilege risks |
| Security                 | Good application controls  | GitHub security features disabled; static AWS credentials used           |
| Client performance       | Passing                    | No authenticated-route payload budgets                                   |
| Infrastructure           | Sensible low-cost baseline | Production defaults remain Single-AZ with one-day backups                |
| Documentation            | Extensive                  | Several important statements have drifted from reality                   |

## Highest-priority findings

### 1. GitHub's hosted controls do not enforce the workflow's full quality bar

The reviewed CI workflow ran five jobs, but live `main` branch protection
required only:

- `verify`
- `verify-db`
- `smoke-disposable`

It did not require `verify-cdk` or `smoke-browser-disposable`. A pull request
could therefore merge while infrastructure synthesis or both browser engines
were failing.

Live branch protection also had:

- no required review
- no conversation-resolution requirement
- no administrator enforcement
- no linear-history requirement

The `staging` environment had no reviewers, wait timer, or deployment branch
policy, and permitted administrator bypass. Repository Actions allowed all
actions and did not enforce SHA pinning, although the workflow files manually
pinned their actions.

Recommended change: require all five CI checks, conversation resolution, and
at least one approval where practical. Add environment approval and
protected-branch/tag restrictions for deployed environments.

The documentation overstated enforcement in [README.md](../../README.md).

### 2. Deploy release identity is not reliably tied to the built checkout

The workflow checks out arbitrary `${{ inputs.ref }}`, but creates the release
ID from `GITHUB_SHA`, which represents the workflow invocation ref rather than
necessarily the checked-out input ref. See
[deploy.yml](../../.github/workflows/deploy.yml).

Consequences:

- An artifact built from a non-default `inputs.ref` can be labelled with the
  wrong commit.
- A branch can move between the build and deploy jobs.
- The deploy job performs a second mutable checkout that may not match the
  artifact.
- Redeploying the same environment and commit reuses the same release
  directory.

The SSM script deletes that release directory before downloading the
replacement in
[deploy-artifact-ssm.sh](../../scripts/deploy-artifact-ssm.sh). If that directory
is currently active and the download or extraction fails,
`/opt/projex/current` can be left pointing at a deleted directory.

Recommended design:

- Resolve `git rev-parse HEAD` immediately after checkout.
- Pass that immutable SHA between jobs.
- Include `GITHUB_RUN_ID` and attempt in the physical release directory.
- Download and validate into a fresh staging directory, then atomically rename.
- Never remove an active release.
- Validate `environment_name` and release identifiers against a strict
  character pattern.

### 3. The successful deploy used long-lived AWS credentials

The reviewed deploy run skipped OIDC and used the static-secret credential path
defined in [deploy.yml](../../.github/workflows/deploy.yml).

This should be migrated to GitHub OIDC with a narrowly scoped deployment role.
Once verified, remove the static-key fallback and rotate/revoke the existing
access key.

The OIDC provider and role should ideally be represented in CDK rather than
remaining an external manual dependency.

### 4. On-host installation and migration privileges need hardening

The SSM deploy path does not drop privileges before running:

- `pnpm install --prod`
- environment loading
- database migrations

See [deploy-artifact-ec2.sh](../../scripts/deploy-artifact-ec2.sh).

That means dependency lifecycle scripts and application migrations may run with
the elevated identity used by SSM. Prefer a preassembled runtime
artifact/container, or explicitly execute package installation and migrations
as a constrained deployment user.

The systemd service correctly runs as `ec2-user`, but has no service sandboxing
in [projex.service](../../deploy/systemd/projex.service). Test adding:

- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `ProtectHome=true`
- `ProtectSystem=strict`
- explicit writable paths
- capability restrictions

CDK also does not explicitly require IMDSv2 on the instance in
[projex-infra-stack.ts](../../deploy/cdk/lib/projex-infra-stack.ts).

### 5. Application rollback does not roll back database migrations

Migrations run before the application symlink switches. If the new application
fails, the script restores the old application but leaves the upgraded database
in place.

That is a valid deployment model only if every migration remains
backward-compatible with the previous release. The repository says migrations
are forward-only but does not enforce or prominently document an
expand/migrate/contract compatibility policy.

Recommended change:

- Require migrations to remain compatible with at least one prior application
  release.
- Separate destructive contract migrations into later deployments.
- Add this rule to migration review and pull-request templates.
- Test deployment rollback against a migration-bearing release.

### 6. Invite-only authentication still exposes public sign-up

Email/password authentication is enabled without `disableSignUp` in
[betterAuthInstance.ts](../../src/server/auth/betterAuthInstance.ts). The
surrounding product and email flow appear invitation-oriented.

Unlinked BetterAuth accounts do not gain application authorization, but public
sign-up can still create authentication records and sessions unnecessarily. If
Projex is intentionally invite-only, disable public sign-up in production while
preserving explicit admin/bootstrap and smoke-fixture creation paths.

## Security review

Strong controls already present:

- Request-scoped, verified session caching.
- Centralized company/project authorization and resource guards.
- Server-owned financial import previews and workflow decisions.
- Optimistic workflow versions, row locking, advisory locks and database
  constraints.
- Exact CORS allowlists.
- Nonce-based CSP and `script-src-attr 'none'`.
- HTTPS-only production startup validation.
- Verified PostgreSQL TLS by default.
- Private, encrypted RDS and non-public S3 buckets.
- Rate limits for sensitive operations.
- No tracked credentials, certificates, private keys, or environment files
  found.
- Current `pnpm audit`: zero advisories across 619 dependency records.
- Seven-day dependency release-age delay and explicit build-script
  allowlisting.

Remaining issues:

- GitHub secret scanning, push protection, Dependabot vulnerability alerts,
  Dependabot security updates, and code scanning are all disabled.
- The CI audit is useful but does not replace push-time secret detection or
  repository-native vulnerability alerts.
- Current email HTML is inconsistently escaped. Notification emails escape
  dynamic values, but password-reset and email-change templates interpolate
  names and URLs directly in
  [betterAuthInstance.ts](../../src/server/auth/betterAuthInstance.ts) and
  [account.ts](../../src/server/fns/account.ts).
- `style-src 'unsafe-inline'` remains an accepted Mantine SSR constraint and
  should continue to be documented as residual CSP risk.

## Testing review

Current breadth is excellent:

- 53 Vitest files and 266 passing tests.
- 23 database integration files containing 53 database test cases.
- Fresh database migration and generated-type verification.
- Full generated-fixture server smoke.
- Chromium and Firefox browser smoke.
- Public deployment security and authenticated-cookie verification.
- Hydration regression enforcement ensures only
  [useIsHydrated.ts](../../src/hooks/useIsHydrated.ts) owns
  `useSyncExternalStore`.

The main weakness is how coverage is presented. The reported result—99.18%
lines—is calculated over a selected set of roughly 859 instrumented lines,
primarily pure utilities, validation, environment and resource guards. It is
not whole-repository coverage; the include list is explicit in
[vite.config.ts](../../vite.config.ts).

There are no `.tsx` component tests. Complex UI state is therefore protected
mainly by one large browser flow.

Recommended improvements:

- Label the current metric "selected domain coverage".
- Add focused component tests for transaction/reversal modals, tab state,
  hydration-sensitive permissions, and import review decisions.
- Convert the 1,160-line browser runner into Playwright Test specs with
  reusable fixtures/page objects. This would improve failure isolation,
  retries, traces, parallelism and reporting.
- Add deploy-script tests for same-SHA redeploy, failed download, failed
  migration, failed readiness and rollback.
- Add CDK assertion tests for encryption, IMDSv2, public ingress, RDS retention
  and production deletion protection.
- Add ShellCheck/actionlint/CDK security analysis to CI.

## Bundle and chunk review

The root budget passes:

- JavaScript: 139.9 KiB gzip against 160 KiB
- CSS: 36.2 KiB gzip against 45 KiB

However, [verify-client-bundle.mjs](../../scripts/verify-client-bundle.mjs) budgets
only root-route preloads.

Measured from the generated dependency maps:

- Company dashboard: about 383.0 KiB total root-plus-route assets gzip.
- Project workspace: about 422.6 KiB total.
- Additional post-root payload: about 206.9 KiB and 246.5 KiB respectively.
- The shared authenticated `admin` chunk alone is about 89.3 KiB gzip.
- The project workspace page chunk adds about 56.0 KiB gzip.

Both dashboards unmount inactive tabs, which is good, but their panels are
statically imported. See
[ProjectWorkspace.tsx](../../src/components/ProjectWorkspace.tsx) and
[CompanyDashboardPage.tsx](../../src/pages/CompanyDashboardPage.tsx).

Recommended improvements:

- Add budgets for company dashboard and project workspace dependency closures.
- Lazy-load import/settings/transactions panels by active tab.
- Split the 590-line response-schema module by feature. The tiny error helper
  imports the entire module in
  [errorResponses.ts](../../src/api/errorResponses.ts), contributing an
  approximately 21 KiB gzip chunk.
- Track both first-load payload and navigation payload.

## Structure and maintainability

The repository has strong written boundaries and lint enforcement. TypeScript
is strict; there are no application `any` usages, suppression directives,
TODO/FIXME markers, or duplicated hydration stores. Knip, ESLint, Prettier and
typechecking all pass.

The largest maintainability hotspots are:

- `ProjectWorkspace.tsx` — 1,352 lines
- `PowerBiImporterPanel.tsx` — 1,304
- `TaxonomyManagerModal.tsx` — 1,169
- `BudgetPanel.tsx` — 1,110
- `CompanySettingsPanel.tsx` — 1,050
- `reversalWorkflowServers.ts` — 987
- `taxonomy/projectCrud.ts` — 920

These should be split around domain actions and independently testable
presentation models, not merely divided by line count.

A static import scan found one circular dependency:

`projectAutoCodingRules/mutationServers.ts → taxonomy/standards.ts →
projectAutoCodingRules.ts → mutationServers.ts`

The barrel import in
[standards.ts](../../src/server/fns/taxonomy/standards.ts) should import the sync
implementation directly.

Other smaller consolidation opportunities:

- Shared HTML escaping and public-app URL resolution for email modules.
- Shared CLI flag parsing for server and browser smoke.
- A reusable SQL-file migration adapter instead of 35 near-identical Kysely
  wrappers.
- Narrow the broad Knip export ignore in [knip.json](../../knip.json); it
  currently ignores every export in `disposable-postgres.mjs`, while the
  documentation claims one narrow exception.
- Remove duplicated security/audit work inside `verify:ci`.

## Infrastructure and operational resilience

The low-cost baseline is coherent: isolated RDS, encrypted storage, SSM
deployment, no SSH by default, S3 lifecycle policies and retained production
database resources.

For a finance-oriented production environment, defaults remain weak:

- one-day RDS backup retention
- Single-AZ by default
- no CloudWatch alarms
- no enhanced monitoring or database log exports
- no tested disaster-recovery procedure
- no storage-autoscaling default

These defaults are explicitly documented as a cost choice, but production
should override them. See
[projex-infra.ts](../../deploy/cdk/bin/projex-infra.ts).

The CDK gate currently passes but emits Node loader/deprecation warnings and
reports 81 unconfigured CDK feature flags. This is maintenance debt rather than
a deployment failure.

## Documentation and repository hygiene

Documentation is extensive, but several claims need correction:

- The README badge points at the InsideOut repository rather than
  `code-studio-au/projex`.
- README says there are four CI lanes; there are five.
- README implies browser smoke blocks merge; the reviewed branch protection did
  not require it.
- CONTRIBUTING references a "GitHub Code Quality" acceptance gate, but the
  reviewed commit had no such check provider.
- Dead-code documentation says the exception is narrow, while Knip ignores all
  exports in one script.
- The public repository has no licence file, leaving reuse terms undefined.

## Verification performed

- `pnpm run verify:app` — passed
- 53 Vitest files / 266 tests — passed
- Coverage gate — passed
- Format, ESLint, strict TypeScript and Knip — passed
- Production build and root bundle budgets — passed
- `pnpm run verify:cdk` — passed with deprecation/feature-flag warnings
- `pnpm audit --json` — zero vulnerabilities
- Current-SHA CI run `30197502272` — all five jobs passed
- Current-SHA deploy run `30197701349` — artifact gate, EC2 activation and
  public verification passed
- Worktree remained clean

## Recommended implementation order

1. Fix branch/environment protection and enable GitHub security features.
2. Migrate AWS deploy access to OIDC.
3. Make release identity immutable and same-SHA deployments atomic.
4. Establish backward-compatible migration/rollback rules and drop deploy
   privileges.
5. Disable public production sign-up if the app is invite-only.
6. Add authenticated-route bundle budgets and lazy tab chunks.
7. Break up browser/deploy tests and the largest feature coordinators.
8. Clear the circular dependency and documentation drift.
