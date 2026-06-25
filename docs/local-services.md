# Local Services

Projex can run its local infrastructure dependencies through a single Docker Compose file.

## Services

- Postgres: `localhost:5432` via container `projex-postgres`
- MinIO S3 API: `http://127.0.0.1:9010` via container `projex-minio`
- MinIO console: `http://127.0.0.1:9011`

## Start everything

```bash
docker compose -f compose.local.yaml up -d
```

## Stop everything

```bash
docker compose -f compose.local.yaml down
```

## Postgres defaults

- database: `projex`
- user: `projex`
- password: `projex`

These match the default local `DATABASE_URL` in `.env.local.example`:

```env
DATABASE_URL=postgres://projex:projex@localhost:5432/projex
```

## MinIO defaults

- user: `minioadmin`
- password: `minioadmin`
- bucket: `projex-exports`

After first startup, create the `projex-exports` bucket in the MinIO console if it does not already exist. Export readiness checks expect the configured bucket to be present.

Current local export-storage env shape:

```env
S3_ENDPOINT=http://127.0.0.1:9010
S3_REGION=us-east-1
S3_BUCKET=projex-exports
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

The compose file pins MinIO to `RELEASE.2025-10-15T17-29-55Z` rather than
`latest` so local object-storage behavior stays reproducible across machines and
CI-style reruns.

## Data retention

- Postgres data persists under `.local/postgres/data/`
- MinIO data persists under `.local/minio/data/`

Both directories are ignored by git so local resets stay local.

## Export behavior

Company export jobs now persist workbook files in MinIO/S3-compatible object storage rather than Postgres blobs. The database keeps job state, metadata, authorization context, and retention timestamps.

Current export retention behavior:

- completed and failed jobs expire after 24 hours
- cleanup removes the database job row and the corresponding object-storage payload
- stale queued/running jobs are also cleaned up using the same path
