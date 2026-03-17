import type { CompanyId, ProjectId, Txn, TxnId } from '../../types';
import { asCategoryId, asSubCategoryId, asTxnId } from '../../types';
import { AppError } from '../../api/errors';
import type { TxnCreateInput, TxnUpdateInput } from '../../api/types';
import { uid } from '../../utils/id';
import { txnInputSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { getDb } from '../db/db';
import { requireAuthorized } from '../auth/authorize';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

/**
 * Example command-style server function.
 *
 * In TanStack Start, export this from a `server/` route or server function file
 * and call it from the client adapter.
 */

type TxnRow = {
  id: string;
  public_id: string;
  external_id: string | null;
  company_id: string;
  project_id: string;
  txn_date: string | Date;
  item: string;
  description: string;
  amount_cents: number;
  category_id: string | null;
  sub_category_id: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeExternalId(value: string | null | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function normalizeTxnPatch(input: TxnUpdateInput): Partial<Txn> & { id: TxnId } {
  return {
    ...input,
    externalId: input.externalId ?? undefined,
    categoryId: input.categoryId ?? undefined,
    subCategoryId: input.subCategoryId ?? undefined,
  };
}

function normalizeTxnDate(value: string | Date): string {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return value.slice(0, 10);
}

function toTxn(row: TxnRow): Txn {
  return {
    id: row.public_id as TxnId,
    internalId: row.id,
    externalId: normalizeExternalId(row.external_id),
    companyId: row.company_id as CompanyId,
    projectId: row.project_id as ProjectId,
    date: normalizeTxnDate(row.txn_date),
    item: row.item,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id ? asCategoryId(row.category_id) : undefined,
    subCategoryId: row.sub_category_id ? asSubCategoryId(row.sub_category_id) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertUniqueTransactionKeysInProject(
  transactions: Array<{ id: TxnId; externalId?: string }>
) {
  const ids = new Set<string>();
  const externalIds = new Set<string>();

  for (const t of transactions) {
    const idKey = String(t.id);
    if (ids.has(idKey)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Duplicate transaction id in project: ${idKey}`
      );
    }
    ids.add(idKey);

    const ext = normalizeExternalId(t.externalId);
    if (!ext) continue;
    if (externalIds.has(ext)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Duplicate transaction externalId in project: ${ext}`
      );
    }
    externalIds.add(ext);
  }
}

export async function listTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<Txn[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'project:view',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });
    const rows = await db
      .selectFrom('txns')
      .select([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'category_id',
        'sub_category_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map((r) => toTxn(r as TxnRow));
  });
}

export async function createTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnCreateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'txns:edit',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });

    if (args.input.projectId !== args.projectId) {
      throw new AppError('VALIDATION_ERROR', 'Transaction projectId does not match target project');
    }
    if (args.input.companyId !== (project.company_id as CompanyId)) {
      throw new AppError('VALIDATION_ERROR', 'Transaction companyId does not match project company');
    }

    validateOrThrow(txnInputSchema, args.input);

    const next: Txn = {
      ...args.input,
      id: args.input.id ?? asTxnId(uid('txn')),
      externalId: normalizeExternalId(args.input.externalId),
      createdAt: args.input.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    const existingForCheck = existingRows.map((r) => ({
      id: r.public_id as TxnId,
      externalId: normalizeExternalId(r.external_id),
    }));
    assertUniqueTransactionKeysInProject([...existingForCheck, next]);

    const row = await db
      .insertInto('txns')
      .values({
        public_id: next.id,
        external_id: next.externalId ?? null,
        company_id: next.companyId,
        project_id: next.projectId,
        txn_date: next.date,
        item: next.item,
        description: next.description,
        amount_cents: next.amountCents,
        category_id: next.categoryId ?? null,
        sub_category_id: next.subCategoryId ?? null,
        created_at: next.createdAt,
        updated_at: next.updatedAt,
      })
      .returning([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'category_id',
        'sub_category_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(row as TxnRow);
  });
}

