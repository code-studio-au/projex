import type {
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
} from '../../../api/types';
import type { CompanyId, ImportRule, ProjectId } from '../../../types';
import { asCompanyId, asImportRuleId, asProjectId } from '../../../types';
import { AppError } from '../../../api/errors';

export type ImportRuleRow = {
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

export function toImportRule(row: ImportRuleRow): ImportRule {
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

export function importRuleSelectColumns() {
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

export function importRuleFingerprint(
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

export function assertCompanyScopeInput(
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

export function assertProjectScopeInput(args: {
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

export function buildImportRulePatch(input: ImportRuleUpdateInput) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof input.name === 'string') patch.name = input.name.trim();
  if (typeof input.action !== 'undefined') patch.action = input.action;
  if (typeof input.field !== 'undefined') patch.field = input.field;
  if (typeof input.operator !== 'undefined') patch.operator = input.operator;
  if (typeof input.value === 'string') patch.value = input.value.trim();
  if (typeof input.sortOrder === 'number') patch.sort_order = input.sortOrder;
  if (typeof input.enabled === 'boolean') patch.enabled = input.enabled;
  return patch;
}
