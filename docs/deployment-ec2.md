# EC2 Deployment Guide

Use this guide for first-time EC2/RDS host provisioning. Once the host, nginx, systemd service, environment file, and HTTPS certificate are ready, use `docs/staging-runbook.md` as the ongoing operational source of truth.

## 1) Provision

- EC2 instance (Amazon Linux 2023 or Ubuntu 22.04+)
- Security group allows inbound app traffic (or ALB only)
- RDS Postgres reachable from EC2 subnet/security group

## 2) Host bootstrap

If you provision the EC2 host through this repo's CDK stack, first boot now prepares the machine automatically. The bootstrap installs:

- Node.js 24
- Corepack + pinned pnpm
- nginx
- deploy directories:
  - `/opt/projex/releases`
  - `/opt/projex/shared/nginx-maintenance`
  - `/etc/projex`
  - `/var/www/certbot`
- the non-login `projex-deploy` identity used only for dependency installation,
  migrations, and operator-run application commands
- the `projex` systemd unit
- a safe HTTP-only bootstrap nginx config with maintenance fallback and ACME challenge support
- `/etc/projex/projex.env.example`
- `/usr/local/bin/projex-provision-letsencrypt-cert`

The intended operational access model is SSM-first. SSH can stay disabled by
leaving the CDK `sshCidr` context empty.

If you are preparing a host manually without CDK, mirror that same baseline before using the deploy workflow.

## 3) Configure environment

Create `/etc/projex/projex.env`:

```bash
NODE_ENV=production
DATABASE_URL=postgres://user:password@host:5432/projex
PG_POOL_MAX=10
PG_IDLE_TIMEOUT_MS=30000
PG_CONNECTION_TIMEOUT_MS=5000
PG_SSL_MODE=require
PG_SSL_CA_FILE=/etc/projex/rds-global-bundle.pem

# BetterAuth
BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://app.example.com
BETTER_AUTH_TRUSTED_ORIGINS=https://app.example.com

# Browser/API origin allowlist
CORS_ALLOWED_ORIGINS=https://app.example.com

# Company export object storage
S3_BUCKET=projex-exports
S3_REGION=ap-southeast-2

# Preferred: direct Resend delivery.
RESEND_API_KEY=
RESEND_BASE_URL=https://api.resend.com
RESEND_FROM='Projex <noreply@projectexpensetracker.com>'

# Alternative invite/reset email delivery webhook.
PROJEX_AUTH_EMAIL_WEBHOOK_URL=
PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN=
PROJEX_AUTH_RESET_REDIRECT_URL=https://app.example.com/reset-password
PROJEX_APP_BASE_URL=https://app.example.com

# Must remain false in staging/production
PROJEX_ENABLE_DEV_ENDPOINTS=false
PROJEX_ENABLE_SMOKE_TOOLS=false
```

Notes:

- Keep `NODE_ENV=production` in deployed runtime env such as `/etc/projex/projex.env` or the systemd unit, not in repo `.env.production` / `.env.staging` files consumed by Vite.
- Do not deploy staging or production with development-only auth helpers enabled.
- Keep both `PROJEX_ENABLE_DEV_ENDPOINTS` and `PROJEX_ENABLE_SMOKE_TOOLS` disabled outside controlled local workflows.
- `PG_SSL_MODE=require` keeps server certificate verification enabled. CDK-provisioned hosts download Amazon RDS's commercial-region CA bundle to `/etc/projex/rds-global-bundle.pem`; keep `PG_SSL_CA_FILE` pointed there for RDS. For another managed or private Postgres provider, mount that provider's CA and use its path instead. Use `no-verify` only as an explicit last-resort exception.
- Set `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, and `CORS_ALLOWED_ORIGINS` to the canonical public origin users will actually visit.
- Public email/password sign-up is disabled. Provision normal users through
  company invitations; reserve `pnpm run auth:create-user` for the trusted
  operator bootstrap workflow.
- If nginx or another proxy fronts the app on `80/443`, use that public origin here rather than `:3000`.
- Better Auth trusts only the proxy-controlled `X-Real-IP` header for client-IP rate limiting. Keep the application origin private, and ensure the trusted proxy overwrites that header from the direct client address rather than forwarding a caller-provided value.
- `PROJEX_AUTH_RESET_REDIRECT_URL` should point at the public reset page users will open from invite/reset emails.
- `PROJEX_APP_BASE_URL` should point at the public app origin used for
  transaction-comment and export-ready notification links; it falls back to
  `BETTER_AUTH_URL` when unset.
- `S3_BUCKET` and `S3_REGION` are required for the export feature when using AWS S3. On AWS itself you normally do not need to set `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, or `S3_FORCE_PATH_STYLE`.
- The production Resend account verifies `projectexpensetracker.com`, so keep
  `RESEND_FROM` set to `Projex <noreply@projectexpensetracker.com>`. A sender on
  a different domain or subdomain requires that exact domain to be verified and
  authorized for the API key first.
