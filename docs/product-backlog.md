# Product Backlog

This backlog captures the next most useful product, admin, and operational improvements after the recent auth, account, privacy, and system-checks work.

It is intentionally short, opinionated, and ordered so we can pick the next job quickly.

## Urgent Product Requests

These have been raised as urgent feature priorities and should be shaped before the previous near-term product backlog.

### 1. Add transaction comments and threaded resolution workflow

Examples:

- company members can add notes/comments directly to transaction line items
- comments show author name and created date/time
- comments support replies/sub-comments so discussion stays attached to the original point
- comments can mention or assign company members using an `@member_name` style interaction
- assigned members can see that a transaction comment needs their attention
- comments can be marked resolved while keeping the history visible

Why this matters:

- transaction coding often needs clarification from the project team, not just finance/admin edits
- keeping discussion attached to the transaction avoids context being lost in chat or email
- assignment and resolution turn comments into a lightweight workflow rather than passive notes

Design direction:

- model comments as first-class rows with author, created/updated timestamps, optional parent comment, optional assigned user, and resolved metadata
- preserve comment history for auditability; avoid hard-deleting comments by default
- use company membership as the assignment/search boundary so users cannot tag people outside the company
- decide notification behaviour separately so the core comment model does not depend on a future notification system

### 2. Split transactions into fully allocated child line items

Examples:

- split one imported transaction into two or more child sub-transactions
- child sub-transactions can be coded to different categories/subcategories
- child subtotals are reflected in budget and spend reporting
- the original rolled-up transaction remains visible as the imported source record
- the original rolled-up transaction becomes uncategorisable once split
- the original rolled-up transaction total is excluded from budget/spend calculations once split
- the split cannot be accepted while any remainder is unallocated

Why this matters:

- one imported transaction can represent multiple purchases that need different coding
- budget reporting must reflect the real allocation, not the raw bank/import line, once a split exists
- preserving the original transaction keeps reconciliation back to imported data intact

Design direction:

- keep the imported parent transaction immutable as the source/reconciliation record
- store split children as allocation rows or child transactions linked to the parent
- enforce that child allocation totals exactly equal the parent amount before activating the split
- keep draft split edits out of spend totals until the split is fully allocated and accepted
- prevent category/subcategory coding on the split parent after activation
- make reporting explicitly exclude split parents and include accepted split children

### 3. Move transactions or split child transactions between projects

Examples:

- move a transaction, or one child from a split transaction, to another project in the same company
- the receiving project sees it as a new uncoded transaction requiring local coding
- the original project keeps a visible transfer/source row for traceability
- the original-side transfer row is uncategorisable
- the original-side transfer row does not affect the original project budget/spend totals
- transfers are limited to projects within the same company

Why this matters:

- imported data may land in the wrong project even though the cost belongs elsewhere
- teams need cross-project correction without losing the source/import history
- project budgets must not double-count transferred amounts

Design direction:

- treat project moves as explicit transfer records rather than destructive edits to the original transaction
- preserve source transaction identity and transfer linkage for audit/reconciliation
- create a receiving-side transaction or allocation that must be coded in the destination project
- exclude the original-side transfer marker from budget/spend calculations
- require same-company validation at the server and database boundary
- define how transfers interact with split parents and split children before implementation

## Product/Admin

### 4. Add bulk transaction review actions

Examples:

- bulk approve auto-mapped transactions
- bulk recode selected rows
- bulk clear coding
- bulk milestone assignment when milestone modeling exists
- future reviewed / locked actions once transaction workflow state is explicit

Why this matters:

- row-by-row transaction review will become the main bottleneck as data volume increases
- bulk actions are one of the highest-value workflow improvements available now

### 5. Add reviewed and locked transaction workflow

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

### 6. Clarify budget semantics, health messaging, and lightweight forecasting

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

### 7. Add rule suggestions from repeated manual coding

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

### 8. Expand audit logging into a first-class product feature

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

### 9. Extend self-service account/profile

Examples:

- account preferences worth surfacing later
- any additional self-service profile settings beyond the current name / password / verified email flows

Why this matters:

- keeps building on the now-working account basics without mixing simple profile edits with bigger admin features

## Completed Baseline Improvements

These items were important enough to track, but are now implemented as baseline product/operational hygiene rather than active backlog work.

### Smoke prep and cleanup automation

Implemented:

- generated per-run smoke fixtures are available through the generated smoke command
- generated smoke users, memberships, companies, projects, and test data are cleaned up after runs
- `smoke:cleanup` can be run separately as a best-effort sweep for abandoned generated smoke data
- the workflow keeps bootstrap/admin identity separate from disposable per-run fixtures

Residual follow-up:

- run the generated smoke workflow against staging once AWS staging exists
- keep staging runbooks aligned with any future smoke command changes

### Project and company deletion safety

Implemented:

- destructive delete actions require typing `DELETE <name>` in the UI
- delete requests carry the confirmation text to the server
- server-side delete handlers validate confirmation against the persisted company/project name before deleting
- company deletion still requires the company to be deactivated first
- project deletion still requires the project to be archived first
- delete copy now gives clearer dependency warnings for related projects, budgets, transactions, taxonomy, and memberships

Residual follow-up:

- consider future restore windows or softer deletion flows if product requirements call for recoverability

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

## Not A Priority Right Now

- Mantine 9 migration until `mantine-react-table` has a compatible release or we replace the table layer
- replacing the app company model with BetterAuth organizations
- automatic account switching after password reset
- large visual redesign work

Those can wait unless product requirements change.
