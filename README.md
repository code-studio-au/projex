# Projex

Project and grant budget tracking app.

Projex is a TanStack Start, React, TypeScript, BetterAuth, and Postgres app. The UI talks through the stable `ProjexApi` boundary, while server-backed behavior lives behind TanStack Start API routes and `src/server/fns/*`.

## Quick Start

```bash
npm install
npm run dev
```

Useful checks before handing work over or opening a PR:

```bash
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Local Server Utilities

```bash
# Apply BetterAuth + app SQL migrations to DATABASE_URL
npm run db:migrate

# Create a BetterAuth user
PROJEX_AUTH_EMAIL=... PROJEX_AUTH_PASSWORD=... PROJEX_AUTH_NAME=... npm run auth:create-user

# Bootstrap the first app-side global superadmin on a fresh database
PROJEX_AUTH_EMAIL=... PROJEX_BOOTSTRAP_COMPANY_NAME="Demo Company" PROJEX_BOOTSTRAP_PROJECT_NAME="Demo Project" npm run auth:bootstrap-user

# Link an existing BetterAuth user into the app and grant global superadmin
PROJEX_AUTH_EMAIL=... PROJEX_APP_TEMPLATE_USER_ID=u_superadmin npm run auth:link-user

# Start the built server, including startup migrations
npm run start:server

# Smoke test a running server
npm run smoke:server
npm run smoke:server -- --section=emailChange
```

## Architecture Boundaries

- UI routes and components should depend on queries and the `ProjexApi` contract, not directly on storage.
- Client-safe API adapter code lives in `src/api/server/serverApi.ts`.
- Business logic belongs in `src/server/fns/*`.
- File routes under `src/routes/api.*.ts` should stay thin: parse input, call server functions, and return validated JSON.
- Request body validation belongs at the route boundary with Zod.
- Runtime ownership and authorization checks should be centralized through server guard helpers, not duplicated ad hoc inside route files.
- Do not import `src/server/*` from client modules.

## Server Runtime Notes

Production/staging server mode requires:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- one auth session resolution mode, preferably `BETTER_AUTH_DIRECT_SESSION_FN`
- `PROJEX_ENABLE_DEV_ENDPOINTS=false`

Recommended direct resolver:

```bash
BETTER_AUTH_DIRECT_SESSION_FN=src/server/auth/authProvider.ts#getSessionFromRequest
```

Operational defaults:

- `npm run db:migrate` runs BetterAuth schema migration plus app SQL migrations.
- Cross-origin browser requests are denied unless `CORS_ALLOWED_ORIGINS` explicitly allowlists the origin.
- API responses include `x-request-id`; structured request logs are emitted server-side.
- Public deployments should use the nginx template at `deploy/nginx/projex.conf` for HTTPS redirects, security headers, forwarded headers, and the restart maintenance page.

## Documentation Map

Keep this list short. If a new note overlaps an existing item, update the existing source of truth instead of adding another markdown file.

- `docs/staging-runbook.md`: operational runbook, readiness checklist, deploy verification, first-admin bootstrap, and troubleshooting.
- `docs/deployment-ec2.md`: first-time EC2/RDS host provisioning only. Ongoing deploy operations belong in the runbook.
- `docs/email-ops-runbook.md`: email provider configuration, Resend checks, and email troubleshooting.
- `docs/product-backlog.md`: product/admin backlog and non-priority ideas.
- `docs/verified-email-change-design.md`: design record for verified email-change behavior.
- `deploy/cdk/README.md`: AWS CDK stack notes.
