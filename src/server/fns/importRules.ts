import { AppError } from '../../api/errors';
import type {
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
} from '../../api/types';
import type { CompanyId, ImportRule, ProjectId } from '../../types';
import { asCompanyId, asImportRuleId, asProjectId } from '../../types';
import { defaultPowerBiImportRules } from '../../utils/powerBiImport';
import { uid } from '../../utils/id';
import {
  buildDetachedProjectStandardMetadata,
  buildInheritedProjectStandardMetadata,
  buildLocalProjectStandardMetadata,
  shouldApplyInheritedUpdate,
} from '../sync/projectStandards';
import { requireOperationalProjectForAction } from './resourceGuards';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { requireAuthorized } from '../auth/authorize';

type ImportRuleRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  name: ImportRule['name'];
  origin_scope: 'company' | 'project' | null;
  origin_company_item_id: string | null;
  sync_status: 'local' | 'inherited' | 'overridden' | 'detached' | null;
  last_synced_at: string | null;
  source_updated_at_snapshot: string | null;
  action: ImportRule['action'];
  field: ImportRule['field'];
  operator: ImportRule['operator'];
  value: ImportRule['value'];
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

async function requireCompanyContext(
  context: ServerFnContextInput,
  companyId: CompanyId
) {
  const db = getDb();
  const userId = await requireServerUserId(context);
  const company = await db
    .selectFrom('companies')
    .select('id')
    .where('id', '=', companyId)
    .executeTakeFirst();
  if (!company) throw new AppError('NOT_FOUND', 'Unknown company');
  return { db, userId };
}

function toImportRule(row: ImportRuleRow): ImportRule {
  return {
    id: asImportRuleId(row.id),
    companyId: asCompanyId(row.company_id),
    scope: row.project_id ? 'project' : 'company',
    projectId: row.project_id ? asProjectId(row.project_id) : undefined,
    name: row.name,
    originScope: row.origin_scope ?? undefined,
    originCompanyItemId: row.origin_company_item_id ?? undefined,
    syncStatus: row.sync_status ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    sourceUpdatedAtSnapshot: row.source_updated_at_snapshot ?? undefined,
    action: row.action,
    field: row.field,
    operator: row.operator,
    value: row.value,
    sortOrder: row.sort_order,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function importRuleSelectColumns() {
  return [
    'id',
    'company_id',
    'project_id',
    'name',
    'origin_scope',
    'origin_company_item_id',
    'sync_status',
    'last_synced_at',
    'source_updated_at_snapshot',
    'action',
    'field',
    'operator',
    'value',
    'sort_order',
    'enabled',
    'created_at',
    'updated_at',
  ] as const;
}

function importRuleFingerprint(
  row: Pick<ImportRuleRow, 'name' | 'action' | 'field' | 'operator' | 'value'>
) {
  return [
    row.name.trim().toLowerCase(),
    row.action,
    row.field,
    row.operator,
    row.value.trim(),
  ].join('|');
}

function compareProjectImportRules(a: ImportRuleRow, b: ImportRuleRow) {
  const aGroup = a.sync_status === 'inherited' ? 1 : 0;
  const bGroup = b.sync_status === 'inherited' ? 1 : 0;
  if (aGroup !== bGroup) return aGroup - bGroup;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at.localeCompare(b.created_at);
}

async function listSyncedProjectIdsForCompany(args: {
  db: ReturnType<typeof getDb>;
  companyId: CompanyId;
}) {
  const rows = await args.db
    .selectFrom('projects')
    .select('id')
    .where('company_id', '=', args.companyId)
    .where('project_type', '=', 'project')
    .where('sync_company_defaults', '=', true)
    .execute();
  return rows.map((row) => asProjectId(row.id));
}

async function ensureDefaultImportRules(companyId: CompanyId): Promise<void> {
  const db = getDb();
  const existing = await db
    .selectFrom('import_rules')
    .select('id')
    .where('company_id', '=', companyId)
    .where('project_id', 'is', null)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date().toISOString();
  await db
    .insertInto('import_rules')
    .values(
      defaultPowerBiImportRules(companyId).map((rule) => ({
        id: asImportRuleId(uid('impr')),
        company_id: companyId,
        project_id: null,
        name: rule.name,
        origin_scope: null,
        origin_company_item_id: null,
        sync_status: null,
        last_synced_at: null,
        source_updated_at_snapshot: null,
        action: rule.action,
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        sort_order: rule.sortOrder,
        enabled: rule.enabled,
        created_at: now,
        updated_at: now,
      }))
    )
    .execute();
}

function assertCompanyScopeInput(
  input: ImportRuleCreateInput,
  companyId: CompanyId
) {
  if (input.companyId !== companyId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Import Rule companyId does not match target company'
    );
  }
  if (input.scope !== 'company') {
    throw new AppError(
      'VALIDATION_ERROR',
      'Company import rules must use company scope'
    );
  }
  if (input.projectId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Company import rules cannot include a projectId'
    );
  }
}

