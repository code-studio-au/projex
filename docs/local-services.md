# Local Services

Projex can run its local infrastructure dependencies through a single Docker Compose file.

## Services

- Postgres: `localhost:5432`
- MinIO S3 API: `http://127.0.0.1:9010`
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

These match the default local `DATABASE_URL` in `.env.local`:

```env
DATABASE_URL=postgres://projex:projex@localhost:5432/projex
```

## MinIO defaults

- user: `minioadmin`
- password: `minioadmin`
- bucket: `projex-exports`

Current local export-storage env shape:

```env
S3_ENDPOINT=http://127.0.0.1:9010
S3_REGION=us-east-1
S3_BUCKET=projex-exports
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

## Data retention

- Postgres data persists under `.local/postgres/data/`
- MinIO data persists under `.local/minio/data/`

Both directories are ignored by git so local resets stay local.

## Export behavior

Company export jobs now persist workbook files in MinIO/S3-compatible object storage rather than Postgres blobs. The database keeps job state, metadata, authorization context, and retention timestamps.
