# Security Policy

## Reporting a Vulnerability

Please do not open public GitHub issues for suspected security problems.

Send a private report to the repository maintainers with:

- a short description of the issue
- the affected area or file path
- reproduction steps or a proof of concept
- impact assessment if known
- any suggested mitigation

We will acknowledge the report, investigate, and coordinate remediation before
public disclosure.

## Supported Configuration Expectations

Security-sensitive expectations for deployed environments:

- `NODE_ENV=production`
- `PROJEX_ENABLE_DEV_ENDPOINTS=false`
- `PROJEX_ENABLE_SMOKE_TOOLS=false`
- `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` use HTTPS origins
- committed env examples never contain live secrets

See [docs/staging-runbook.md](docs/staging-runbook.md)
for deployment-hardening guidance.
