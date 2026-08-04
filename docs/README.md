# Documentation

This directory is organized by the purpose of each document. Use this index as
the entry point instead of linking to a folder generally.

## Architecture

System boundaries, domain invariants, permissions, and transaction behavior:

- [Architecture boundaries](architecture/architecture-boundaries.md)
- [Budget semantics](architecture/budget-semantics.md)
- [Permissions matrix](architecture/permissions-matrix.md)
- [Reversal workflow](architecture/reversal-workflow.md)
- [Transaction integrity](architecture/transaction-integrity.md)
- [Transaction page query profile](architecture/transaction-query-profile.md)

## Development

Local engineering workflows and repository quality controls:

- [Database migrations](development/database-migrations.md)
- [Dead-code verification](development/dead-code-verification.md)
- [Local services](development/local-services.md)

## Dependencies

Dependency policy, coordinated framework versions, and dated reviews:

- [Dependency freshness review — 1 August 2026](dependencies/dependency-freshness-2026-08-01.md)
- [Dependency overrides](dependencies/dependency-overrides.md)
- [Framework dependency cohort](dependencies/framework-dependency-cohort.md)

## Operations

Provisioning, deployment, runtime operations, and incident-oriented guidance:

- [EC2 deployment guide](operations/deployment-ec2.md)
- [Email operations runbook](operations/email-ops-runbook.md)
- [Staging and future-production runbook](operations/staging-runbook.md)

## Product

Product backlog and feature design records:

- [Product backlog](product/product-backlog.md)
- [Rule suggestions design](product/rule-suggestions-design.md)
- [Verified email change design](product/verified-email-change-design.md)

## Reviews

Historical repository-review evidence:

- [Immediate TODO — 31 July 2026](reviews/archive/immediate-todo-backlog-2026-07-31-full-repository-review.md)
- [Full repository review — 31 July 2026](reviews/archive/full-repository-review-2026-07-31.md)
- [Archived reviews](reviews/archive/README.md)

## Repository-level guidance

- [Project overview](../README.md)
- [Contributing](../CONTRIBUTING.md)
- [Security policy](../SECURITY.md)
- [AWS CDK notes](../deploy/cdk/README.md)

Keep documents in the narrowest applicable subject folder. If a new note
overlaps an existing source of truth, update the existing document instead of
creating a competing one. Historical repository reviews belong under
`reviews/archive/`; current policies and runbooks must remain in their subject
folders.
