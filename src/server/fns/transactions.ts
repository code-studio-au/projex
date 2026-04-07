import type {
  BudgetLine,
  CompanyId,
  ProjectId,
  Txn,
  TxnId,
  Category,
  SubCategory,
  CompanyDefaultCategory,
  CompanyDefaultSubCategory,
  CompanyDefaultMappingRule,
  ImportPreviewRow,
} from '../../types';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultMappingRuleId,
  asSubCategoryId,
  asTxnId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
} from '../../types';
import { AppError } from '../../api/errors';
import type { TxnCreateInput, TxnUpdateInput } from '../../api/types';
import { uid } from '../../utils/id';
import { txnInputSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { getDb } from '../db/db';
import { isAuthorized, requireAuthorized } from '../auth/authorize';
import { mapImportedTransactionWithCompanyDefaults } from '../../utils/companyDefaultMappings';
import { buildImportPreview } from '../../utils/importPreview';
import { parseCsv, rowsToImportTxns } from '../../utils/csv';
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
  company_default_mapping_rule_id: string | null;
  coding_source: 'manual' | 'company_default_rule' | null;
  coding_pending_approval: boolean;
  created_at: string;
  updated_at: string;
};

function normalizeExternalId(value: string | null | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function uniqAutoBudgetTargets(
  txns: Txn[]
): Array<{ categoryId: Category['id']; subCategoryId: SubCategory['id'] }> {
  const seen = new Set<string>();
  const out: Array<{ categoryId: Category['id']; subCategoryId: SubCategory['id'] }> = [];
  for (const txn of txns) {
    if (!txn.categoryId || !txn.subCategoryId) continue;
    const key = `${txn.categoryId}:::${txn.subCategoryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ categoryId: txn.categoryId, subCategoryId: txn.subCategoryId });
  }
  return out;
}

function normalizeTxnPatch(input: TxnUpdateInput): Partial<Txn> & { id: TxnId } {
  const next: Partial<Txn> & { id: TxnId } = { id: input.id };
  if (typeof input.companyId !== 'undefined') next.companyId = input.companyId;
  if (typeof input.projectId !== 'undefined') next.projectId = input.projectId;
  if (typeof input.date !== 'undefined') next.date = input.date;
  if (typeof input.item !== 'undefined') next.item = input.item;
  if (typeof input.description !== 'undefined') next.description = input.description;
  if (typeof input.amountCents !== 'undefined') next.amountCents = input.amountCents;
  if (typeof input.createdAt !== 'undefined') next.createdAt = input.createdAt;
  if (typeof input.updatedAt !== 'undefined') next.updatedAt = input.updatedAt;
  if (typeof input.companyDefaultMappingRuleId !== 'undefined') {
    next.companyDefaultMappingRuleId = input.companyDefaultMappingRuleId ?? undefined;
  }
  if (typeof input.codingSource !== 'undefined') next.codingSource = input.codingSource;
  if (typeof input.codingPendingApproval !== 'undefined') {
    next.codingPendingApproval = input.codingPendingApproval;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'externalId')) {
    next.externalId = input.externalId ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'categoryId')) {
    next.categoryId = input.categoryId ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'subCategoryId')) {
    next.subCategoryId = input.subCategoryId ?? undefined;
  }
  return next;
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
    companyDefaultMappingRuleId: row.company_default_mapping_rule_id
      ? asCompanyDefaultMappingRuleId(row.company_default_mapping_rule_id)
      : undefined,
    codingSource: row.coding_source ?? undefined,
    codingPendingApproval: row.coding_pending_approval,
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
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
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
        company_default_mapping_rule_id: next.companyDefaultMappingRuleId ?? null,
        coding_source: next.codingSource ?? null,
        coding_pending_approval: !!next.codingPendingApproval,
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
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
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
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
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
        company_default_mapping_rule_id: next.companyDefaultMappingRuleId ?? null,
        coding_source: next.codingSource ?? null,
        coding_pending_approval: !!next.codingPendingApproval,
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
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
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
  autoCreateBudgets?: boolean;
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
    if (args.autoCreateBudgets) {
      await requireAuthorized({
        db,
        userId,
        action: 'budget:edit',
        companyId: project.company_id as CompanyId,
        projectId: args.projectId,
      });
    }
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

    const [defaultCategoriesRows, defaultSubCategoriesRows, mappingRuleRows, projectCategoryRows, projectSubCategoryRows] =
      await Promise.all([
        db
          .selectFrom('company_default_categories')
          .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
          .where('company_id', '=', project.company_id as CompanyId)
          .execute(),
        db
          .selectFrom('company_default_sub_categories')
          .select([
            'id',
            'company_id',
            'company_default_category_id',
            'name',
            'created_at',
            'updated_at',
          ])
          .where('company_id', '=', project.company_id as CompanyId)
          .execute(),
        db
          .selectFrom('company_default_mapping_rules')
          .select([
            'id',
            'company_id',
            'match_text',
            'company_default_category_id',
            'company_default_sub_category_id',
            'sort_order',
            'created_at',
            'updated_at',
          ])
          .where('company_id', '=', project.company_id as CompanyId)
          .orderBy('sort_order', 'asc')
          .orderBy('created_at', 'asc')
          .execute(),
        db
          .selectFrom('categories')
          .select(['id', 'company_id', 'project_id', 'name', 'created_at', 'updated_at'])
          .where('project_id', '=', args.projectId)
          .execute(),
        db
          .selectFrom('sub_categories')
          .select(['id', 'company_id', 'project_id', 'category_id', 'name', 'created_at', 'updated_at'])
          .where('project_id', '=', args.projectId)
          .execute(),
      ]);

    const defaultCategories = defaultCategoriesRows.map((row) => ({
      id: asCompanyDefaultCategoryId(row.id),
      companyId: row.company_id as CompanyId,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies CompanyDefaultCategory[];
    const defaultSubCategories = defaultSubCategoriesRows.map((row) => ({
      id: asCompanyDefaultSubCategoryId(row.id),
      companyId: row.company_id as CompanyId,
      companyDefaultCategoryId: asCompanyDefaultCategoryId(row.company_default_category_id),
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies CompanyDefaultSubCategory[];
    const mappingRules = mappingRuleRows.map((row) => ({
      id: asCompanyDefaultMappingRuleId(row.id),
      companyId: row.company_id as CompanyId,
      matchText: row.match_text,
      companyDefaultCategoryId: asCompanyDefaultCategoryId(row.company_default_category_id),
      companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(row.company_default_sub_category_id),
      sortOrder: Number(row.sort_order),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies CompanyDefaultMappingRule[];
    const projectCategories = projectCategoryRows.map((row) => ({
      id: asCategoryId(row.id),
      companyId: row.company_id as CompanyId,
      projectId: row.project_id as ProjectId,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies Category[];
    const projectSubCategories = projectSubCategoryRows.map((row) => ({
      id: asSubCategoryId(row.id),
      companyId: row.company_id as CompanyId,
      projectId: row.project_id as ProjectId,
      categoryId: asCategoryId(row.category_id),
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies SubCategory[];

    const autoMappedIncoming = normalizedIncoming.map((txn) =>
      mapImportedTransactionWithCompanyDefaults({
        txn,
        rules: mappingRules,
        defaultCategories,
        defaultSubCategories,
        projectCategories,
        projectSubCategories,
      })
    );

    const budgetTargets = args.autoCreateBudgets ? uniqAutoBudgetTargets(autoMappedIncoming) : [];

    if (args.mode === 'replaceAll') {
      assertUniqueTransactionKeysInProject(autoMappedIncoming);
      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('txns').where('project_id', '=', args.projectId).execute();
        if (budgetTargets.length) {
          const existingBudgetRows = await trx
            .selectFrom('budget_lines')
            .select(['sub_category_id'])
            .where('project_id', '=', args.projectId)
            .where('sub_category_id', 'in', budgetTargets.map((target) => target.subCategoryId))
            .execute();
          const existingBudgetSubIds = new Set(
            existingBudgetRows
              .map((row) => row.sub_category_id)
              .filter((value): value is string => Boolean(value))
          );
          const missingBudgetTargets = budgetTargets.filter(
            (target) => !existingBudgetSubIds.has(target.subCategoryId)
          );
          if (missingBudgetTargets.length) {
            await trx
              .insertInto('budget_lines')
              .values(
                missingBudgetTargets.map((target) => ({
                  id: asBudgetLineId(uid('bud')),
                  company_id: project.company_id as CompanyId,
                  project_id: args.projectId,
                  category_id: target.categoryId,
                  sub_category_id: target.subCategoryId,
                  allocated_cents: 0,
                  created_at: now,
                  updated_at: now,
                }))
              )
              .execute();
          }
        }
        if (!autoMappedIncoming.length) return;
        await trx
          .insertInto('txns')
          .values(
            autoMappedIncoming.map((t) => ({
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
              company_default_mapping_rule_id: t.companyDefaultMappingRuleId ?? null,
              coding_source: t.codingSource ?? null,
              coding_pending_approval: !!t.codingPendingApproval,
              created_at: t.createdAt ?? now,
              updated_at: now,
            }))
          )
          .execute();
      });
      return { count: autoMappedIncoming.length };
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
    const nextForCheck = [...existingForCheck, ...autoMappedIncoming];
    assertUniqueTransactionKeysInProject(nextForCheck);

    if (autoMappedIncoming.length) {
      const now = new Date().toISOString();
      if (budgetTargets.length) {
        const existingBudgetRows = await db
          .selectFrom('budget_lines')
          .select(['sub_category_id'])
          .where('project_id', '=', args.projectId)
          .where('sub_category_id', 'in', budgetTargets.map((target) => target.subCategoryId))
          .execute();
        const existingBudgetSubIds = new Set(
          existingBudgetRows
            .map((row) => row.sub_category_id)
            .filter((value): value is string => Boolean(value))
        );
        const missingBudgetTargets = budgetTargets.filter(
          (target) => !existingBudgetSubIds.has(target.subCategoryId)
        );
        if (missingBudgetTargets.length) {
          await db
            .insertInto('budget_lines')
            .values(
              missingBudgetTargets.map((target) => ({
                id: asBudgetLineId(uid('bud')),
                company_id: project.company_id as CompanyId,
                project_id: args.projectId,
                category_id: target.categoryId,
                sub_category_id: target.subCategoryId,
                allocated_cents: 0,
                created_at: now,
                updated_at: now,
              }))
            )
            .execute();
        }
      }
      await db
        .insertInto('txns')
        .values(
          autoMappedIncoming.map((t) => ({
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
            company_default_mapping_rule_id: t.companyDefaultMappingRuleId ?? null,
            coding_source: t.codingSource ?? null,
            coding_pending_approval: !!t.codingPendingApproval,
            created_at: t.createdAt ?? now,
            updated_at: now,
          }))
        )
        .execute();
    }
    return { count: autoMappedIncoming.length };
  });
}

export async function previewImportTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  csvText: string;
  autoCreateStructures?: boolean;
}): Promise<{ rows: ImportPreviewRow[] }> {
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

    const [existingRows, defaultCategoriesRows, defaultSubCategoriesRows, mappingRuleRows, projectCategoryRows, projectSubCategoryRows, budgetRows, canEditTaxonomy, canEditBudgets] =
      await Promise.all([
        db
          .selectFrom('txns')
          .select(['public_id', 'external_id'])
          .where('project_id', '=', args.projectId)
          .execute(),
        db
          .selectFrom('company_default_categories')
          .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
          .where('company_id', '=', project.company_id as CompanyId)
          .execute(),
        db
          .selectFrom('company_default_sub_categories')
          .select([
            'id',
            'company_id',
            'company_default_category_id',
            'name',
            'created_at',
            'updated_at',
          ])
          .where('company_id', '=', project.company_id as CompanyId)
          .execute(),
        db
          .selectFrom('company_default_mapping_rules')
          .select([
            'id',
            'company_id',
            'match_text',
            'company_default_category_id',
            'company_default_sub_category_id',
            'sort_order',
            'created_at',
            'updated_at',
          ])
          .where('company_id', '=', project.company_id as CompanyId)
          .orderBy('sort_order', 'asc')
          .orderBy('created_at', 'asc')
          .execute(),
        db
          .selectFrom('categories')
          .select(['id', 'company_id', 'project_id', 'name', 'created_at', 'updated_at'])
          .where('project_id', '=', args.projectId)
          .execute(),
        db
          .selectFrom('sub_categories')
          .select(['id', 'company_id', 'project_id', 'category_id', 'name', 'created_at', 'updated_at'])
          .where('project_id', '=', args.projectId)
          .execute(),
        db
          .selectFrom('budget_lines')
          .select(['id', 'company_id', 'project_id', 'category_id', 'sub_category_id', 'allocated_cents', 'created_at', 'updated_at'])
          .where('project_id', '=', args.projectId)
          .execute(),
        isAuthorized({
          db,
          userId,
          action: 'taxonomy:edit',
          companyId: project.company_id as CompanyId,
          projectId: args.projectId,
        }),
        isAuthorized({
          db,
          userId,
          action: 'budget:edit',
          companyId: project.company_id as CompanyId,
          projectId: args.projectId,
        }),
      ]);

    const rows = parseCsv(args.csvText);
    const importTxns = rowsToImportTxns(rows);

    const existingKeys = new Set(
      existingRows.map((txn) => {
        const normalizedExternalId = normalizeExternalId(txn.external_id);
        return normalizedExternalId ? `external:${normalizedExternalId}` : `id:${txn.public_id}`;
      })
    );

    const defaultCategories = defaultCategoriesRows.map((row) => ({
      id: asCompanyDefaultCategoryId(row.id),
      companyId: row.company_id as CompanyId,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies CompanyDefaultCategory[];
    const defaultSubCategories = defaultSubCategoriesRows.map((row) => ({
      id: asCompanyDefaultSubCategoryId(row.id),
      companyId: row.company_id as CompanyId,
      companyDefaultCategoryId: asCompanyDefaultCategoryId(row.company_default_category_id),
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies CompanyDefaultSubCategory[];
    const mappingRules = mappingRuleRows.map((row) => ({
      id: asCompanyDefaultMappingRuleId(row.id),
      companyId: row.company_id as CompanyId,
      matchText: row.match_text,
      companyDefaultCategoryId: asCompanyDefaultCategoryId(row.company_default_category_id),
      companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(row.company_default_sub_category_id),
      sortOrder: Number(row.sort_order),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies CompanyDefaultMappingRule[];
    const projectCategories = projectCategoryRows.map((row) => ({
      id: asCategoryId(row.id),
      companyId: row.company_id as CompanyId,
      projectId: row.project_id as ProjectId,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies Category[];
    const projectSubCategories = projectSubCategoryRows.map((row) => ({
      id: asSubCategoryId(row.id),
      companyId: row.company_id as CompanyId,
      projectId: row.project_id as ProjectId,
      categoryId: asCategoryId(row.category_id),
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) satisfies SubCategory[];
    const budgets = budgetRows
      .filter((row) => Boolean(row.category_id))
      .map((row) => ({
        id: asBudgetLineId(row.id),
        companyId: row.company_id as CompanyId,
        projectId: row.project_id as ProjectId,
        categoryId: asCategoryId(row.category_id as string),
        subCategoryId: row.sub_category_id ? asSubCategoryId(row.sub_category_id) : undefined,
        allocatedCents: Number(row.allocated_cents),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })) satisfies BudgetLine[];

    return {
      rows: buildImportPreview({
        importTxns,
        existingKeys,
        categories: projectCategories,
        subCategories: projectSubCategories,
        budgets,
        defaultCategories,
        defaultSubCategories,
        mappingRules,
        autoCreateTaxonomy: Boolean(args.autoCreateStructures),
        canEditTaxonomy,
        autoCreateBudgets: Boolean(args.autoCreateStructures),
        canEditBudgets,
      }),
    };
  });
}
