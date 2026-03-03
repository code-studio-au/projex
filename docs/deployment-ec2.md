# EC2 Deployment Guide

## 1) Provision

- EC2 instance (Amazon Linux 2023 or Ubuntu 22.04+)
- Security group allows inbound app traffic (or ALB only)
- RDS Postgres reachable from EC2 subnet/security group

## 2) Install runtime

- Install Node.js 22
- Install npm
- Clone repo to `/opt/projex`

## 3) Configure environment

Create `/etc/projex/projex.env`:

```bash
NODE_ENV=production
DATABASE_URL=postgres://user:password@host:5432/projex

# Choose one auth mode:
BETTER_AUTH_SESSION_URL=https://auth.example.com/api/session
# OR
# BETTER_AUTH_DIRECT_SESSION_FN=./dist/server/auth/authProvider.js#getSessionFromRequest

# Security
CORS_ALLOWED_ORIGINS=https://app.example.com

# Must remain false/unset in production
PROJEX_ENABLE_DEV_ENDPOINTS=false
```

## 4) Build + run

```bash
cd /opt/projex
npm ci
npm run build
```

Install systemd unit:

```bash
sudo cp deploy/systemd/projex.service /etc/systemd/system/projex.service
sudo systemctl daemon-reload
sudo systemctl enable projex
sudo systemctl start projex
```

Check logs:

```bash
sudo journalctl -u projex -f
```

`start:server` runs database migrations and then starts `vite preview` (host/port via `HOST` and `PORT`, default `0.0.0.0:3000`).

## 5) Health checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready`

Use `/api/ready` for ALB target group health checks only if DB connectivity is required for serving.

## 5.1) CORS

- Same-origin requests are always allowed.
- Cross-origin browser requests are denied unless `CORS_ALLOWED_ORIGINS` includes the exact origin.

## 6) Post-deploy verification

- `npm run smoke:server` (from trusted network against deployed URL)
- Confirm auth/session, company scoping, transaction CRUD, taxonomy/budget CRUD.
