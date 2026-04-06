# Product Backlog

This backlog captures the next most useful product, admin, and operational improvements after the recent auth, account, privacy, and system-checks work.

It is intentionally short, opinionated, and ordered so we can pick the next job quickly.

## Product/Admin

### 1. Add a full audit log with retention by event type

Examples:

- company member added or removed
- company role changed
- invite email resent
- email change requested / resent / cancelled / confirmed
- project superadmin support access toggled on/off
- project visibility changed
- budget changes
- transaction coding and uncoding changes
- category and subcategory changes
- other user-entered or user-changed business data updates

Why this matters:

- gives company admins visibility into who changed what and when
- improves support/debugging without relying on memory or chat history
- creates a defensible audit trail for sensitive finance/admin workflows

Design direction:

- audit broadly across meaningful user-entered and user-changed actions
- show the audit trail to company admins
- support retention policies by event class rather than one global retention window

Examples of retention strategy:

- company membership and company-role changes: keep indefinitely
- project settings / visibility changes: keep long-term
- transaction coding changes: short retention window such as 5 days
- high-volume operational edits: shorter retention to control storage growth

Notes:

- this is intentionally not an immediate implementation
- it needs careful schema, indexing, retention, and UI design before we build it
- include access/privacy-oriented events explicitly, especially changes that grant or revoke superadmin troubleshooting visibility

### 2. Extend self-service account/profile

Examples:

- account preferences worth surfacing later
- any additional self-service profile settings beyond the current name / password / verified email flows

Why this matters:

- keeps building on the now-working account basics without mixing simple profile edits with bigger admin features

## Infra / Operations

### 3. Add a separate maintenance/monitor page for restarts

Current state:

- when the app server is restarting, nginx can surface a `502 Bad Gateway`
- that is technically accurate, but not a good operator or user-facing experience
- public web hardening has already been completed:
  - browser/security headers are now owned by nginx
  - `/api/ready` now returns a minimal body
  - nginx no longer exposes its exact version

Recommended direction:

- host a very small page outside the app lifecycle
- when the app is unavailable, route to a friendly maintenance screen such as `Server restarting...`
- have that page poll a lightweight app endpoint or the login page
- redirect back automatically once the app is healthy again

Why this matters:

- gives us a cleaner restart/deploy experience
- avoids exposing raw upstream errors during expected maintenance windows
- gives us a foundation for future maintenance messaging without tying it to the app process

## Future Features

These are worthwhile future additions, but they do not need to compete with the short near-term list above.

### Import diagnostics and reconciliation

Examples:

- stronger duplicate-detection visibility during import
- import preview summaries before commit
- clearer row-level warnings
- better post-import reconciliation messaging

Why this matters:

- the importer is already usable, but a mature finance workflow benefits from stronger visibility and confidence before data lands

### Deeper transaction review workflow

Examples:

- faster review flows for uncoded and auto-mapped transactions
- stronger batch review actions
- a clearer review-queue style experience for coding follow-up

Why this matters:

- transaction review is a core day-to-day workflow and still has room to become faster and more deliberate

### Budget management ergonomics

Examples:

- duplicate or copy budget lines
- import/export budgets
- budget templates
- future period-based planning helpers

Why this matters:

- budget setup still works, but repeated admin effort will become more noticeable as usage grows

### Executive reporting depth

Examples:

- export from the company summary
- sort by overspend or risk
- trend views
- category rollups across projects

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
