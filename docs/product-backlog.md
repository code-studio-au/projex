# Product Backlog

This backlog captures the next most useful product, admin, and operational improvements after the recent auth, account, privacy, and system-checks work.

It is intentionally short, opinionated, and ordered so we can pick the next job quickly.

## Near-Term

### 1. Refine existing-user invite behavior

Current state:

- company settings supports explicit re-send invite/setup emails
- adding an existing BetterAuth user to a company also triggers the email flow

Recommended refinement:

- keep the current working behavior for now
- later, separate `Add member` from `Send invite email` more explicitly if admin noise becomes a concern

Why this matters:

- makes admin intent clearer
- reduces surprise for existing users
- keeps onboarding flexible without reverting to manual recovery steps

## Product/Admin

### 2. Add a full audit log with retention by event type

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

### 3. Extend self-service account/profile

Examples:

- account preferences worth surfacing later
- any additional self-service profile settings beyond the current name / password / verified email flows

Why this matters:

- keeps building on the now-working account basics without mixing simple profile edits with bigger admin features

### 4. Continue refining superadmin support access

Current state:

- project-level `Allow superadmin access` exists and defaults on
- initial company admin assignment during company creation exists

Recommended next direction:

- later switch the default support-access toggle to `off` when customer privacy becomes the higher priority
- keep tightening any remaining places where support access should be explicit and unsurprising
- add audit coverage for support-access changes when the audit system is built

Why this matters:

- preserves practical support access while the product is still maturing
- creates a clear path toward explicit customer consent for project-level troubleshooting visibility

## Testing

### 5. Continue evolving system-check coverage

Suggested areas:

- keep improving section-level retries and resilience to rate limits
- add coverage for any newly added account/admin workflows
- keep CLI and admin UI system checks aligned so they do not drift

Why this matters:

- the smoke/system-check tooling is now a real operational tool
- it will keep paying off as more account/admin workflows are added

### 6. Continue evolving invite and email-flow checks

Suggested areas:

- invite user
- resend invite
- password reset
- verified email change
- cancellation / resend paths for pending email change

Why this matters:

- protects the most fragile auth and onboarding paths
- helps catch env/config regressions around Resend and BetterAuth

## UX Polish

### 7. Polish reset/invite success states

Examples:

- stronger confirmation copy after forgot password
- clearer post-reset instruction to sign in with the updated password
- consistent wording between `invite`, `password setup`, and `reset email`

Why this matters:

- reduces confusion in the auth journey
- makes the onboarding flow feel more intentional

### 8. Continue small-table UX cleanup

Examples:

- keep action buttons visually consistent across striped rows
- maintain stable editing flows in transactions
- review any remaining dense tables for awkward wrapping or hidden actions
- add an `Auto-mapped pending approval` filter/view in transactions
- add an `Accept all auto-mappings` bulk action for pending auto-mapped rows
- improve company default mapping rule help text with clearer matching guidance and examples

Why this matters:

- these small frictions add up in a finance/admin app
- the table-heavy workflows are core product paths

## Infra / Operations

### 9. Add a separate maintenance/monitor page for restarts

Current state:

- when the app server is restarting, nginx can surface a `502 Bad Gateway`
- that is technically accurate, but not a good operator or user-facing experience

Recommended direction:

- host a very small page outside the app lifecycle
- when the app is unavailable, route to a friendly maintenance screen such as `Server restarting...`
- have that page poll a lightweight app endpoint or the login page
- redirect back automatically once the app is healthy again

Why this matters:

- gives us a cleaner restart/deploy experience
- avoids exposing raw upstream errors during expected maintenance windows
- gives us a foundation for future maintenance messaging without tying it to the app process

## Nice To Have

### 10. Improve multi-account testing ergonomics

Examples:

- clearer note after password reset if another user is currently signed in
- optional `Return to sign in` path after reset

Why this matters:

- mostly a team/testing edge case
- low priority for real users, but useful during QA

## Not A Priority Right Now

- Mantine 9 migration until `mantine-react-table` has a compatible release or we replace the table layer
- replacing the app company model with BetterAuth organizations
- automatic account switching after password reset
- large visual redesign work

Those can wait unless product requirements change.