function assertProjectScopeInput(args: {
  input: ImportRuleCreateInput;
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const { input, companyId, projectId } = args;
  if (input.companyId !== companyId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Import Rule companyId does not match project company'
    );
  }
  if (input.scope !== 'project') {
    throw new AppError(
      'VALIDATION_ERROR',
      'Project import rules must use project scope'
    );
  }
  if (input.projectId !== projectId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Import Rule projectId does not match target project'
    );
  }
}

export async function syncCompanyImportRulesToProject(args: {
  db: ReturnType<typeof getDb>;
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  await ensureDefaultImportRules(args.companyId);

  const [companyRules, projectRules] = await Promise.all([
    args.db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
    args.db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .execute(),
  ]);

  const now = new Date().toISOString();
  const companyRuleIds = new Set(companyRules.map((rule) => rule.id));

  for (const companyRule of companyRules) {
    const inherited = projectRules.find(
      (rule) => rule.origin_company_item_id === companyRule.id
    );
    const exactLocalDuplicate = projectRules.find(
      (rule) =>
        rule.origin_company_item_id == null &&
        importRuleFingerprint(rule) === importRuleFingerprint(companyRule)
    );

    if (inherited) {
      if (!shouldApplyInheritedUpdate(inherited.sync_status)) continue;
      await args.db
        .updateTable('import_rules')
        .set({
          name: companyRule.name,
          action: companyRule.action,
          field: companyRule.field,
          operator: companyRule.operator,
          value: companyRule.value,
          sort_order: companyRule.sort_order,
          enabled: companyRule.enabled,
          ...buildInheritedProjectStandardMetadata({
            companyItemId: companyRule.id,
            sourceUpdatedAt: companyRule.updated_at,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('id', '=', inherited.id)
        .execute();
      continue;
    }

    if (exactLocalDuplicate) continue;

    await args.db
      .insertInto('import_rules')
      .values({
        id: asImportRuleId(uid('impr')),
        company_id: args.companyId,
        project_id: args.projectId,
        name: companyRule.name,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: companyRule.id,
          sourceUpdatedAt: companyRule.updated_at,
          nowIso: now,
        }),
        action: companyRule.action,
        field: companyRule.field,
        operator: companyRule.operator,
        value: companyRule.value,
        sort_order: companyRule.sort_order,
        enabled: companyRule.enabled,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  const staleProjectRules = projectRules.filter(
    (rule) =>
      rule.origin_company_item_id &&
      !companyRuleIds.has(rule.origin_company_item_id) &&
      rule.sync_status !== 'detached'
  );

  for (const staleRule of staleProjectRules) {
    await args.db
      .updateTable('import_rules')
      .set({
        ...buildDetachedProjectStandardMetadata({
          companyItemId: staleRule.origin_company_item_id!,
          previousSourceUpdatedAt: staleRule.source_updated_at_snapshot,
          nowIso: now,
        }),
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('id', '=', staleRule.id)
      .execute();
  }
}

export async function syncCompanyImportRulesToSyncedProjects(args: {
  db: ReturnType<typeof getDb>;
  companyId: CompanyId;
}) {
  const syncedProjectIds = await listSyncedProjectIdsForCompany({
    db: args.db,
    companyId: args.companyId,
  });
  for (const projectId of syncedProjectIds) {
    await syncCompanyImportRulesToProject({
      db: args.db,
      companyId: args.companyId,
      projectId,
    });
  }
}

export async function listImportRulesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<ImportRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyContext(
      args.context,
      args.companyId
    );
    await requireAuthorized({
      db,
      userId,
      action: 'company:view',
      companyId: args.companyId,
    });
    await ensureDefaultImportRules(args.companyId);

    const rows = await db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toImportRule);
  });
}

export async function listProjectImportRulesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ImportRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );

    const rows = await db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .execute();
    return rows.sort(compareProjectImportRules).map(toImportRule);
  });
}

