# Product Backlog

This backlog contains only unfinished work. Completed work belongs in Git
history and feature documentation, not here. The completed 31 July engineering
programme and other point-in-time reviews are retained in the
[documentation archive](../reviews/archive/README.md).

## Awaiting Product Decision

### Decide whether a first-class audit product is required

Standing TODO: confirm the organisation's audit-retention, access, privacy, and
export requirements before building an administrator-facing audit product. The
current centralized audit-category logger is deliberately best-effort
operational telemetry and does not claim to be a durable compliance record.

Examples:

- company member added or removed
- company role changed
- invite email resent
- email change requested / resent / cancelled / confirmed
- project superadmin support access toggled on or off
- project visibility changed
- import preview committed
- transaction coding, manual override, lock or unlock, split, and milestone attribution changes
- category and subcategory changes
- rule creation, update, reorder, disable, and suggestion acceptance
- other user-entered or user-changed business data updates

Why this matters:

- gives company admins visibility into who changed what and when
- improves support and debugging without relying on memory or chat history
- may create a defensible audit trail for sensitive finance and admin workflows
  if governance requirements justify durable storage

Design direction:

- keep current telemetry sanitized, scalar-only, and independently switchable
- if a durable audit product is approved, design its storage separately from
  operational logging
- audit broadly across meaningful user-entered, user-approved, and system-driven actions
- show the audit trail to company admins
- support retention policies by event class rather than one global retention window
- explicitly include structural changes that can affect locked data credibility, such as taxonomy moves or split edits

Examples of retention strategy:

- company membership and company-role changes: keep indefinitely
- project settings and visibility changes: keep long-term
- transaction coding changes: short retention window such as 5 days
- high-volume operational edits: shorter retention to control storage growth

Notes:

- centralized audit-category telemetry already covers important transaction
  review, locking, import, reversal, and structural-integrity paths when enabled
- a durable product would need careful event coverage, schema, indexing, retention,
  access, export, and admin-UI design
- do not choose retention periods or expose a broad audit UI until the
  organisation confirms its governance requirements
- include access and privacy-oriented events explicitly, especially changes that grant or revoke superadmin troubleshooting visibility

## Organisation Repository and Infrastructure Move

These items should be addressed as part of making the organisation-owned
repository and AWS account the canonical production platform.

Current deployment boundary:

- the personal repository and AWS account currently provide the verified
  staging environment
- production is intentionally not ready and must not be promoted from the
  personal infrastructure
- the Deploy workflow default-denies production until the selected protected
  environment explicitly sets `PROJEX_PRODUCTION_DEPLOY_ENABLED=true`; that
  enablement is a cutover action, not a staging setting
- production cutover begins only after the organisation repository, AWS
  account, protected environments, OIDC roles, secrets, DNS, certificates,
  monitoring, backup policy, and recovery procedure are validated together

### Raise production infrastructure resilience

Current position:

- the AWS stack provides private encrypted RDS, encrypted non-public S3, SSM
  instead of SSH, IMDSv2, restricted OIDC deployment roles, retained and
  deletion-protected production database resources, and tested CDK security
  assertions
- defaults still favour the current low-cost baseline: one-day backup
  retention unless overridden, Single-AZ unless overridden, no default storage
  autoscaling, no repository-defined CloudWatch alarms, no enhanced monitoring
  or database log exports, and no tested disaster-recovery restoration exercise

Organisation-move requirements:

- define production RTO and RPO
- choose backup retention and restore-testing cadence
- enable Multi-AZ according to the approved availability requirement
- set storage autoscaling limits
- add EC2, systemd, disk, RDS, readiness, and application-error alarms
- define log retention, database log exports, and privacy boundaries
- test a database restore and full application recovery
- document DNS, certificate, bootstrap-superadmin, email, and rollback steps as
  one fresh-environment exercise

### Promote verified pull requests through GitHub Merge Queue

Current problem:

- pull-request CI verifies GitHub's temporary pull-request merge commit
- the protected-main process then squash-merges the pull request, producing a
  different commit SHA even when the resulting Git tree is identical
- full CI therefore runs again on `main` so release provenance remains bound to
  the exact protected-main revision rather than trusting a different PR commit
- the verified-release workflow has removed redundant build and deploy work,
  but PR and post-merge CI still repeat substantially the same verification

Recommended solution:

- make the organisation-owned GitHub repository the canonical repository as
  part of the planned organisation GitHub and infrastructure move
- enable GitHub Merge Queue and require full CI for the `merge_group` event so
  the queued integration result is tested against the latest protected base
- allow only a successfully verified merge-group result to land on `main`
- replace duplicated full post-merge CI with a lightweight identity and release
  eligibility check that proves the landed revision is the verified queue
  result before creating the retained, attested release artifact
