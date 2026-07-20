# Product Backlog

This backlog is intentionally focused on unfinished work. Implemented platform capabilities such as transaction comments, split/transfer workflows, programme rollups, PowerBI import foundations, smoke cleanup automation, and destructive delete safeguards are no longer tracked here as active backlog items.

## Immediate TODO

These items come from the July 2026 professional repository review. The numbering is retained so implementation and review follow-up can refer to the original finding unambiguously.

### 1. Harden authentication rate-limit client IP handling

Status: completed 21 July 2026.

Risk:

- Better Auth currently uses its default `x-forwarded-for` client IP source
- Nginx builds that header with `$proxy_add_x_forwarded_for`, so a client-provided value can appear before the trusted proxy address
- Better Auth 1.6.x reads the first valid address, allowing a caller to rotate forged values and weaken per-IP authentication rate limiting

Implemented:

- Better Auth now reads only the Nginx-controlled `x-real-ip` header
- all maintained Nginx application proxy configurations overwrite `X-Real-IP` with `$remote_addr`
- repository security verification and a focused auth-options test guard both sides of that trust boundary
- full disposable server and browser smoke flows pass with the trusted proxy header and exercise active sign-in rate limiting

### 2. Prevent internal server exception details from reaching clients

Risk:

- `toAppError` currently preserves the original message when an unknown `Error` is converted to `INTERNAL_ERROR`
- `withServerBoundary` applies that conversion to unexpected server-function failures
- the HTTP boundary serializes `AppError.message`, so database constraints and implementation details can be exposed to clients

Required work:

- preserve messages for deliberate domain `AppError` instances only
- return a fixed generic message for unknown errors converted to `INTERNAL_ERROR`
- retain the original cause in server-side structured logs with the request ID
- add regression coverage for an unexpected error that passes through both the server-function and HTTP boundaries

### 3. Restore a clean dependency security audit

Status: completed 21 July 2026.

Risk:

- the mandatory `pnpm audit` gate currently reports high-severity denial-of-service advisories in transitive `brace-expansion` and `js-yaml` versions
- affected paths include production dependency trees through ExcelJS and TanStack Start as well as development tooling
- `verify:app` and CI stop at the audit stage, preventing a releasable green verification result

Implemented:

- pnpm 11 override configuration now lives in root `pnpm-workspace.yaml`, where pnpm actually applies dependency-resolution settings
- vulnerable `brace-expansion` major lines resolve to `1.1.16`, `2.1.2`, and `5.0.7`, while vulnerable `js-yaml` 4.x resolves to `4.3.0`
- stale broad overrides were removed instead of forcing legacy consumers across incompatible package majors
- the override rationale and removal policy are documented in `docs/dependency-overrides.md`
- the regenerated lockfile, zero-vulnerability audit, full application gate, CDK synthesis, database gate, export flow, and browser smoke all pass

### 4. Align the default EXA import rule with reversal matching

Risk:

- the seeded rule named `Exclude EXA unacquitted Concur source` matches only `Source = EXA`
- its predicate therefore excludes every EXA transaction rather than the narrower subset described by its name
- new companies can silently exclude both pending-reversal and actual-reversal candidates before the matching workflow sees them

Required work:

- confirm the business fields that distinguish unacquitted Concur rows from reversal-relevant EXA rows
- narrow the exclusion predicate when a reliable discriminator exists, otherwise default EXA rows to import or review
- define a safe migration or baseline-sync policy for companies that already inherited the broad rule
- add import-preview and month-one/month-two reversal integration coverage for the chosen default

### 5. Make ambiguous reversal pairing valid by construction

Risk:

- ambiguous matching independently orders tied source and counterpart arrays and pairs them by index
- optional reference and cost-centre comparisons are not transitive, so a zipped pair can be invalid even though each row participated in a tie around another row
- approval rechecks amount, sign, project, and lock state but does not re-run the import-metadata compatibility score

Required work:

- construct a bipartite graph containing only source/counterpart edges that pass `autoMatchScore`
- choose deterministic default matches only from valid edges and preserve the ambiguity explanation for review
- revalidate metadata compatibility during approval or otherwise enforce an invariant that stored suggested pairs are valid
- add asymmetric missing/reference/cost-centre test cases, not only fully identical duplicate rows

### 6. Make bulk transaction and reversal operations concurrency-safe

Risk:

- bulk transaction eligibility is read before the database transaction begins
- subsequent updates do not consistently recheck lock, categorisable, or reversal-workflow conditions in their SQL predicates
- bulk reversal approval commits each selected reversal separately, so a later error can return failure after earlier items have already committed

Required work:

- load and lock selected rows inside the mutation transaction
- use conditional updates/deletes and verify affected-row counts to prevent stale eligibility decisions
- make bulk approval atomic, or explicitly expose and test per-item success/failure semantics
- add concurrent lock/reversal-state and mid-batch failure integration tests

### 7. Split oversized feature modules along domain boundaries

Current concentration:

