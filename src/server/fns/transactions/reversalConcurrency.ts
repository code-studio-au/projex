import { sql, type Transaction } from 'kysely';

import type { ProjectId } from '../../../types';
import type { DB } from '../../db/schema';

export async function lockProjectReversalWorkflow(args: {
  db: Transaction<DB>;
  projectId: ProjectId;
}) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`txn-reversal:${args.projectId}`}, 0))`.execute(
    args.db
  );
}
