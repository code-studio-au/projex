# Product Backlog

This backlog contains only unfinished work. Completed work belongs in Git history and feature documentation, not here.

## Awaiting Product Decision

### Expand audit logging into a first-class product feature

Standing TODO: confirm the organisation's audit-retention, access, privacy, and
export requirements before expanding the current immutable event history into
an administrator-facing product.

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

- immutable workflow events already support important transaction review,
  locking, import, reversal proposal/approval, and structural-integrity paths
- remaining work needs careful event-coverage, schema, indexing, retention,
  access, export, and admin-UI design
- do not choose retention periods or expose a broad audit UI until the
  organisation confirms its governance requirements
- include access and privacy-oriented events explicitly, especially changes that grant or revoke superadmin troubleshooting visibility

## Future Features

These are worthwhile future additions without a committed delivery order.

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