- reversal server handling combines scoring, ambiguous pairing, comments, workflow transitions, import orchestration, and bulk approval in one module
- `ProjectWorkspace`, PowerBI import, company settings, budget, summary, and smoke dashboard components each coordinate several responsibilities
- company and project import-rule modals duplicate draft management, validation, save, reorder, and editor rendering

Required work:

- split reversal matching, reversal workflow transitions, comments, and bulk commands into focused domain services
- move complex UI mutation orchestration into feature controllers/hooks while keeping rendering components presentational
- extract a shared import-rule editor with company/project scope adapters
- preserve the existing documented API/server boundary and add focused tests around each extracted boundary

### 8. Remove verified dead code and control export surface growth

Verified examples:

- unused `LoadingChip` and `useRequiredSession` exports
- unused create/delete transaction and update-company query mutations
- unused legacy access helpers and company-default mapping functions
- the disabled full-list transaction query and coding helpers in `useTransactions`, while the workspace only consumes its replace/append import mutations

Required work:

- remove only candidates confirmed by repository-wide reference checks, accounting for dynamic route, script, CDK, and ambient type entry points
- replace the legacy `useTransactions` wrapper with focused import mutations where that is its only remaining responsibility
- reduce unnecessary exports for helpers that are file-local
- add a configured Knip check or equivalent dead-code report with explicit dynamic-entry exceptions

### 9. Complete paginated transaction query behaviour and profile its cost

Risk:

- the transaction panel checks `isPlaceholderData`, but the paginated query does not configure `placeholderData`, leaving the intended transition state inactive
- every page/filter request also recalculates a multi-field aggregate summary over the matching transaction set
- the current transaction indexes do not directly cover the default project/date/id page ordering

Required work:

- either configure `placeholderData: keepPreviousData` or remove the inactive transition branch and use an intentional loading state
- add focused pagination tests for page/filter transitions
- capture `EXPLAIN (ANALYZE, BUFFERS)` evidence with representative project sizes before adding indexes
- add a project/date/id index or summary-query redesign only when profiling demonstrates the benefit

## Active Backlog

### 1. Add bulk transaction review actions

Examples:

- bulk approve auto-mapped transactions
- bulk recode selected rows
- bulk clear coding
- bulk milestone assignment when milestone modeling exists
- future reviewed / locked actions once transaction workflow state is explicit

Why this matters:

- row-by-row transaction review will become the main bottleneck as data volume increases
- bulk actions are one of the highest-value workflow improvements available now

### 2. Finish reviewed and locked transaction workflow

Examples:

- explicit transaction states such as imported, coding pending, reviewed, and locked
- lock finalized transactions so they cannot be silently changed later
- allow standard users to request unlock while admins or execs can unlock directly
- surface badges for uncoded, auto-coded pending, reviewed, locked, and unlock requested

Why this matters:

- a finance workflow needs a visible boundary between coded and finalized
- locking reduces accidental edits, improves reporting confidence, and prepares the app for stronger auditability

Design direction:

- keep the core review state machine separate from unlock-request workflow state
- define exactly which fields become immutable when locked
- ensure all lock, unlock, review, and reopen actions emit audit events

Implemented:

- transactions now store reviewed/locked metadata with the acting user and timestamp
- transaction rows expose reviewed and locked badges, plus row actions to review/unreview and lock/unlock
- locked transactions are blocked from normal edit, delete, split, and transfer paths
- remaining work: unlock request workflow, bulk review/lock actions, and audit event history for workflow transitions

### 3. Clarify budget semantics, health messaging, and lightweight forecasting

Examples:

- distinguish project budget, allocated budget, actual spend, remaining allocation, and remaining headroom more explicitly
- add clearer budget-health language around uncoded exposure and over-budget status
- reduce ambiguity around what “remaining” means in each budget context
- add health states such as healthy, watch, at risk, and over budget
- introduce cautious forecasting that does not over-promise on naive burn-rate extrapolation

Why this matters:

- the underlying budget model is already strong, but the user-facing messaging can still be misread
- sharper financial semantics will make the app feel more trustworthy to finance-oriented users
- users need interpretation and risk cues, not just raw spend totals

### 4. Extend repeated-coding suggestions beyond the shipped first pass

Design note:

- see `docs/rule-suggestions-design.md` for the recommended V1 to V3 shape, trigger points, schema direction, and admin-review workflow

Examples:

- detect repeated overrides of existing rules and suggest narrowing or retargeting them
- improve confidence scoring and pattern/operator refinement beyond the current first-pass text matching
- keep strengthening the admin review queue without making it noisy or brittle

Why this matters:

- repeated manual coding is one of the clearest signals that the product can automate more of the workflow
- a suggestion layer makes the system feel smarter without forcing full ML-style complexity

Design direction:

- track patterns in a small indexed table rather than scanning raw transaction history on every edit
- distinguish clearly between create-rule suggestions and update-rule suggestions
- keep suggestions reviewable and dismissible so noisy patterns do not become brittle rules

Implemented already:

- repeated manual coding can now trigger immediate project auto-coding suggestions
- admins can review accepted-threshold repeated-pattern suggestions in the company queue and accept them into company auto-coding defaults
- inherited company auto-coding rules now sync into standards-enabled projects and can be reapplied alongside other company standards

### 5. Expand audit logging into a first-class product feature

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
- creates a defensible audit trail for sensitive finance and admin workflows

Design direction:

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

- this is still not the first implementation to start with, even though it is strategically important
- it needs careful schema, indexing, retention, and UI design before we build it
- include access and privacy-oriented events explicitly, especially changes that grant or revoke superadmin troubleshooting visibility

### 6. Extend self-service account/profile

Examples:

- account preferences worth surfacing later
- any additional self-service profile settings beyond the current name / password / verified email flows

Why this matters:

- keeps building on the now-working account basics without mixing simple profile edits with bigger admin features

## Future Features

These are worthwhile future additions, but they do not need to compete with the short near-term list above.

### Reduce shared runtime and router bundle weight

Examples:

- keep shrinking the remaining shared `main` client chunk after the UI vendor split and lazy API runtime work
- inspect router bootstrap, generated route tree weight, shared query/runtime code, and other always-loaded client infrastructure
- move heavy boot-time code behind lazy boundaries where it does not need to ship in the first paint path

Why this matters:

- the current bundle is materially better than before, but the shared client runtime is still larger than we want
- this is now more of a technical-architecture optimization than a feature gap, so it should stay visible but not crowd out near-term product work

Design direction:

- prefer structural wins such as lazy runtime loading and boot-path pruning over brittle chunk hacks
- keep the build stable and avoid Rollup chunk-cycle regressions while splitting
- measure each change against actual build output so we know which shared dependencies are still anchoring the boot bundle

### Milestone-aware budgeting and forecasting

Examples:

- optional project milestones with budgets, dates, and statuses
- milestone attribution on transaction allocations where needed
- milestone tables and charts showing budget, actuals, remaining, and forecast variance

Why this matters:

- some projects spend in phases rather than at a steady rate
- milestone-aware views make forecasting more credible for uneven or overlapping work

Design direction:

- treat milestones as optional planning objects rather than mandatory coding buckets
- store milestone attribution on allocations when split transactions exist
- make unassigned operational spend explicit so milestone totals still reconcile to project totals

### Deeper transaction review workflow

Examples:

- a clearer review-queue style experience for coding follow-up
- notification-driven queues for pending approvals, unlock requests, and aging uncoded work

Why this matters:

- transaction review is a core day-to-day workflow and still has room to become faster and more deliberate

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
- future period-based planning helpers
- richer budget health bands and future forecast logic

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

Current solution and reasoning:

- taxonomy modals currently use `lockScroll={false}` because Mantine scroll locking appeared to be the real source of the stuck-scroll state in Zen/Firefox
- some modal-based rule editors also use a Firefox-safe dropdown configuration that avoids Mantine's internal dropdown `ScrollArea`
- this leaves a small UX compromise where background/window scrolling can still occur while some modal interactions are open, but it avoids the more serious broken-scroll failure mode

Design direction:

- keep the current targeted workaround for now because it is stable and low-risk
- later, re-evaluate whether the better long-term answer is a Mantine upgrade, a more surgical modal configuration, or moving the most complex taxonomy editors out of modal context altogether

### Search and filtering maturity

Examples:

- better transaction search
- richer cross-project filtering
- saved or more guided filter states

Why this matters:

- once data grows, finding and narrowing data quickly becomes as important as editing it

### Data export and portability

Examples:

- shipped: company Excel export with full/detail summary modes, active/all scope, transaction date filters, reporting rollups, background job generation, and optional ready-email notification
- shipped: workbook payloads now persist in S3-compatible object storage while job state, authorization, and retention metadata remain in the application database
- shipped: export payload retention is now 24 hours with stale/failed cleanup that also removes stored objects
- next: continue hardening the BI/export contract only where downstream consumers prove they need it, plus optional workbook polish such as protected report tabs or branded coversheets
- future: project-level export variants only if users prove they need a narrower handoff than the current company workbook

Why this matters:

- most business users eventually expect to move data out for reporting, review, or handoff

### Notifications and exception workflows

Examples:

- uncoded transactions added
- auto-coded pending approvals waiting too long
- unlock request submitted or resolved
- project budget risk thresholds crossed
- rule suggestions ready for review

Why this matters:

- users should not have to poll projects manually to catch operational exceptions
- lightweight in-app notifications will make review workflows more proactive

Design direction:

- start with in-app notifications only
- add deduping and throttling rules early so repeated events do not become noise

## Not A Priority Right Now

- large table-layer replacement work beyond the current Mantine 9 + `mantine-react-table-open` stack unless the fork becomes unmaintained or product needs outgrow it
- replacing the app company model with BetterAuth organizations
- automatic account switching after password reset
- large visual redesign work

Those can wait unless product requirements change.