export async function createImportRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: ImportRuleCreateInput;
}): Promise<ImportRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyContext(
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

      await syncCompanyImportRulesToSyncedProjects({
        db: trx as unknown as ReturnType<typeof getDb>,
        companyId: args.companyId,
      });

      return created;
    });
    return toImportRule(row);
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
    return toImportRule(row);
  });
}

export async function updateImportRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: ImportRuleUpdateInput;
}): Promise<ImportRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyContext(
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

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof args.input.name === 'string')
      patch.name = args.input.name.trim();
    if (typeof args.input.action !== 'undefined')
      patch.action = args.input.action;
    if (typeof args.input.field !== 'undefined') patch.field = args.input.field;
    if (typeof args.input.operator !== 'undefined')
      patch.operator = args.input.operator;
    if (typeof args.input.value === 'string')
      patch.value = args.input.value.trim();
    if (typeof args.input.sortOrder === 'number')
      patch.sort_order = args.input.sortOrder;
    if (typeof args.input.enabled === 'boolean')
      patch.enabled = args.input.enabled;

    const row = await db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable('import_rules')
        .set(patch)
        .where('company_id', '=', args.companyId)
        .where('project_id', 'is', null)
        .where('id', '=', args.input.id)
        .returning(importRuleSelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyImportRulesToSyncedProjects({
        db: trx as unknown as ReturnType<typeof getDb>,
        companyId: args.companyId,
      });

      return updated;
    });
    return toImportRule(row);
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

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof args.input.name === 'string')
      patch.name = args.input.name.trim();
    if (typeof args.input.action !== 'undefined')
      patch.action = args.input.action;
    if (typeof args.input.field !== 'undefined') patch.field = args.input.field;
    if (typeof args.input.operator !== 'undefined')
      patch.operator = args.input.operator;
    if (typeof args.input.value === 'string')
      patch.value = args.input.value.trim();
    if (typeof args.input.sortOrder === 'number')
      patch.sort_order = args.input.sortOrder;
    if (typeof args.input.enabled === 'boolean')
      patch.enabled = args.input.enabled;
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
    return toImportRule(row);
  });
}

export async function deleteImportRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  ruleId: ImportRule['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyContext(
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

      await trx
        .updateTable('import_rules')
        .set({
          ...buildDetachedProjectStandardMetadata({
            companyItemId: existing.id,
            previousSourceUpdatedAt: existing.updated_at,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('origin_company_item_id', '=', existing.id)
        .execute();
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
    await ensureDefaultImportRules(companyId);

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
        await syncCompanyImportRulesToSyncedProjects({
          db: trx as unknown as ReturnType<typeof getDb>,
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

      await syncCompanyImportRulesToSyncedProjects({
        db: trx as unknown as ReturnType<typeof getDb>,
        companyId,
      });

      return inserted;
    });

    return toImportRule(row);
  });
}
