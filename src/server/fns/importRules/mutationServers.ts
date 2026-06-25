import { AppError } from '../../../api/errors';
import type {
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
} from '../../../api/types';
import type { CompanyId, ImportRule, ProjectId } from '../../../types';
import { asImportRuleId } from '../../../types';
import { uid } from '../../../utils/id';
import { buildLocalProjectStandardMetadata } from '../../sync/projectStandards';
import { requireAuthorized } from '../../auth/authorize';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  assertCompanyScopeInput,
  assertProjectScopeInput,
  buildImportRulePatch,
  importRuleSelectColumns,
  requireCompanyRuleContext,
  toImportRule,
  type ImportRuleRow,
} from './shared';
import {
  detachProjectImportRulesForDeletedCompanyRule,
  syncCompanyImportRulesToSyncedProjects as syncCompanyImportRulesToSyncedProjectsInternal,
} from './sync';

export async function createImportRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: ImportRuleCreateInput;
}): Promise<ImportRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyRuleContext(
      args.context,
      args.companyId
    );
    await requireAuthorized({
      db,
      userId,
      action: 'company:manage_defaults',
      companyId: args.companyId,
    });
    assertCompanyScopeInput(args.input, args.companyId);

    const now = new Date().toISOString();
    const row = await db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('import_rules')
        .values({
          id: args.input.id ?? asImportRuleId(uid('impr')),
          company_id: args.companyId,
          project_id: null,
          name: args.input.name.trim(),
          origin_scope: null,
          origin_company_item_id: null,
          sync_status: null,
          last_synced_at: null,
          source_updated_at_snapshot: null,
          action: args.input.action,
          field: args.input.field,
          operator: args.input.operator,
          value: args.input.value.trim(),
          sort_order: args.input.sortOrder,
          enabled: args.input.enabled,
          created_at: now,
          updated_at: now,
        })
        .returning(importRuleSelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyImportRulesToSyncedProjectsInternal({
        db: trx,
        companyId: args.companyId,
      });

      return created;
    });
    return toImportRule(row as ImportRuleRow);
  });
}

export async function createProjectImportRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: ImportRuleCreateInput;
}): Promise<ImportRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, companyId } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );
    assertProjectScopeInput({
      input: args.input,
      companyId,
      projectId: args.projectId,
    });

    const now = new Date().toISOString();
    const row = await db
      .insertInto('import_rules')
      .values({
        id: args.input.id ?? asImportRuleId(uid('impr')),
        company_id: companyId,
        project_id: args.projectId,
        name: args.input.name.trim(),
        ...buildLocalProjectStandardMetadata(now),
        action: args.input.action,
        field: args.input.field,
        operator: args.input.operator,
        value: args.input.value.trim(),
        sort_order: args.input.sortOrder,
        enabled: args.input.enabled,
        created_at: now,
        updated_at: now,
      })
      .returning(importRuleSelectColumns())
      .executeTakeFirstOrThrow();
    return toImportRule(row as ImportRuleRow);
  });
}

export async function updateImportRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: ImportRuleUpdateInput;
}): Promise<ImportRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyRuleContext(
      args.context,
      args.companyId
    );
    await requireAuthorized({
      db,
      userId,
      action: 'company:manage_defaults',
      companyId: args.companyId,
    });

    const existing = await db
      .selectFrom('import_rules')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown Import Rule');

    const patch = buildImportRulePatch(args.input);

    const row = await db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable('import_rules')
        .set(patch)
        .where('company_id', '=', args.companyId)
        .where('project_id', 'is', null)
        .where('id', '=', args.input.id)
        .returning(importRuleSelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyImportRulesToSyncedProjectsInternal({
        db: trx,
        companyId: args.companyId,
      });

      return updated;
    });
    return toImportRule(row as ImportRuleRow);
  });
}