- Run `pnpm run db:migrate` as an explicit deploy step before restarting the service; `pnpm run start:server` no longer auto-migrates by default.

Sizing guidance:

- cheapest sensible default for the current repo shape: `t4g.small` app host plus separate `db.t4g.micro` RDS
- artifact-based deploys remove the heaviest on-box build pressure because the instance no longer runs `pnpm run build` during each release
- once deploys are artifact-based and the instance is mostly a runtime host, `t4g.micro` becomes much more realistic as a lowest-cost option, subject to your real traffic and memory profile

## 4) Configure the real environment file

CDK bootstrap installs `/etc/projex/projex.env.example` and, on first boot,
copies it to `/etc/projex/projex.env` only if the real file does not already
exist. The real file is owned by `root:projex-deploy` with mode `0640`; the
systemd manager can load it for the runtime service, and only the constrained
deployment identity can read it for migrations and operator commands.

Replace the placeholder values before your first application deploy:

```bash
sudoedit /etc/projex/projex.env
```

The `projex` systemd unit will not start the app until both `/etc/projex/projex.env` and a deployed release under `/opt/projex/current` exist.

## 5) Bootstrap + run

For CDK-created hosts, no extra runtime bootstrap should be needed here beyond checking the files that user-data installed:

```bash
sudo systemctl status nginx --no-pager
sudo systemctl status projex --no-pager
ls -la /etc/projex
ls -la /usr/local/bin/projex-provision-letsencrypt-cert
```

Check logs:

```bash
sudo journalctl -u projex -f
```

`start:server` validates the runtime env, serves built client assets, and starts the SSR app server (host/port via `HOST` and `PORT`, default `0.0.0.0:3000`). It does not run migrations unless `PROJEX_RUN_MIGRATIONS=true` is set explicitly.

`start:server` is also the single owner of cache headers for proxied application
responses. The production build emits `dist/client/.vite/manifest.json`, and
the runtime grants one-year immutable caching only to fingerprinted
JavaScript, CSS, font, and image paths present in that manifest. HTML and
unrecognized `/assets/` files use `no-cache`; the unhashed favicon keeps a
short one-hour non-immutable policy. API and auth routes retain their own
response policies. Nginx must preserve those upstream headers rather than add a
second application cache policy.

The systemd unit now points at `/opt/projex/current`, so each deploy activates a fully extracted release directory by switching that symlink after migrations succeed.
It starts Node directly rather than resolving pnpm from a user-home Corepack
cache. `NoNewPrivileges`, an empty capability set, home/device/tmp isolation,
kernel and namespace protections, and `ProtectSystem=strict` keep the runtime
read-only apart from the explicit `/var/lib/projex` state directory.

The bootstrap nginx config serves plain HTTP only and is intentionally safe to apply before DNS and certificates are ready. It proxies to `http://127.0.0.1:3000`, preserves standard forwarded headers, exposes `/.well-known/acme-challenge/` for Let's Encrypt, and keeps the maintenance-page fallback.

