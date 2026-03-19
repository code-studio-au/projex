# Product Backlog

This backlog captures the next most useful product, admin, and operational improvements after the server-auth stabilization pass.

It is intentionally short, opinionated, and ordered. The goal is to help us pick the next job quickly without having to reconstruct context from chat history.

## Near-Term

### 1. Refine existing-user invite behavior

Current state:

- company settings now supports re-sending invite/setup emails explicitly
- adding an existing BetterAuth user to a company also triggers the email flow

Recommended refinement:

- keep the current working behavior for now
- later, separate "add member" from "send invite email" more explicitly if admin noise becomes a concern

Why this matters:

- makes admin intent clearer
- reduces surprise for existing users
- keeps onboarding flexible without reverting to manual recovery steps

## Product/Admin

### 2. Add a full audit log with retention by event type

Examples:

- company member added
- company member removed
- invite email resent
- company role changed
- project superadmin support access toggled on/off
- project visibility changed
- budget values changed
- transaction coding/uncoding changes
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

- verified email change flow
- any additional account preferences that are worth surfacing later

Why this matters:

- keeps building on the now-working account basics without mixing simple profile edits with security-sensitive email changes

### 4. Add company-member lifecycle safeguards

Examples:

- prevent an admin from removing themselves if they are the last admin in that company
- clearer confirmation copy when removing a user from a company
- optional warning if removal will also remove project memberships

Why this matters:

- protects against lockout and accidental admin mistakes
- makes the existing membership cascade behavior easier to understand

### 5. Refine superadmin data access into explicit support access

Current state:

- superadmin currently has broad troubleshooting visibility across companies/projects
- this is useful for support, QA, and bug fixing
- it is not the right long-term privacy model for real customer data

Recommended direction:

- keep current superadmin visibility for now
- when a superadmin creates a company, allow assigning the initial company admin at creation time
- later, add a project settings toggle such as `Allow superadmin access`
- keep the toggle default `on` for now during active development/support
- later switch the default `off` when customer privacy becomes the higher priority

Why this matters:

- preserves practical support access while the product is still maturing
- creates a clear path toward explicit customer consent for project-level support visibility
- avoids locking support out before a replacement access model exists

## Testing

### 6. Continue evolving the auth smoke test

Suggested flow:

1. sign in
2. open companies
3. open a project
4. refresh project page
5. request password reset

Why this matters:

- these were the highest-friction bugs in the stabilization work
- a small smoke test would pay for itself quickly

### 7. Continue evolving the invite-flow smoke test

Suggested flow:

1. invite a user
2. verify success response
3. request resend invite
4. verify success response

Why this matters:

- protects the new admin onboarding flow
- helps catch env/config regressions around Resend

## UX Polish

### 8. Polish reset/invite success states

Examples:

- stronger confirmation copy after forgot password
- clearer post-reset instruction to sign in with the updated password
- consistent wording between "invite", "password setup", and "reset email"

Why this matters:

- reduces confusion in the auth journey
- makes the onboarding flow feel more intentional

### 9. Continue small-table UX cleanup

Examples:

- keep action buttons visually consistent across striped rows
- maintain stable editing flows in transactions
- review any remaining dense tables for awkward wrapping or hidden actions
- review whether `project.description` is actually needed anywhere in the product; if not, remove it from the model/UI rather than leaving it as dead weight

Why this matters:

- these small frictions add up in a finance/admin app
- the table-heavy workflows are core product paths

## Infra / Operations

## Nice To Have

### 13. Improve multi-account testing ergonomics

Examples:

- clearer note after password reset if another user is currently signed in
- optional "Return to sign in" path after reset

Why this matters:

- mostly a team/testing edge case
- low priority for real users, but useful during QA

## Not A Priority Right Now

- replacing the app company model with BetterAuth organizations
- automatic account switching after password reset
- large visual redesign work

Those can wait unless product requirements change.