export async function updateProjectImportRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: ImportRuleUpdateInput;
}): Promise<ImportRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );

    const existing = await db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown Import Rule');

    const patch = buildImportRulePatch(args.input);
    if (
      existing.origin_scope === 'company' &&
      existing.sync_status === 'inherited'
    ) {
      patch.sync_status = 'overridden';
      patch.last_synced_at = new Date().toISOString();
    }

    const row = await db
      .updateTable('import_rules')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning(importRuleSelectColumns())
      .executeTakeFirstOrThrow();
    return toImportRule(row as ImportRuleRow);
  });
}

export async function deleteImportRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  ruleId: ImportRule['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyRuleContext(
      args.context,
      args.companyId
    );
    await requireAuthorized({
      db,
      userId,
      action: 'company:manage_defaults',
      companyId: args.companyId,
    });

    const existing = await db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .where('id', '=', args.ruleId)
      .executeTakeFirst();
    if (!existing) return;

    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('import_rules')
        .where('company_id', '=', args.companyId)
        .where('project_id', 'is', null)
        .where('id', '=', args.ruleId)
        .execute();

      await detachProjectImportRulesForDeletedCompanyRule({
        db: trx,
        companyRuleId: existing.id,
        previousSourceUpdatedAt: existing.updated_at,
        nowIso: now,
      });
    });
  });
}

export async function deleteProjectImportRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  ruleId: ImportRule['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );

    const existing = await db
      .selectFrom('import_rules')
      .select(['id', 'origin_scope', 'sync_status'])
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.ruleId)
      .executeTakeFirst();
    if (!existing) return;
    if (
      existing.origin_scope === 'company' &&
      existing.sync_status === 'inherited'
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Inherited company import rules cannot be deleted from a synced project.'
      );
    }

    await db
      .deleteFrom('import_rules')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.ruleId)
      .execute();
  });
}

export async function promoteProjectImportRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  ruleId: ImportRule['id'];
}): Promise<ImportRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId, companyId } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );
    await requireAuthorized({
      db,
      userId,
      action: 'company:manage_defaults',
      companyId,
      projectId: args.projectId,
    });
    const projectRule = await db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.ruleId)
      .executeTakeFirst();
    if (!projectRule) {
      throw new AppError('NOT_FOUND', 'Unknown project import rule');
    }

    const row = await db.transaction().execute(async (trx) => {
      const existingCompanyRule = await trx
        .selectFrom('import_rules')
        .select(importRuleSelectColumns())
        .where('company_id', '=', companyId)
        .where('project_id', 'is', null)
        .where(({ eb, fn, and }) =>
          and([
            eb(fn('lower', ['name']), '=', projectRule.name.toLowerCase()),
            eb('action', '=', projectRule.action),
            eb('field', '=', projectRule.field),
            eb('operator', '=', projectRule.operator),
            eb('value', '=', projectRule.value),
          ])
        )
        .executeTakeFirst();
      if (existingCompanyRule) {
        await syncCompanyImportRulesToSyncedProjectsInternal({
          db: trx,
          companyId,
        });
        return existingCompanyRule;
      }

      const maxSortOrderRow = await trx
        .selectFrom('import_rules')
        .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
        .where('company_id', '=', companyId)
        .where('project_id', 'is', null)
        .executeTakeFirst();

      const now = new Date().toISOString();
      const inserted = await trx
        .insertInto('import_rules')
        .values({
          id: asImportRuleId(uid('impr')),
          company_id: companyId,
          project_id: null,
          name: projectRule.name.trim(),
          origin_scope: null,
          origin_company_item_id: null,
          sync_status: null,
          last_synced_at: null,
          source_updated_at_snapshot: null,
          action: projectRule.action,
          field: projectRule.field,
          operator: projectRule.operator,
          value: projectRule.value.trim(),
          sort_order: (maxSortOrderRow?.max_sort_order ?? 0) + 10,
          enabled: projectRule.enabled,
          created_at: now,
          updated_at: now,
        })
        .returning(importRuleSelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyImportRulesToSyncedProjectsInternal({
        db: trx,
        companyId,
      });

      return inserted;
    });

    return toImportRule(row as ImportRuleRow);
  });
}