export async function updateTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnUpdateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'txns:edit',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });

    const existing = await db
      .selectFrom('txns')
      .select([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'category_id',
        'sub_category_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    if (
      typeof args.input.projectId !== 'undefined' &&
      args.input.projectId !== (existing.project_id as ProjectId)
    ) {
      throw new AppError('VALIDATION_ERROR', 'Transaction projectId cannot be changed');
    }
    if (
      typeof args.input.companyId !== 'undefined' &&
      args.input.companyId !== (existing.company_id as CompanyId)
    ) {
      throw new AppError('VALIDATION_ERROR', 'Transaction companyId cannot be changed');
    }

    const prev = toTxn(existing as TxnRow);
    const normalizedInput = normalizeTxnPatch(args.input);
    const nextExternalId = Object.prototype.hasOwnProperty.call(normalizedInput, 'externalId')
      ? normalizeExternalId(normalizedInput.externalId ?? undefined)
      : normalizeExternalId(prev.externalId);
    const now = new Date().toISOString();
    const next: Txn = {
      ...prev,
      ...normalizedInput,
      externalId: nextExternalId,
      updatedAt: now,
    };

    validateOrThrow(txnInputSchema, next);

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    const forCheck = existingRows.map((r) => ({
      id: r.public_id as TxnId,
      externalId: normalizeExternalId(r.external_id),
    }));
    const idx = forCheck.findIndex((r) => r.id === next.id);
    if (idx >= 0) forCheck[idx] = { id: next.id, externalId: next.externalId };
    assertUniqueTransactionKeysInProject(forCheck);

    const updated = await db
      .updateTable('txns')
      .set({
        external_id: next.externalId ?? null,
        txn_date: next.date,
        item: next.item,
        description: next.description,
        amount_cents: next.amountCents,
        category_id: next.categoryId ?? null,
        sub_category_id: next.subCategoryId ?? null,
        created_at: next.createdAt,
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.id)
      .returning([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'category_id',
        'sub_category_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(updated as TxnRow);
  });
}

export async function deleteTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'txns:edit',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });
    await db
      .deleteFrom('txns')
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.txnId)
      .execute();
  });
}

export async function importTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txns: Txn[];
  mode: 'append' | 'replaceAll';
}): Promise<{ count: number }> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'project:import',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });
    const normalizedIncoming = args.txns.map((t) => {
      if (t.projectId !== args.projectId) {
        throw new AppError('VALIDATION_ERROR', 'Transaction projectId does not match import target');
      }
      if (t.companyId !== (project.company_id as CompanyId)) {
        throw new AppError('VALIDATION_ERROR', 'Transaction companyId does not match project company');
      }
      validateOrThrow(txnInputSchema, t);
      return {
        ...t,
        externalId: normalizeExternalId(t.externalId),
      };
    });

    if (args.mode === 'replaceAll') {
      assertUniqueTransactionKeysInProject(normalizedIncoming);
      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('txns').where('project_id', '=', args.projectId).execute();
        if (!normalizedIncoming.length) return;
        await trx
          .insertInto('txns')
          .values(
            normalizedIncoming.map((t) => ({
              public_id: t.id,
              external_id: t.externalId ?? null,
              company_id: t.companyId,
              project_id: t.projectId,
              txn_date: t.date,
              item: t.item,
              description: t.description,
              amount_cents: t.amountCents,
              category_id: t.categoryId ?? null,
              sub_category_id: t.subCategoryId ?? null,
              created_at: t.createdAt ?? now,
              updated_at: now,
            }))
          )
          .execute();
      });
      return { count: normalizedIncoming.length };
    }

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    const existingForCheck = existingRows.map((r) => ({
      id: r.public_id as TxnId,
      externalId: normalizeExternalId(r.external_id),
    }));
    const nextForCheck = [...existingForCheck, ...normalizedIncoming];
    assertUniqueTransactionKeysInProject(nextForCheck);

    if (normalizedIncoming.length) {
      const now = new Date().toISOString();
      await db
        .insertInto('txns')
        .values(
          normalizedIncoming.map((t) => ({
            public_id: t.id,
            external_id: t.externalId ?? null,
            company_id: t.companyId,
            project_id: t.projectId,
            txn_date: t.date,
            item: t.item,
            description: t.description,
            amount_cents: t.amountCents,
            category_id: t.categoryId ?? null,
            sub_category_id: t.subCategoryId ?? null,
            created_at: t.createdAt ?? now,
            updated_at: now,
          }))
        )
        .execute();
    }
    return { count: normalizedIncoming.length };
  });
}
