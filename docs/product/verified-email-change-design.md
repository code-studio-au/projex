# Verified Email Change

This document records the shipped verified-email-change workflow and its
security boundaries.

## Status

The feature is implemented. A signed-in user can request a new login email from
Account settings, inspect the pending request, resend the verification message,
cancel it, and confirm ownership through the emailed link. The active login
email does not change until confirmation succeeds.

## Product Flow

1. The signed-in user submits a syntactically valid email different from their
   current address.
2. The server checks both the application `users` table and BetterAuth's
   `ba_user` table for conflicts.
3. The server replaces any older pending request for that user, stores a hash
   of a new verification token, and sends the raw token only in the link to the
   requested address.
4. Account settings shows the pending address and expiry and offers resend and
   cancel actions.
5. The `/verify-email-change` page submits the token to the confirmation
   endpoint.
6. Confirmation rechecks expiry, one-time use, and address availability, then
   updates the application and BetterAuth email rows in one database
   transaction and removes the pending request.

Future sign-ins and password resets use the new address. The current
implementation does not explicitly revoke existing sessions when confirmation
succeeds.

## Routes And Ownership

- `src/pages/AccountPage.tsx` owns the request, pending, resend, and cancel UI.
- `src/pages/VerifyEmailChangePage.tsx` owns confirmation-link feedback.
- `src/routes/api.me.email-change.ts` exposes pending-read, request, and cancel
  HTTP behavior.
- `src/routes/api.me.email-change.resend.ts` exposes resend behavior.
- `src/routes/api.me.email-change.confirm.ts` exposes token confirmation.
- `src/server/fns/account.ts` owns validation, availability checks, token
  lifecycle, delivery, and the atomic identity update.
- `src/server/email/authMessages.ts` owns the escaped verification message.
- `email_change_requests` stores pending requests; the raw token is never
  stored.

The Account route preloads the current user and pending request through the
shared query boundary. Response bodies are validated by the account response
schemas before the UI consumes them.

## Security Contract

### Request ownership

Reading, creating, resending, and cancelling a pending request requires the
verified current user. Confirmation is intentionally authenticated by the
single-purpose token so the emailed link can work without relying on an
existing browser session.

### Token handling

- Tokens contain 32 random bytes and are represented as hexadecimal text.
- Only a SHA-256 token hash is stored in Postgres.
- Requests expire after one hour.
- Creating or resending a request invalidates the previous token by replacing
  the user's pending request.
- Successful confirmation deletes the request, preventing replay.
- Missing, expired, consumed, or unknown tokens return the same safe conflict
  response.

### Conflict and consistency handling

The target address is checked case-insensitively against both identity tables
when the request is created and again when it is confirmed. Conflicts use the
privacy-safe message `That email address is not available.`

Confirmation updates `users.email` and `ba_user.email` and removes the pending
request in one Postgres transaction. A failure therefore cannot commit only one
identity update.

### Rate limiting

Request and resend operations are independently limited to five attempts per
ten minutes for the verified user. The confirmation token's entropy and
one-hour lifetime are the primary protection for the public confirmation
endpoint.

### Email and URL handling

`PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL` selects the public confirmation page
and falls back to `${BETTER_AUTH_URL}/verify-email-change`. Delivery uses the
shared Resend or webhook auth-email boundary, and the HTML message escapes
user-controlled values.

Never log the requested email, raw token, verification URL, provider body, or
email contents. Normal request outcomes may use the centralized sanitized
operational logger. Email-change-specific audit-category events are not
currently emitted; durable administrator-facing audit history remains a
separate product and governance decision.

## User-Visible States

Account settings provides:

- a new-email input and `Send verification email` action
- a pending panel showing the requested address, request time, and expiry
- `Resend verification` and `Cancel request` actions
- the latest success or failure feedback

The confirmation page distinguishes a missing token, an invalid or expired
link, and a successful change without exposing account-conflict detail.

## Current Verification

Repository verification covers:

- email-change request and response schemas
- redirect environment validation
- HTML escaping in the verification message
- server smoke for request, pending-state read, resend, cancel, and cleanup
- route and response-boundary inclusion

The token-confirmation transaction, replay, expiry, and late-conflict paths do
not yet have a dedicated database integration test. Add that coverage before
changing token storage, confirmation authentication, identity-table updates,
or session behavior.

## Intentional Non-Goals

- changing an email without verifying the new inbox
- administrator-forced identity reassignment
- keeping multiple pending requests valid
- automatically invalidating every existing session
- treating operational logs as a durable email-change audit trail
