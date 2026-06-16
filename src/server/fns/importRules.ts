import { AppError } from '../../api/errors';
import type {
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
} from '../../api/types';
import type { CompanyId, ImportRule, ProjectId } from '../../types';
import { asCompanyId, asImportRuleId, asProjectId } from '../../types';
import { defaultPowerBiImportRules } from '../../utils/powerBiImport';
import { uid } from '../../utils/id';
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
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toImportRule);
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
    const row = await db
      .insertInto('import_rules')
      .values({
        id: args.input.id ?? asImportRuleId(uid('impr')),
        company_id: args.companyId,
        project_id: null,
        name: args.input.name.trim(),
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

    const row = await db
      .updateTable('import_rules')
      .set(patch)
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .where('id', '=', args.input.id)
      .returning(importRuleSelectColumns())
      .executeTakeFirstOrThrow();
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
      .select('id')
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
    await db
      .deleteFrom('import_rules')
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .where('id', '=', args.ruleId)
      .execute();
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

    const existingCompanyRule = await db
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
      return toImportRule(existingCompanyRule);
    }

    const maxSortOrderRow = await db
      .selectFrom('import_rules')
      .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
      .where('company_id', '=', companyId)
      .where('project_id', 'is', null)
      .executeTakeFirst();

    const now = new Date().toISOString();
    const inserted = await db
      .insertInto('import_rules')
      .values({
        id: asImportRuleId(uid('impr')),
        company_id: companyId,
        project_id: null,
        name: projectRule.name.trim(),
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

    return toImportRule(inserted);
  });
}
