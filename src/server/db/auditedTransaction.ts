import type { Kysely, Transaction } from 'kysely';

import { withAuditLoggingTransaction } from '../logging/auditLogger';
import type { DB } from './schema';

/**
 * Runs a Kysely transaction and emits its buffered audit logs only after the
 * transaction has committed successfully.
 */
export function executeAuditedTransaction<T>(
  db: Kysely<DB>,
  transaction: (trx: Transaction<DB>) => Promise<T>
): Promise<T> {
  return withAuditLoggingTransaction(() =>
    db.transaction().execute(transaction)
  );
}
