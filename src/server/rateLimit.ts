import { sql, type Kysely } from 'kysely';

import { AppError } from '../api/errors';
import type { DB } from './db/schema';

type RateLimitOptions = {
  db: Kysely<DB>;
  bucket: string;
  limit: number;
  windowMs: number;
  message: string;
  now?: Date;
};

export async function enforceRateLimit(
  options: RateLimitOptions
): Promise<void> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const windowStartThreshold = new Date(
    now.getTime() - options.windowMs
  ).toISOString();

  const result = await sql<{ count: number; window_started_at: string }>`
    insert into request_rate_limits (bucket, window_started_at, count, updated_at)
    values (${options.bucket}, ${nowIso}, 1, ${nowIso})
    on conflict (bucket) do update
    set
      count = case
        when request_rate_limits.window_started_at <= ${windowStartThreshold}::timestamptz then 1
        else request_rate_limits.count + 1
      end,
      window_started_at = case
        when request_rate_limits.window_started_at <= ${windowStartThreshold}::timestamptz then ${nowIso}::timestamptz
        else request_rate_limits.window_started_at
      end,
      updated_at = ${nowIso}::timestamptz
    returning count, window_started_at
  `.execute(options.db);

  const row = result.rows[0];
  if (!row || row.count <= options.limit) return;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (new Date(row.window_started_at).getTime() +
        options.windowMs -
        now.getTime()) /
        1000
    )
  );

  throw new AppError('RATE_LIMITED', options.message, {
    retryAfterSeconds,
    bucket: options.bucket,
    limit: options.limit,
    windowMs: options.windowMs,
  });
}
