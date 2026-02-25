import type { CompanyId, ProjectId, Txn, TxnId, UserId } from '../../types';
import { AppError } from '../../api/errors';
import { getDb } from '../db/db';
import { requireAuthorized } from '../auth/authorize';

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
  const db = getDb();
  const project = await db
    .selectFrom('projects')
    .select(['id', 'company_id'])
    .where('id', '=', _args.projectId)
    .executeTakeFirst();
  if (!project) throw new AppError('NOT_FOUND', 'Project not found');
  await requireAuthorized({
    db,
    userId: _args.userId,
    action: 'project:view',
    companyId: project.company_id as CompanyId,
    projectId: _args.projectId,
  });
  // TODO: map DB rows to Txn DTO.
  throw new AppError('NOT_IMPLEMENTED', 'listTransactionsServer not implemented');
}

export async function deleteTxnServer(_args: {
  userId: UserId;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<void> {
  const db = getDb();
  const project = await db
    .selectFrom('projects')
    .select(['id', 'company_id'])
    .where('id', '=', _args.projectId)
    .executeTakeFirst();
  if (!project) throw new AppError('NOT_FOUND', 'Project not found');
  await requireAuthorized({
    db,
    userId: _args.userId,
    action: 'txns:edit',
    companyId: project.company_id as CompanyId,
    projectId: _args.projectId,
  });
  // TODO: delete by (_args.projectId, _args.txnId) using txns.public_id.
  throw new AppError('NOT_IMPLEMENTED', 'deleteTxnServer not implemented');
}

export async function importTransactionsServer(_args: {
  userId: UserId;
  projectId: ProjectId;
  txns: Txn[];
  mode: 'append' | 'replaceAll';
}): Promise<{ count: number }> {
  const db = getDb();
  const project = await db
    .selectFrom('projects')
    .select(['id', 'company_id'])
    .where('id', '=', _args.projectId)
    .executeTakeFirst();
  if (!project) throw new AppError('NOT_FOUND', 'Project not found');
  await requireAuthorized({
    db,
    userId: _args.userId,
    action: 'project:import',
    companyId: project.company_id as CompanyId,
    projectId: _args.projectId,
  });
  // TODO: wrap in a DB transaction. Create taxonomy and budget lines inside.
  // Example pattern:
  // const db = getDb();
  // await db.transaction().execute(async (trx) => { ... });
  void getDb();
  throw new AppError('NOT_IMPLEMENTED', 'importTransactionsServer not implemented');
}