- retain a safe full-verification fallback for any revision that cannot be
  matched to a successful trusted merge-group run

Why this cannot be implemented now:

- the canonical `code-studio-au/projex` repository is user-owned, while GitHub
  Merge Queue is available to organisation-owned public repositories and
  qualifying organisation-owned private repositories
- `InsideOutInstitute/project-expense-tracker` is currently an intentional
  mirror rather than the canonical development and release repository
- treating matching file trees as equivalent through custom promotion logic
  would add a bespoke trust boundary and is not the recommended interim design

Organisation-move requirements:

- include canonical repository ownership, branch rulesets, required checks,
  Merge Queue, environments, secrets, and GitHub OIDC trust in one planned
  migration
- add and regression-test the `merge_group` workflow path before removing the
  existing protected-main full-CI boundary
- update release provenance and deployment identity checks for the organisation
  repository, including repository-bound AWS OIDC subjects
- confirm pull-request, queued-base-update, failed-check, cancelled-run, and
  unmatched-main-revision behavior before considering duplicate verification
  removed
- keep the personal repository as a mirror only after the organisation
  repository is proven as the canonical source

## Future Features

These are worthwhile future additions without a committed delivery order.

### Systematic accessibility and small-screen usability

Current position:

- the Mantine UI has consistent focus-visible styling, responsive navigation,
  accessible names on most controls, and keyboard coverage in browser workflows
- browser smoke validates important behavior but is not a WCAG audit
- dense budget, transaction, taxonomy, and membership tables remain
  desktop-first
- modal focus order, focus restoration, live announcements, contrast, zoom,
  reduced motion, and a defined viewport matrix are not automated regression
  boundaries

Design direction:

- add automated accessibility checks to representative login, company,
  project, transaction, import-review, and nested-modal paths
- add keyboard-only assertions for opening, saving, cancelling, error recovery,
  and returning focus to the trigger
- exercise critical paths at 320/390 px, tablet, and desktop widths
- decide whether dense tables use responsive cards or deliberate horizontal
  scrolling with sticky identifying and action columns
- preserve appropriate live-region semantics for pending and successful work
- record accepted third-party table limitations with narrow regression tests
  instead of broad exclusions

### Operational metrics, retention, and alerts

Current position:

- API routes and server functions emit request IDs and structured logs
- systemd sends application output to journald
- health, readiness, smoke, and deployed-security verification are comprehensive
- operations still depend on manually opening an SSM session and reading
  `journalctl`
- centralized retention, operational dashboards, application and infrastructure
  alarms, and explicit RTO/RPO exercises remain undecided

Design direction:

- add the deployed release ID and source SHA to structured runtime logs
- forward privacy-safe structured journald output to a retained searchable
  destination without financial text, credentials, cookies, tokens, or email
  contents
- add health/readiness, systemd restart, EC2, disk, RDS, and application-error
  alarms
- correlate deploy annotations, request IDs, export jobs, and email-provider
  events
- write and test a minimal incident and database-restore runbook
- establish explicit RTO/RPO targets before choosing production backup and
  Multi-AZ settings

### Reduce shared runtime and router bundle weight

Examples:

- keep shrinking the remaining shared `main` client chunk after the UI vendor split and lazy API runtime work
- inspect router bootstrap, generated route tree weight, shared query/runtime code, and other always-loaded client infrastructure
- move heavy boot-time code behind lazy boundaries where it does not need to ship in the first paint path

Why this matters:

- the current bundle is materially better than before, but the shared client runtime is still larger than we want
- this is now more of a technical-architecture optimization than a feature gap, so it should stay visible but not crowd out near-term product work

Current baseline:

- the root preload is approximately 140 KiB JavaScript gzip and 36 KiB CSS gzip after deferring authenticated chrome, route query modules, and data-table styles, and removing Zod from boot-time search validation
- the company dashboard default dependency closure is approximately 322 KiB
  JavaScript gzip and 42 KiB CSS gzip, with approximately 182 KiB JavaScript
  and 6 KiB CSS loaded beyond the root payload
- the project workspace default dependency closure is approximately 345 KiB
  JavaScript gzip and 42 KiB CSS gzip, with approximately 205 KiB JavaScript
  and 6 KiB CSS loaded beyond the root payload
- `verify:bundle` enforces separate JavaScript and CSS ceilings for the root
  preload, both authenticated direct loads, and both post-root navigation
  payloads; deferred dashboard panels also have individual tab-load budgets

Design direction:

- prefer structural wins such as lazy runtime loading and boot-path pruning over brittle chunk hacks
- keep the build stable and avoid Rollup chunk-cycle regressions while splitting
- measure each change against actual build output so we know which shared dependencies are still anchoring the boot bundle

### Milestone-aware budgeting and forecasting

Examples:

- optional project milestones with budgets, dates, and statuses
- milestone attribution on transaction allocations where needed
- bulk milestone assignment for selected eligible transactions
- milestone tables and charts showing budget, actuals, remaining, and forecast variance

Why this matters:

- some projects spend in phases rather than at a steady rate
- milestone-aware views make forecasting more credible for uneven or overlapping work

Design direction:

- treat milestones as optional planning objects rather than mandatory coding buckets
- store milestone attribution on allocations when split transactions exist
- make unassigned operational spend explicit so milestone totals still reconcile to project totals

### Persistent workflow notifications

Examples:

- personal or role-scoped notifications for aging uncoded work, pending approvals, reversal decisions, and unlock requests
- alerts when project budget risk thresholds are crossed or rule suggestions are ready for review
- optional email or collaboration-tool delivery for important overdue work

Why this matters:

- users may need proactive reminders in addition to in-app project attention indicators
- timely notifications reduce the chance that approvals or coding follow-up are missed

Design direction:

- continue deriving notification eligibility from authoritative workflow state
- scope recipients to company/project permissions and the action they can perform
- add deduplication, aging thresholds, digesting, and throttling before enabling external delivery
- keep notifications dismissible without changing the underlying workflow item

### Route-driven deep links and project entry points

Examples:

- deeper links from future alerts, audit entries, reports, and notifications into exact project states
- direct links into future review queues such as auto-mapped pending, unlock requests, or approval queues
- preserved source context from more surfaces beyond the current company summary drill-down

Why this matters:

- core company-summary drill-down continuity already exists
- future app surfaces should reuse the same route-driven pattern rather than inventing transient navigation state

### Budget management ergonomics

Examples:

- duplicate or copy budget lines
- import/export budgets
- budget templates
- explicit period-based budgets where projects need monthly or quarterly plans
- milestone-aware forecast logic based on planned delivery rather than naive
  straight-line spend extrapolation

Why this matters:

- budget setup still works, but repeated admin effort will become more noticeable as usage grows

### Executive reporting depth

Examples:

- export from the company summary
- sort by overspend or risk
- trend views
- category rollups across projects
- stronger project KPI rollups in the workspace header or company dashboard

Why this matters:

- the executive summary is now useful, but deeper reporting will likely be needed as companies use more projects over time

### Safer role and access administration UX

Examples:

- clearer role comparison/help text
- more obvious consequences of role changes
- permission summary views for admins

Why this matters:

- access control is much stronger now, but role changes are sensitive enough that more clarity will reduce admin mistakes

### Review modal/select scroll behavior in Zen/Firefox

Examples:

- revisit taxonomy and import-rule modal interactions where opening or wheel-scrolling Mantine `Select` dropdowns can interfere with page or modal scrolling in Zen/Firefox
- confirm whether the current targeted fixes should stay as-is, be narrowed further, or be replaced with a more durable cross-browser pattern
- verify whether specific high-risk flows should use Mantine `Select`, `NativeSelect`, or a different editor shape entirely

Why this matters:

- the current implementation is stable, but part of that stability comes from a pragmatic workaround rather than an ideal UX outcome
- in Zen/Firefox, Mantine modal scroll locking and combobox dropdown scrolling can interact badly enough to freeze scrolling after dropdown use

Design direction:

- reproduce the issue in an isolated Mantine modal/select harness on current Firefox and Zen releases
- compare a Mantine upgrade, a more surgical modal configuration, and moving complex taxonomy editors out of modal context
- retain a targeted workaround only if the isolated test confirms it remains necessary

### Search and filtering maturity

Examples:

- richer cross-project filtering
- saved or more guided filter states
- optional column-specific filters where global transaction search is not
  precise enough

Why this matters:

- once data grows, finding and narrowing data quickly becomes as important as editing it

### Optional export extensions

Examples:

- harden the BI/export contract where downstream consumers demonstrate a concrete need
- consider optional workbook polish such as protected report tabs or branded cover sheets
- add project-level export variants only if users need a narrower handoff than the company workbook

Why this matters:

- the existing company workbook provides the core portability baseline
- optional extensions may help when users need a narrower project handoff or more presentation-ready output

## Not A Priority Right Now

- large table-layer replacement work beyond the current Mantine 9 + `mantine-react-table-open` stack unless the fork becomes unmaintained or product needs outgrow it
- replacing the app company model with BetterAuth organizations
- automatic account switching after password reset
- large visual redesign work

Those can wait unless product requirements change.