Recommended:

- use the bootstrap nginx template at `deploy/nginx/projex.bootstrap.conf` for first boot
- promote the host to the HTTPS nginx template rendered from `deploy/nginx/projex.https.conf.template` after certificate issuance
- install `deploy/nginx/projex-request-limits.conf` under `/etc/nginx/conf.d/`; routine artifact deploys refresh this managed include automatically
- install `deploy/nginx/projex-compression.conf` under `/etc/nginx/conf.d/`; routine artifact deploys refresh this managed include automatically
- it includes:
  - HTTP -> HTTPS redirect
  - `server_tokens off`
  - site-wide security headers
  - proxy forwarding for host/origin/proto/IP
  - maintenance-page interception for upstream `502/503/504`
  - a dedicated `__maintenance_ready` probe endpoint that bypasses the maintenance fallback

The managed request-limit include sets `client_max_body_size 16m`. Power BI
import commits include normalized transactions and retained source metadata, so
their JSON request is larger than the source CSV. This bounded proxy allowance
supports the application's validated maximum of 5,000 imported transactions
without reverting to an effectively unlimited request body.

The managed compression include enables gzip for proxied HTML and compressible
JavaScript, CSS, JSON, XML, and SVG responses. It also emits
`Vary: Accept-Encoding` so shared caches do not mix compressed and uncompressed
representations. Brotli is intentionally not required because the standard
host nginx package does not guarantee that optional module.

The cache ownership boundary is identical for the bootstrap HTTP
configuration, the managed HTTPS template, release artifacts, and existing
hosts: nginx proxies application responses unchanged, while the activated
release's Node runtime applies the manifest-backed policy. Nginx owns only the
explicit `no-store` maintenance responses. Artifact creation and EC2 activation
both require the client manifest and cache-policy module, preventing an
incomplete release from reaching service activation.

The maintenance fallback relies on the static file:

- `deploy/nginx/maintenance.html`
- `deploy/nginx/maintenance.js`

In the recommended artifact-based layout, nginx serves those files from:

- `/opt/projex/shared/nginx-maintenance/maintenance.html`
- `/opt/projex/shared/nginx-maintenance/maintenance.js`

Each deploy refreshes those shared maintenance assets from the release bundle before the service restart.
It also installs the managed request-limit and compression includes, validates
the complete nginx configuration with `nginx -t`, and reloads nginx. This means
existing hosts pick up these HTTP-policy changes without replacing their
rendered TLS/domain config.

## 5.1) Enable HTTPS with Let's Encrypt

After your DNS points at the EC2 host and port `80` is reachable publicly, request the certificate:

```bash
sudo LETSENCRYPT_EMAIL=ops@example.com \
  /usr/local/bin/projex-provision-letsencrypt-cert \
  app.example.com \
  www.app.example.com
```

That script:

- installs `certbot` if needed
- requests/renews the certificate with HTTP-01 validation through `/var/www/certbot`
- renders the HTTPS nginx config from `/etc/projex/projex.nginx.https.conf.template`
- selects the HTTP/2 directive form supported by the installed nginx version,
  including Ubuntu 22.04's nginx 1.18
- reloads nginx
- installs a renewal deploy hook that revalidates nginx and reloads it after renewals
- enables and starts the supported Certbot systemd renewal timer

If you are working from a repo checkout on the host instead of the installed helper, the same logic also exists in `scripts/provision-letsencrypt-cert.sh`.

## 5.2) Repeatable deploy commands

Preferred path: build the release artifact in CI and deploy that artifact onto the host.

Local packaging command:

```bash
pnpm run build
pnpm run deploy:artifact:create
```

GitHub Actions manual workflow:

- `.github/workflows/deploy.yml`
- default mode: `artifact-only`
- optional mode when environment configuration is ready: `ec2`

When enabling the `ec2` mode, set:

- GitHub environment variable
  `AWS_DEPLOY_ROLE_ARN=<GithubDeployRoleArn CDK output>`
- `EC2_INSTANCE_ID`
- `EC2_DEPLOY_ARTIFACT_BUCKET`
- `EC2_PUBLIC_BASE_URL`
- optional overrides such as `EC2_APP_ROOT`, `EC2_ENV_FILE`, `EC2_SERVICE_NAME`, `EC2_HEALTH_URL`, `EC2_READY_URL`, and `EC2_KEEP_RELEASES`

Recommended target: create a GitHub environment such as `staging` or
`production`, put the role ARN in that environment's variables and the EC2
values in its secrets, and run
`.github/workflows/deploy.yml` with the matching `environment_name` input.

### GitHub OIDC deployment identity

CDK owns the account-wide GitHub Actions OIDC provider in
`ProjexGithubIdentity`. Each separate
`ProjexGithubDeploy-<environment>` stack creates its own deploy role,
restricted to the exact GitHub OIDC subject:

```text
repo:code-studio-au/projex:environment:<environment>
```

The role can write only to
`deploy-artifacts/<environment>/*` in that stack's handoff bucket, send
`AWS-RunShellScript` only to that stack's EC2 instance, and read the resulting
command invocation. The workflow grants `id-token: write` only to the EC2
deployment job.

The deploy-role stack receives the existing `Ec2InstanceId` and
`DeployArtifactBucketName` as CDK context. It is deliberately independent of
`ProjexInfra-<environment>` so credential changes cannot apply unrelated AMI,
EC2 bootstrap, RDS, VPC, or bucket changes.

There is deliberately no static-access-key fallback. After confirming an
existing environment deploys successfully with OIDC, delete its GitHub
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` secrets
and revoke the associated IAM access key.

The artifact-based release flow performs:

- check out the requested ref once and resolve its full immutable Git SHA
- build once in GitHub Actions
- package a deploy tarball containing `dist`, runtime source, migrations,
  runtime scripts including the server smoke CLI entrypoint, nginx maintenance
  assets, and an immutable release manifest
- name the physical release with environment, commit prefix, GitHub run ID, and
  run attempt
- verify the artifact SHA-256 after GitHub artifact download
- upload the artifact to an S3 handoff bucket
- dispatch an SSM shell command to the target EC2 instance
- download to a temporary file and verify the same SHA-256 on the host
- reject unsafe archive paths, extract into a unique staging directory, and
  validate the embedded release manifest
- atomically rename the validated staging directory to
  `/opt/projex/releases/<environment>-<sha>-run<run-id>-attempt<attempt>`
- create or validate the non-login `projex-deploy` identity
- install only frozen production dependencies with lifecycle scripts disabled,
  as `projex-deploy`
- load `/etc/projex/projex.env` and run `pnpm run db:migrate` as
  `projex-deploy`, never as the elevated SSM identity
- restore the complete release tree to root ownership and install the reviewed
  sandboxed systemd unit
- refresh shared maintenance assets
- atomically switch `/opt/projex/current`
- restart `projex`
- `/api/health` and `/api/ready` checks
- atomically roll back to the previous release symlink if restart or health
  checks fail

Existing release directories are never overwritten or removed during staging.
Retrying the same commit produces a separate physical release because
`GITHUB_RUN_ATTEMPT` changes. Release pruning resolves the live
`/opt/projex/current` target and excludes it, the new release, and the rollback
release from deletion.

The deploy host does not need GitHub network access or SSH keys. The runner
uploads the release tarball to `EC2_DEPLOY_ARTIFACT_BUCKET`, then invokes SSM,
and the EC2 instance downloads the artifact directly from S3 using its IAM
role.

That deploy bundle now also supports operator-run server smoke directly on the
host from `/opt/projex/current`, for example:

```bash
cd /opt/projex/current
sudo -u projex-deploy -- /bin/bash -c \
  'set -a; source /etc/projex/projex.env; set +a; exec /usr/local/bin/pnpm run smoke:server:generated -- --section=basics'
