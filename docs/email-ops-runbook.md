# Email Ops Runbook

This runbook covers invite and password-reset delivery for the live Resend-backed setup.

## Purpose

Use this when:

- invite emails are not arriving
- forgot-password emails are delayed
- resend-invite behavior is unclear
- you need to verify email delivery from EC2

## Required Runtime Env

In `/etc/projex/projex.env`:

```bash
RESEND_API_KEY=...
RESEND_BASE_URL=https://api.resend.com
RESEND_FROM='Projex <noreply@projectexpensetracker.com>'
PROJEX_AUTH_RESET_REDIRECT_URL=https://projectexpensetracker.com/reset-password
```

Notes:

- `RESEND_FROM` must use a verified domain/sender in Resend.
- `PROJEX_AUTH_RESET_REDIRECT_URL` should match the public HTTPS reset page users open from email.

## What The App Sends

- Company invite:
  - creates or reuses a BetterAuth user
  - adds the user to the company
  - requests a password-setup/reset email
- Resend invite:
  - requests another password-setup/reset email for an existing company member
- Forgot password:
  - requests a password reset email for the entered address

## Fast Env Check

On EC2:

```bash
sudo sh -c '. /etc/projex/projex.env && printf "RESEND_API_KEY=%s\nRESEND_FROM=%s\nRESEND_BASE_URL=%s\nPROJEX_AUTH_RESET_REDIRECT_URL=%s\n" "${RESEND_API_KEY:+set}" "$RESEND_FROM" "$RESEND_BASE_URL" "$PROJEX_AUTH_RESET_REDIRECT_URL"'
```

Expected:

- `RESEND_API_KEY=set`
- `RESEND_BASE_URL=https://api.resend.com`
- `RESEND_FROM=Projex <...>`
- `PROJEX_AUTH_RESET_REDIRECT_URL=https://projectexpensetracker.com/reset-password`

## Direct Resend Test From EC2

Replace the recipient email and run:

```bash
sudo sh -c '. /etc/projex/projex.env && curl -sS -D - https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$RESEND_FROM\",\"to\":[\"you@example.com\"],\"subject\":\"Projex Resend test\",\"text\":\"Resend is connected from EC2.\"}"'
```

Expected:

- HTTP `200` or `202`

If this fails:

- the issue is with Resend config, sender verification, or network reachability
- it is not an app invite-flow problem yet

## App-Level Checks

Recent app logs:

```bash
sudo journalctl -u projex -n 100 --no-pager
```

Useful things to look for:

- invite API call succeeded:
  - `POST /api/companies/<companyId>/users`
- resend invite API call succeeded:
  - `POST /api/companies/<companyId>/users/<userId>/invite`
- forgot password request succeeded:
  - `POST /api/auth/request-password-reset`

## Expected Behavior

- invite email may arrive with a short delay
- email may land in spam/junk initially
- immediate resend can be rate-limited by the password-reset path

The smoke test now treats an immediate resend rate-limit as acceptable.

## Common Failure Modes

### 1. No email received, no provider event

Check:

- `RESEND_API_KEY`
- `RESEND_FROM`
- verified sender/domain status in Resend

### 2. Provider accepts email, but inbox does not show it

Check:

- spam/junk folders
- mailbox delay
- sender reputation and DNS already verified in Resend

### 3. Invite succeeds but user says they never got an email

Possible causes:

- the address already existed and was only added to the company
- the resend action was not triggered
- the email was accepted but delayed or filtered

### 4. Immediate resend fails

Likely cause:

- expected rate limiting on the password-reset endpoint

That is acceptable in the smoke flow if the initial invite was successful.
