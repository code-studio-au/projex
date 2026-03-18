# Product Backlog

This backlog captures the next most useful product, admin, and operational improvements after the server-auth stabilization pass.

It is intentionally short, opinionated, and ordered. The goal is to help us pick the next job quickly without having to reconstruct context from chat history.

## Near-Term

### 1. Add an explicit `Send invite email` admin action pattern

Current state:

- adding an existing BetterAuth user to a company now also sends a password setup/reset email
- this works, but it is broader behavior than we may want long term

Recommended refinement:

- keep the current working behavior for now
- later, add an explicit `Send invite email` action in company settings so admins can resend onboarding deliberately

Why this matters:

- makes admin intent clearer
- reduces surprise for existing users
- keeps onboarding flexible without reverting to manual recovery steps

## Product/Admin

### 2. Add a small admin audit trail for company membership changes

Examples:

- company member added
- company member removed
- invite email resent
- company role changed

Why this matters:

- improves support/debugging when someone says "I was removed" or "I never got invited"
- gives admins confidence when managing access

### 3. Add self-service account/profile basics

Examples:

- change password while logged in
- update display name
- view current company memberships

Why this matters:

- reduces dependence on admin actions for common account changes
- rounds out the now-working auth surface

### 4. Add company-member lifecycle safeguards

Examples:

- prevent removing the last superadmin by mistake
- clearer confirmation copy when removing a user from a company
- optional warning if removal will also remove project memberships

Why this matters:

- protects against lockout and accidental admin mistakes
- makes the existing membership cascade behavior easier to understand

## Testing

### 5. Add an end-to-end auth smoke test

Suggested flow:

1. sign in
2. open companies
3. open a project
4. refresh project page
5. request password reset

Why this matters:

- these were the highest-friction bugs in the stabilization work
- a small smoke test would pay for itself quickly

### 6. Add an invite-flow smoke test

Suggested flow:

1. invite a user
2. verify success response
3. request resend invite
4. verify success response

Why this matters:

- protects the new admin onboarding flow
- helps catch env/config regressions around Resend

## UX Polish

### 7. Polish reset/invite success states

Examples:

- stronger confirmation copy after forgot password
- clearer post-reset instruction to sign in with the updated password
- consistent wording between "invite", "password setup", and "reset email"

Why this matters:

- reduces confusion in the auth journey
- makes the onboarding flow feel more intentional

### 8. Continue small-table UX cleanup

Examples:

- keep action buttons visually consistent across striped rows
- maintain stable editing flows in transactions
- review any remaining dense tables for awkward wrapping or hidden actions

Why this matters:

- these small frictions add up in a finance/admin app
- the table-heavy workflows are core product paths

## Infra / Operations

### 9. Remove the `NODE_ENV=production` Vite warning at build time

Current state:

- builds succeed
- Vite still warns that `NODE_ENV=production` in env files is not the supported pattern

Why this matters:

- reduces noise during deploys
- makes future debugging cleaner

### 10. Finish domain hardening

Examples:

- move from `http://projectexpensetracker.com` to HTTPS everywhere
- align canonical auth/reset URLs to HTTPS only
- confirm nginx/server config matches the canonical public origin

Why this matters:

- reduces mixed-origin/auth confusion
- production auth should not stay on plain HTTP

### 11. Add a short operational runbook for email delivery

Examples:

- verify Resend env vars
- how to test email delivery from EC2
- what to check if delivery is delayed or lands in spam

Why this matters:

- invite/reset is now a core workflow
- email delivery troubleshooting should be easy to repeat

## Nice To Have

### 12. Improve multi-account testing ergonomics

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
