import { AppError } from '../../api/errors';
import type {
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
} from '../../api/types';
import type { CompanyId, ImportRule } from '../../types';
import { asCompanyId, asImportRuleId } from '../../types';
import { defaultPowerBiImportRules } from '../../utils/powerBiImport';
import { uid } from '../../utils/id';
import type { Action } from '../../utils/auth';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

type ImportRuleRow = {
  id: string;
  company_id: string;
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
  companyId: CompanyId,
  action: Action
) {
  const db = getDb();
  const userId = await requireServerUserId(context);
  const company = await db
    .selectFrom('companies')
    .select('id')
    .where('id', '=', companyId)
    .executeTakeFirst();
  if (!company) throw new AppError('NOT_FOUND', 'Unknown company');
  await requireAuthorized({ db, userId, action, companyId });
  return { db, userId };
}

function toImportRule(row: ImportRuleRow): ImportRule {
  return {
    id: asImportRuleId(row.id),
    companyId: asCompanyId(row.company_id),
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
    .executeTakeFirst();
  if (existing) return;

  const now = new Date().toISOString();
  await db
    .insertInto('import_rules')
    .values(
      defaultPowerBiImportRules(companyId).map((rule) => ({
        id: asImportRuleId(uid('impr')),
        company_id: companyId,
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

export async function listImportRulesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<ImportRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:view');
    await ensureDefaultImportRules(args.companyId);

    const rows = await getDb()
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('company_id', '=', args.companyId)
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
    await requireCompanyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    if (args.input.companyId !== args.companyId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Import Rule companyId does not match target company'
      );
    }

    const now = new Date().toISOString();
    const row = await getDb()
      .insertInto('import_rules')
      .values({
        id: args.input.id ?? asImportRuleId(uid('impr')),
        company_id: args.companyId,
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
    await requireCompanyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );

    const existing = await getDb()
      .selectFrom('import_rules')
      .select('id')
      .where('company_id', '=', args.companyId)
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

    const row = await getDb()
      .updateTable('import_rules')
      .set(patch)
      .where('company_id', '=', args.companyId)
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
    await requireCompanyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    await getDb()
      .deleteFrom('import_rules')
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.ruleId)
      .execute();
  });
}
