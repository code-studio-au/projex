# Product Backlog

This backlog captures the next most useful product, admin, and operational improvements after the recent auth, account, privacy, and system-checks work.

It is intentionally short, opinionated, and ordered so we can pick the next job quickly.

## Product/Admin

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

### 2. Add reviewed and locked transaction workflow

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

### 4. Add rule suggestions from repeated manual coding

Examples:

- suggest a new auto-map rule after the same vendor or description pattern is manually coded several times
- suggest updating an existing rule when users consistently override it the same way
- give admins a rule-suggestions queue rather than requiring them to spot patterns manually

Why this matters:

- repeated manual coding is one of the clearest signals that the product can automate more of the workflow
- a suggestion layer makes the system feel smarter without forcing full ML-style complexity

Design direction:

- track patterns in a small indexed table rather than scanning raw transaction history on every edit
- distinguish clearly between create-rule suggestions and update-rule suggestions
- keep suggestions reviewable and dismissible so noisy patterns do not become brittle rules

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

### Split transactions with parent-child allocation model

Examples:

- split one imported transaction across multiple projects, categories, subcategories, or milestones
- keep the original imported transaction as the source-of-truth parent
- show child allocations as expandable rows beneath the parent

Why this matters:

- shared invoices and apportioned costs are normal finance workflows
- splitting needs to preserve reconciliation back to the imported source record

Design direction before implementation:

- keep the imported parent as a source record and store financial allocations in a dedicated child table
- decide reporting semantics up front so parent amounts are excluded from spend totals once split allocations exist
- put review and approval state on child allocations, not just the parent, so mixed states are representable without ambiguity
- keep the parent in a simpler structural state such as unsplit, split draft, split complete, or split locked rather than mixing coding review into the parent
- separate unlock-request records from the transaction or allocation row so repeated requests remain auditable
- define exactly how parent and child locking interact before building UI flows

Why this tightening matters:

- split children create a second review surface, and unclear parent-child state will leak into reporting, approvals, forecasting, and audit logs
- getting the data model right first will avoid expensive rework later

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

### Search and filtering maturity

Examples:

- better transaction search
- richer cross-project filtering
- saved or more guided filter states

Why this matters:

- once data grows, finding and narrowing data quickly becomes as important as editing it

### Data export and portability

Examples:

- export transactions
- export budgets
- export project or company summaries

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

### Project and company deletion safety

Examples:

- stronger typed confirmation for destructive actions
- clearer dependency warnings before delete
- future restore windows or softer deletion flows where appropriate

Why this matters:

- destructive admin actions deserve extra friction and clearer consequences in a finance/admin product

## Not A Priority Right Now

- Mantine 9 migration until `mantine-react-table` has a compatible release or we replace the table layer
- replacing the app company model with BetterAuth organizations
- automatic account switching after password reset
- large visual redesign work

Those can wait unless product requirements change.
