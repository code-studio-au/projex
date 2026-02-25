import type { ProjectId, Txn, TxnId, UserId } from '../../types';
import { AppError } from '../../api/errors';
import { getDb } from '../db/db';

/**
 * Example command-style server function.
 *
 * In TanStack Start, export this from a `server/` route or server function file
 * and call it from the client adapter.
 */

export async function listTransactionsServer(_args: {
  userId: UserId;
  projectId: ProjectId;
}): Promise<Txn[]> {
  void _args;
  // TODO: validate session + authorize user access to project.
  throw new AppError('NOT_IMPLEMENTED', 'listTransactionsServer not implemented');
}

export async function deleteTxnServer(_args: {
  userId: UserId;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<void> {
  void _args;
  // TODO: validate session + authorize + delete.
  throw new AppError('NOT_IMPLEMENTED', 'deleteTxnServer not implemented');
}

export async function importTransactionsServer(_args: {
  userId: UserId;
  projectId: ProjectId;
  txns: Txn[];
  mode: 'append' | 'replaceAll';
}): Promise<{ count: number }> {
  void _args;
  // TODO: wrap in a DB transaction. Create taxonomy and budget lines inside.
  // Example pattern:
  // const db = getDb();
  // await db.transaction().execute(async (trx) => { ... });
  void getDb();
  throw new AppError('NOT_IMPLEMENTED', 'importTransactionsServer not implemented');
}
