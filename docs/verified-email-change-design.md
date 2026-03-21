# Verified Email Change Design

This note defines the intended design for letting a signed-in user change their login email safely.

It is intentionally a design/spec document, not an implementation plan to rush straight into code.

## Goal

Allow a logged-in user to change their account email without:

- breaking BetterAuth identity state
- losing app-level user linkage
- creating ambiguous duplicate accounts
- switching login/recovery email before the new address is proven to be under the user's control

## Why This Needs More Care Than Display Name Or Password

Email is not just profile data in Projex. It is also:

- the BetterAuth login identifier
- the address used for password reset and invite/setup email
- duplicated in app-level `users.email`

A naive update would risk:

- locking the user out because of a typo
- moving login to an unverified or mistyped address
- drifting BetterAuth and app-domain user records out of sync
- creating collisions with an existing account using the target email

## Recommended Product Flow

### 1. Start request from Account settings

The signed-in user enters a new email address from the `Account` page.

Validation:

- require a syntactically valid email
- reject if it matches the current email
- reject obvious duplicates if the target email is already in use

### 2. Create a pending email-change request

Do not immediately mutate the active account email.

Instead:

- create a short-lived pending email-change record tied to the current user
- store:
  - user id
  - current email
  - requested new email
  - verification token hash
  - requested at
  - expires at
  - consumed at

### 3. Send verification email to the new address

Send a message to the requested email with a single-purpose verification link.

The link should confirm:

- the user controls the new inbox
- the email-change request is still valid

Suggested message:

- "Confirm your new Projex email address"

### 4. Confirm via the emailed link

When the user opens the verification link:

- verify token validity
- verify request is unexpired and unused
- verify the target email is still available

Only then:

- update BetterAuth email
- update app `users.email`
- mark the request consumed

### 5. Show a clear post-confirmation state

After success:

- show a confirmation page
- instruct the user that future sign-ins and password resets now use the new email

## Data Consistency Rules

The BetterAuth user row and app `users` row must be updated together as one logical operation.

Preferred rule:

- if either update fails, treat the whole operation as failed and do not leave partial state behind

This likely means:

- one server-side function that performs all checks
- one transaction for app-domain state
- careful sequencing around the BetterAuth update if it lives in the same database

## Conflict Rules

The flow should explicitly reject:

- new email already belongs to another BetterAuth user
- new email already belongs to another app user
- stale verification link where the email is no longer available

The user-facing message should stay privacy-safe, for example:

- "That email address is not available."

## Security Requirements

### Verify the new email before switching

This is mandatory.

Do not:

- immediately overwrite the active email
- allow unverified new email to become the login identifier

### Require the user to already be signed in to request the change

This is a self-service account action, not a public unauthenticated flow.

### Expire requests quickly

Recommended:

- 30 to 60 minutes

### Allow only the latest active request

When a new email-change request is created for the same user:

- invalidate or supersede older pending requests

This prevents confusion from multiple valid links.

### Audit later

When the audit system is built, add events for:

- email change requested
- email change confirmed
- email change failed due to conflict/expiry

## Suggested UI States

### Account page

- editable "New email" input
- button: `Send verification email`
- note that the active login email does not change until verified

### Pending state

After request:

- show the requested email
- show a message like:
  - "Check your new inbox to confirm the change."

Optional later:

- allow resend verification
- allow cancel pending change

### Confirmation page

If the link is valid:

- complete the update
- show success

If invalid/expired:

- show a safe error
- point the user back to Account settings to start again

## Edge Cases

### User is already signed in elsewhere

This should not block the email change.

However, after confirmation:

- existing sessions may need to stay valid or be reviewed deliberately later

Recommended first pass:

- keep existing sessions valid
- future logins use the new email

### User mistypes new email

This is exactly why verification is required before mutation.

### User never clicks the link

No account change should occur.

Expired pending requests can be cleaned up later.

### New email receives invite/reset emails before confirmation

Do not route account ownership to the new email until verification is complete.

## Implementation Shape

When we build this, the likely pieces are:

1. Account page form update
2. new server route/function to create pending email-change request
3. email template + send function for verification email
4. new confirmation route/page
5. server function to consume token and switch email
6. DB table for pending email-change requests
7. later audit events

## Out Of Scope For First Pass

- changing email without verification
- admin-forced email reassignment
- multi-step approval flows
- session invalidation across all devices

## Recommendation

When we implement this, we should build it as:

- a verified new-email flow
- with an explicit pending state
- with BetterAuth and app-domain email updates kept in sync

That is the simplest version that is still secure and supportable.