```

Use this for post-deploy runtime verification or staged incident triage. It is
an operator CLI capability only; it does not require enabling
`PROJEX_ENABLE_SMOKE_TOOLS` in production.

There is now a single supported deploy method for EC2 environments:

- GitHub Actions builds the release artifact
- the runner uploads it to the deploy handoff bucket
- the runner dispatches the SSM activation command
- the EC2 host installs runtime dependencies, runs migrations, switches
  `/opt/projex/current`, and restarts the service

The SSM command retains root only for verified artifact extraction, ownership,
service configuration, symlink activation, and service control. Package hooks
are disabled, and package installation plus application migrations execute as
`projex-deploy`. Release contents are root-owned and read-only to the runtime.
The service unit is rendered with the validated `EC2_APP_ROOT` and
`EC2_ENV_FILE` values before installation, so supported path overrides cannot
leave systemd pointing at the default release or environment file. The
selected service is enabled during every deployment so custom service names
survive a reboot; `EC2_SERVICE_NAME` must omit the `.service` suffix. Paths
below `/home`, `/root`, or `/run/user` are not supported for the application
root or environment file because `ProtectHome=true` intentionally hides those
locations from the service. The previous unit file and enablement state are
preserved before installation and restored with the previous release after
any failed activation.

## 6) Health checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready`

Use `/api/ready` for ALB target group health checks only if DB connectivity is required for serving.
The readiness response body is intentionally minimal; rely on the HTTP status code rather than detailed JSON fields.

## 6.1) CORS

- Same-origin requests are always allowed.
- Cross-origin browser requests are denied unless `CORS_ALLOWED_ORIGINS` includes the exact origin.

## 6.2) Security headers

- For full browser hardening, terminate TLS at nginx and apply headers there for all HTML and API responses.
- The repo template `deploy/nginx/projex.conf` includes:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- a static maintenance-page `Content-Security-Policy`
- The SSR app server now emits the main app CSP per HTML response so it can attach a fresh nonce to inline scripts and runtime style tags.
- Review the CSP before adding third-party scripts, fonts, or image hosts.
- The current app CSP uses per-request nonces for `<script>` and `<style>` tags, but still allows style attributes because Mantine-rendered HTML uses inline `style=""` attributes at runtime.

## 5.3) Friendly restart page

The nginx template is set up to replace raw upstream restart errors with a static maintenance page.

How it works:

- normal app traffic proxies to `http://127.0.0.1:3000`
- if the app is unavailable and nginx would normally return `502`, `503`, or `504`
- nginx serves `deploy/nginx/maintenance.html` instead
- the maintenance response keeps the original upstream error status for health-check accuracy
- that page polls:
  - `/__maintenance_ready`
- once `/api/ready` is healthy again, the page redirects the browser back to the original URL

Why this matters:

- users do not see raw `502 Bad Gateway` during normal deploy or restart windows
- the maintenance page works even while the app process is down
- recovery is automatic once the app is healthy again

## 6) Ongoing Operations

For post-deploy verification, first-admin bootstrap, smoke usage, and troubleshooting, use [docs/staging-runbook.md](staging-runbook.md).

For local pre-deploy security hygiene before you even have staging up, run:

```bash
pnpm run verify:security
```

This bundles:

- repo env/config safety checks
- dependency audit
- test suite
- typecheck
- lint

When you want the fuller pipeline-shaped local check, run:

```bash
pnpm run verify:ci
```

That adds:

- production build
- CDK synth verification
- disposable Postgres-backed DB integration tests
- disposable Postgres-backed isolated full server smoke
- disposable Postgres-backed isolated full browser smoke

If you run the full browser smoke lanes locally outside CI, install Chromium
and Firefox first:

```bash
pnpm exec playwright install --with-deps chromium firefox
```
