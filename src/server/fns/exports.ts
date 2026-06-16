import ExcelJS from 'exceljs';
import type { Kysely } from 'kysely';

import { AppError } from '../../api/errors';
import type {
  CompanyExportOptions,
  CompanyId,
  CompanySummaryProject,
  Project,
  ProjectId,
  UserId,
} from '../../types';
import { asCompanyId, asProjectId } from '../../types';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { getDb } from '../db/db';
import type { DB } from '../db/schema';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

type CompanyExportResult = {
  bytes: Uint8Array;
  fileName: string;
};

type WorksheetRowValue = string | number | boolean | null | undefined;

type WorksheetColumn = {
  header: string;
  key: string;
  width?: number;
  style?: Partial<ExcelJS.Style>;
};

type ProjectExportRow = {
  id: string;
  company_id: string;
  name: string;
  project_type: 'project' | 'programme';
  parent_project_id: string | null;
  budget_total_cents: number;
  currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
  status: 'active' | 'archived';
  deactivated_at: string | null;
  visibility: 'company' | 'private';
  allow_superadmin_access: boolean;
  sync_company_defaults: boolean;
  allow_txn_transfers: boolean;
};

type TransactionExportRow = {
  transactionId: string;
  internalId: string;
  projectId: string;
  projectName: string;
  programmeId: string;
  programmeName: string;
  currency: string;
  date: string;
  item: string;
  description: string;
  externalId: string;
  amountCents: number;
  amount: number;
  txnType: string;
  budgetImpact: boolean;
  categorisable: boolean;
  categoryId: string;
  categoryName: string;
  subCategoryId: string;
  subCategoryName: string;
  defaultMappingRuleId: string;
  codingSource: string;
  codingPendingApproval: boolean;
  transferProjectId: string;
  transferProjectName: string;
  parentTxnId: string;
  sourceTxnId: string;
  importBatchId: string;
  importSourceType: string;
  reviewedAt: string;
  reviewedByUserId: string;
  reviewedByUserName: string;
  lockedAt: string;
  lockedByUserId: string;
  lockedByUserName: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectFinanceRollup = {
  budgetCents: number;
  actualCodedCents: number;
  uncodedAmountCents: number;
};

type TaxonomyRollup = {
  projectId: string;
  projectName: string;
  projectType: 'project' | 'programme';
  programmeId: string;
  programmeName: string;
  currency: string;
  categoryId: string;
  categoryName: string;
  subCategoryId: string;
  subCategoryName: string;
  budgetCents: number;
  actualCodedCents: number;
  uncodedAmountCents: number;
  transactionCount: number;
};

const amountStyle: Partial<ExcelJS.Style> = { numFmt: '#,##0.00' };
const percentStyle: Partial<ExcelJS.Style> = { numFmt: '0.00%' };
const COMPANY_EXPORT_CONTRACT_VERSION = '2026.06-v2';

function slugifyCompanyName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'company';
}

function compact<T>(values: Array<T | null | undefined | false>): T[] {
  return values.filter(Boolean) as T[];
}

function centsToMajorUnits(cents: number): number {
  return cents / 100;
}

function buildExportFileName(args: {
  companyName: string;
  options: CompanyExportOptions;
}): string {
  const parts = [
    slugifyCompanyName(args.companyName),
    args.options.scope === 'active' ? 'active' : null,
    args.options.detail === 'summary' ? 'summary' : 'full',
    args.options.fromDate ? `from-${args.options.fromDate}` : null,
    args.options.toDate ? `to-${args.options.toDate}` : null,
    'export',
  ];
  return `${compact(parts).join('-')}.xlsx`;
}

function toProject(row: ProjectExportRow): Project {
  return {
    id: asProjectId(row.id),
    companyId: asCompanyId(row.company_id),
    name: row.name,
    projectType: row.project_type,
    parentProjectId: row.parent_project_id
      ? asProjectId(row.parent_project_id)
      : undefined,
    budgetTotalCents: Number(row.budget_total_cents),
    currency: row.currency,
    status: row.status,
    deactivatedAt: row.deactivated_at ?? undefined,
    visibility: row.visibility,
    allowSuperadminAccess: row.allow_superadmin_access,
    syncCompanyDefaults: row.sync_company_defaults,
    allowTxnTransfers: row.allow_txn_transfers,
  };
}

function flattenSummaryProjects(
  projects: CompanySummaryProject[],
  rows: CompanySummaryProject[] = []
): CompanySummaryProject[] {
  for (const project of projects) {
    rows.push(project);
    if (project.children?.length) {
      flattenSummaryProjects(project.children, rows);
    }
  }
  return rows;
}

function setHeaderStyle(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  freezeRows = true
) {
  const row = worksheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle' };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    };
  });
  if (freezeRows) {
    worksheet.views = [{ state: 'frozen', ySplit: rowNumber }];
  }
}

function autosizeColumns(
  worksheet: ExcelJS.Worksheet,
  minimum = 12,
  maximum = 36
) {
  for (const column of worksheet.columns) {
    let width = minimum;
    if (typeof column.header === 'string') {
      width = Math.max(width, column.header.length + 2);
    }
    if (typeof column.eachCell === 'function') {
      column.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value;
        const text =
          value == null
            ? ''
            : typeof value === 'object' && 'richText' in value
              ? value.richText.map((entry) => entry.text).join('')
              : String(value);
        width = Math.max(width, Math.min(maximum, text.length + 2));
      });
    }
    column.width = Math.min(maximum, width);
  }
}

function createWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: WorksheetColumn[],
  rows: Record<string, WorksheetRowValue>[]
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = columns;
  rows.forEach((row) => worksheet.addRow(row));
  setHeaderStyle(worksheet, 1);
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  autosizeColumns(worksheet);
  return worksheet;
}

function sumProjectMonths(
  project: CompanySummaryProject,
  selector: (month: CompanySummaryProject['months'][number]) => number
): number {
  return project.months.reduce((sum, month) => sum + selector(month), 0);
}

function addOverviewWorksheet(args: {
  workbook: ExcelJS.Workbook;
  companyName: string;
  generatedAt: string;
  options: CompanyExportOptions;
  isScopedForSuperadmin: boolean;
  projectRows: ProjectExportRow[];
  programmeCount: number;
  operationalProjectCount: number;
  budgetCount: number;
  transactionCount: number;
  totalBudgetCents: number;
  totalActualCodedCents: number;
  totalUncodedCents: number;
}) {
  const worksheet = args.workbook.addWorksheet('Overview');
  const sections: string[] = [
    'Projex company export',
    `Company: ${args.companyName}`,
    `Generated at: ${args.generatedAt}`,
    `Export contract version: ${COMPANY_EXPORT_CONTRACT_VERSION}`,
    `Security scope: ${
      args.isScopedForSuperadmin
        ? 'global superadmin visible projects only'
        : 'full company access scope'
    }`,
    `Project filter: ${
      args.options.scope === 'active'
        ? 'active projects and programmes only'
        : 'all visible projects and programmes'
    }`,
    `Workbook detail: ${
      args.options.detail === 'summary'
        ? 'summary reporting pack'
        : 'full audit pack'
    }`,
    `Transaction date range: ${args.options.fromDate ?? 'beginning'} to ${
      args.options.toDate ?? 'latest'
    }`,
    '',
    'Key figures',
    `- ${args.programmeCount} programmes`,
    `- ${args.operationalProjectCount} projects`,
    `- ${args.budgetCount} budget lines`,
    `- ${args.transactionCount} transaction rows`,
    `- ${centsToMajorUnits(args.totalBudgetCents).toFixed(2)} planned budget`,
    `- ${centsToMajorUnits(args.totalActualCodedCents).toFixed(2)} coded actuals`,
    `- ${centsToMajorUnits(args.totalUncodedCents).toFixed(2)} uncoded amount`,
    '',
    'Recommended worksheet order',
    '- Executive Summary: company-level totals and project-level rollup',
    '- Budget vs Actual: core variance analysis by programme and project',
    '- Budget vs Actual Monthly: monthly burn and variance tracking',
    '- Category Rollup / Subcategory Rollup: taxonomy-level budget and spend analysis',
    '- Workflow Summary / Uncoded / Auto-Mapped Pending: coding and review operations',
    '- Detail tabs: audit and reconciliation support',
    '',
    'Model notes',
    '- Programmes are reporting containers and roll up active child projects.',
    '- Currency is preserved row-by-row; aggregate mixed currencies outside this workbook with care.',
    '- IDs and parent relationships are intentionally included for reconciliation.',
    `- ${args.projectRows.filter((row) => row.project_type === 'programme' && row.status === 'active').length} active programmes contribute rolled-up child metrics.`,
  ];
  sections.forEach((line) => worksheet.addRow([line]));
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getColumn(1).width = 120;
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addReadmeWorksheet(args: {
  workbook: ExcelJS.Workbook;
  companyName: string;
  generatedAt: string;
  projectCount: number;
  programmeCount: number;
  transactionCount: number;
  budgetCount: number;
  isScopedForSuperadmin: boolean;
  options: CompanyExportOptions;
}) {
  const worksheet = args.workbook.addWorksheet('README');
  const rows = [
    ['Projex company export'],
    [`Company: ${args.companyName}`],
    [`Generated at: ${args.generatedAt}`],
    [`Export contract version: ${COMPANY_EXPORT_CONTRACT_VERSION}`],
    [
      `Scope: ${args.isScopedForSuperadmin ? 'global superadmin visible projects only' : 'full company access scope'}`,
    ],
    [
      `Project filter: ${args.options.scope === 'active' ? 'active projects/programmes only' : 'all visible projects/programmes'}`,
    ],
    [
      `Workbook detail: ${args.options.detail === 'summary' ? 'summary only' : 'full detail'}`,
    ],
    [
      `Transaction date range: ${args.options.fromDate ?? 'beginning'} to ${args.options.toDate ?? 'latest'}`,
    ],
    [''],
    ['This workbook contains:'],
    [`- ${args.programmeCount} programme rows`],
    [`- ${args.projectCount} project rows`],
    [`- ${args.budgetCount} budget rows`],
    [`- ${args.transactionCount} transaction rows`],
    [''],
    ['Important modeling notes:'],
    ['- Programmes are reporting-only containers.'],
    [
      '- Programme transactions and budgets are not duplicated from sub-projects.',
    ],
    [
      '- Currency is preserved per row; mixed-currency exports should be grouped before aggregation outside Projex.',
    ],
    [
      '- IDs and relationship columns are included intentionally for reconciliation and downstream analysis.',
    ],
  ];
  rows.forEach((values) => worksheet.addRow(values));
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getColumn(1).width = 120;
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addExportMetadataWorksheet(args: {
  workbook: ExcelJS.Workbook;
  companyId: CompanyId;
  companyName: string;
  generatedAt: string;
  options: CompanyExportOptions;
  fileName: string;
  isScopedForSuperadmin: boolean;
  projectCount: number;
  programmeCount: number;
  transactionCount: number;
  budgetCount: number;
}) {
  const worksheet = args.workbook.addWorksheet('Export Metadata');
  worksheet.columns = [
    { header: 'field', key: 'field', width: 32 },
    { header: 'value', key: 'value', width: 72 },
  ];
  const rows = [
    { field: 'contract_version', value: COMPANY_EXPORT_CONTRACT_VERSION },
    { field: 'export_kind', value: 'company_workbook' },
    { field: 'file_name', value: args.fileName },
    { field: 'company_id', value: args.companyId },
    { field: 'company_name', value: args.companyName },
    { field: 'generated_at', value: args.generatedAt },
    {
      field: 'security_scope',
      value: args.isScopedForSuperadmin
        ? 'global_superadmin_visible_projects_only'
        : 'full_company_access_scope',
    },
    { field: 'project_scope', value: args.options.scope },
    { field: 'workbook_detail', value: args.options.detail },
    { field: 'transactions_from', value: args.options.fromDate ?? '' },
    { field: 'transactions_to', value: args.options.toDate ?? '' },
    { field: 'project_count', value: args.projectCount },
    { field: 'programme_count', value: args.programmeCount },
    { field: 'budget_row_count', value: args.budgetCount },
    { field: 'transaction_row_count', value: args.transactionCount },
  ];
  rows.forEach((row) => worksheet.addRow(row));
  setHeaderStyle(worksheet, 1);
  worksheet.state = 'hidden';
}

export async function exportCompanyWorkbookForUser(args: {
  db: Kysely<DB>;
  userId: UserId;
  companyId: CompanyId;
  options: CompanyExportOptions;
}): Promise<CompanyExportResult> {
  const db = args.db;
  const userId = args.userId;

  const company = await db
    .selectFrom('companies')
    .select(['id', 'name', 'status', 'deactivated_at'])
    .where('id', '=', args.companyId)
    .executeTakeFirst();
  if (!company) throw new AppError('NOT_FOUND', 'Unknown company');

  await requireAuthorized({
    db,
    userId,
    action: 'company:export',
    companyId: args.companyId,
  });

  const isSuperadmin = await isGlobalSuperadminUser(userId, db);

  const allProjectRows = await db
    .selectFrom('projects')
    .select([
      'id',
      'company_id',
      'name',
      'project_type',
      'parent_project_id',
      'budget_total_cents',
      'currency',
      'status',
      'deactivated_at',
      'visibility',
      'allow_superadmin_access',
      'sync_company_defaults',
      'allow_txn_transfers',
    ])
    .where('company_id', '=', args.companyId)
    .orderBy('project_type', 'asc')
    .orderBy('name', 'asc')
    .execute();

  const visibleProjectRows = isSuperadmin
    ? allProjectRows.filter((row) => row.allow_superadmin_access)
    : allProjectRows;
  const projectRows =
    args.options.scope === 'active'
      ? visibleProjectRows.filter((row) => row.status === 'active')
      : visibleProjectRows;
  const projectIds = projectRows.map((row) => row.id);
  const projectIdSet = new Set(projectIds);

  const [
    companyMembers,
    projectMemberships,
    categories,
    subCategories,
    budgetLines,
    txns,
    companyDefaultCategories,
    companyDefaultSubCategories,
    companyDefaultMappingRules,
    importRules,
  ] = await Promise.all([
    db
      .selectFrom('company_memberships as cm')
      .innerJoin('users as u', 'u.id', 'cm.user_id')
      .select([
        'cm.company_id as company_id',
        'cm.user_id as user_id',
        'cm.role as role',
        'u.name as user_name',
        'u.email as user_email',
        'u.disabled as user_disabled',
        'u.is_global_superadmin as is_global_superadmin',
      ])
      .where('cm.company_id', '=', args.companyId)
      .orderBy('u.name', 'asc')
      .execute(),
    projectIds.length
      ? db
          .selectFrom('project_memberships as pm')
          .innerJoin('users as u', 'u.id', 'pm.user_id')
          .select([
            'pm.project_id as project_id',
            'pm.user_id as user_id',
            'pm.role as role',
            'u.name as user_name',
            'u.email as user_email',
          ])
          .where('pm.project_id', 'in', projectIds)
          .orderBy('pm.project_id', 'asc')
          .orderBy('u.name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? db
          .selectFrom('categories')
          .select([
            'id',
            'company_id',
            'project_id',
            'name',
            'created_at',
            'updated_at',
          ])
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? db
          .selectFrom('sub_categories')
          .select([
            'id',
            'company_id',
            'project_id',
            'category_id',
            'name',
            'created_at',
            'updated_at',
          ])
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? db
          .selectFrom('budget_lines')
          .select([
            'id',
            'company_id',
            'project_id',
            'category_id',
            'sub_category_id',
            'allocated_cents',
            'created_at',
            'updated_at',
          ])
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('created_at', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? (async () => {
          let query = db
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
              'txn_type',
              'parent_public_id',
              'source_public_id',
              'transfer_project_id',
              'budget_impact',
              'categorisable',
              'import_batch_id',
              'import_source_type',
              'import_source_meta',
              'category_id',
              'sub_category_id',
              'company_default_mapping_rule_id',
              'coding_source',
              'coding_pending_approval',
              'reviewed_at',
              'reviewed_by_user_id',
              'locked_at',
              'locked_by_user_id',
              'created_at',
              'updated_at',
            ])
            .where('project_id', 'in', projectIds);
          if (args.options.fromDate) {
            query = query.where('txn_date', '>=', args.options.fromDate);
          }
          if (args.options.toDate) {
            query = query.where('txn_date', '<=', args.options.toDate);
          }
          return query
            .orderBy('project_id', 'asc')
            .orderBy('txn_date', 'asc')
            .orderBy('id', 'asc')
            .execute();
        })()
      : Promise.resolve([]),
    db
      .selectFrom('company_default_categories')
      .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
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
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
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
      .where('company_id', '=', args.companyId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
    db
      .selectFrom('import_rules')
      .select([
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
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('project_id', 'asc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
  ]);

  const projectById = new Map(projectRows.map((row) => [row.id, row]));
  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const subCategoryById = new Map(subCategories.map((row) => [row.id, row]));
  const defaultCategoryById = new Map(
    companyDefaultCategories.map((row) => [row.id, row])
  );
  const defaultSubCategoryById = new Map(
    companyDefaultSubCategories.map((row) => [row.id, row])
  );
  const userById = new Map(
    companyMembers.map((row) => [
      row.user_id,
      {
        name: row.user_name,
        email: row.user_email,
      },
    ])
  );
  for (const membership of projectMemberships) {
    if (!userById.has(membership.user_id)) {
      userById.set(membership.user_id, {
        name: membership.user_name,
        email: membership.user_email,
      });
    }
  }

  const validSubIdsByProject = new Map<ProjectId, Set<string>>();
  for (const row of subCategories) {
    const projectId = asProjectId(row.project_id);
    const current = validSubIdsByProject.get(projectId) ?? new Set<string>();
    current.add(row.id);
    validSubIdsByProject.set(projectId, current);
  }

  const summaryProjects = buildCompanySummaryProjects({
    projects: projectRows.map(toProject),
    transactions: txns.map((row) => ({
      projectId: asProjectId(row.project_id),
      date: row.txn_date,
      amountCents: Number(row.amount_cents),
      budgetImpact: row.budget_impact,
      subCategoryId: row.sub_category_id,
    })),
    validSubCategoryIdsByProject: validSubIdsByProject,
  });
  const flatSummaryProjects = flattenSummaryProjects(summaryProjects);
  const childCountByProgrammeId = new Map<string, number>();
  for (const row of projectRows.filter(
    (projectRow) => projectRow.project_type === 'project'
  )) {
    if (!row.parent_project_id) continue;
    childCountByProgrammeId.set(
      row.parent_project_id,
      (childCountByProgrammeId.get(row.parent_project_id) ?? 0) + 1
    );
  }

  const transactionsByProjectId = new Map<string, typeof txns>();
  for (const txn of txns) {
    const projectTxns = transactionsByProjectId.get(txn.project_id) ?? [];
    projectTxns.push(txn);
    transactionsByProjectId.set(txn.project_id, projectTxns);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Codex';
  workbook.company = 'Projex';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const generatedAt = new Date().toISOString();
  const programmes = projectRows.filter(
    (row) => row.project_type === 'programme'
  );
  const operationalProjects = projectRows.filter(
    (row) => row.project_type === 'project'
  );
  const totalBudgetCents = projectRows.reduce(
    (sum, row) => sum + Number(row.budget_total_cents),
    0
  );
  const totalTxnCents = txns.reduce(
    (sum, row) => sum + Number(row.amount_cents),
    0
  );
  const totalActualCodedCents = flatSummaryProjects.reduce(
    (sum, project) =>
      sum + sumProjectMonths(project, (month) => month.actualCodedCents),
    0
  );
  const totalUncodedCents = flatSummaryProjects.reduce(
    (sum, project) =>
      sum + sumProjectMonths(project, (month) => month.uncodedAmountCents),
    0
  );
  const exportFileName = buildExportFileName({
    companyName: company.name,
    options: args.options,
  });

  addOverviewWorksheet({
    workbook,
    companyName: company.name,
    generatedAt,
    options: args.options,
    isScopedForSuperadmin: isSuperadmin,
    projectRows,
    programmeCount: programmes.length,
    operationalProjectCount: operationalProjects.length,
    budgetCount: budgetLines.length,
    transactionCount: txns.length,
    totalBudgetCents,
    totalActualCodedCents,
    totalUncodedCents,
  });

  addReadmeWorksheet({
    workbook,
    companyName: company.name,
    generatedAt,
    projectCount: operationalProjects.length,
    programmeCount: programmes.length,
    transactionCount: txns.length,
    budgetCount: budgetLines.length,
    isScopedForSuperadmin: isSuperadmin,
    options: args.options,
  });
  addExportMetadataWorksheet({
    workbook,
    companyId: args.companyId,
    companyName: company.name,
    generatedAt,
    options: args.options,
    fileName: exportFileName,
    isScopedForSuperadmin: isSuperadmin,
    projectCount: operationalProjects.length,
    programmeCount: programmes.length,
    transactionCount: txns.length,
    budgetCount: budgetLines.length,
  });

  const executiveSummary = workbook.addWorksheet('Executive Summary');
  const uncodedTxnCount = txns.filter((row) => !row.sub_category_id).length;
  const lockedTxnCount = txns.filter((row) => !!row.locked_at).length;
  const reviewedTxnCount = txns.filter((row) => !!row.reviewed_at).length;
  const autoMappedPendingTxnCount = txns.filter(
    (row) => row.coding_pending_approval
  ).length;

  const metadataRows = [
    ['Company', company.name],
    ['Company status', company.status],
    ['Generated at', generatedAt],
    ['Project filter', args.options.scope],
    ['Workbook detail', args.options.detail],
    [
      'Transaction date range',
      `${args.options.fromDate ?? 'beginning'} to ${args.options.toDate ?? 'latest'}`,
    ],
    ['Projects in scope', projectRows.length],
    ['Programmes in scope', programmes.length],
    ['Operational projects in scope', operationalProjects.length],
    ['Budget rows', budgetLines.length],
    ['Transaction rows', txns.length],
    ['Total planned budget (major units)', centsToMajorUnits(totalBudgetCents)],
    [
      'Total transaction amount (major units)',
      centsToMajorUnits(totalTxnCents),
    ],
    ['Uncoded transactions', uncodedTxnCount],
    ['Reviewed transactions', reviewedTxnCount],
    ['Locked transactions', lockedTxnCount],
    ['Auto-mapped pending transactions', autoMappedPendingTxnCount],
  ];
  metadataRows.forEach((row) => executiveSummary.addRow(row));
  executiveSummary.addRow([]);
  executiveSummary.addRow([
    'Project ID',
    'Project name',
    'Project type',
    'Parent programme ID',
    'Currency',
    'Status',
    'Budget cents',
    'Budget amount',
    'Actual coded cents',
    'Actual coded amount',
    'Uncoded count',
    'Uncoded amount cents',
    'Uncoded amount',
  ]);
  flatSummaryProjects.forEach((project) => {
    const actualCodedCents = project.months.reduce(
      (sum, month) => sum + month.actualCodedCents,
      0
    );
    const uncodedCount = project.months.reduce(
      (sum, month) => sum + month.uncodedCount,
      0
    );
    const uncodedAmountCents = project.months.reduce(
      (sum, month) => sum + month.uncodedAmountCents,
      0
    );
    executiveSummary.addRow([
      project.id,
      project.name,
      project.projectType,
      project.parentProjectId ?? '',
      project.currency,
      project.status,
      project.budgetCents,
      centsToMajorUnits(project.budgetCents),
      actualCodedCents,
      centsToMajorUnits(actualCodedCents),
      uncodedCount,
      uncodedAmountCents,
      centsToMajorUnits(uncodedAmountCents),
    ]);
  });
  const executiveSummaryHeaderRow = metadataRows.length + 2;
  executiveSummary.getRow(executiveSummaryHeaderRow).font = { bold: true };
  setHeaderStyle(executiveSummary, executiveSummaryHeaderRow);
  executiveSummary.autoFilter = {
    from: { row: executiveSummaryHeaderRow, column: 1 },
    to: { row: executiveSummaryHeaderRow, column: 13 },
  };
  executiveSummary.views = [
    { state: 'frozen', ySplit: executiveSummaryHeaderRow },
  ];
  executiveSummary.columns = [
    { key: 'a', width: 24 },
    { key: 'b', width: 32 },
    { key: 'c', width: 18 },
    { key: 'd', width: 22 },
    { key: 'e', width: 12 },
    { key: 'f', width: 14 },
    { key: 'g', width: 16 },
    { key: 'h', width: 16 },
    { key: 'i', width: 18 },
    { key: 'j', width: 18 },
    { key: 'k', width: 16 },
    { key: 'l', width: 20 },
    { key: 'm', width: 18 },
  ];

  createWorksheet(
    workbook,
    'Programmes',
    [
      { header: 'Programme ID', key: 'programmeId' },
      { header: 'Programme name', key: 'programmeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Status', key: 'status' },
      { header: 'Visibility', key: 'visibility' },
      { header: 'Budget cents', key: 'budgetCents' },
      { header: 'Budget amount', key: 'budgetAmount' },
      { header: 'Sub-project count', key: 'childCount' },
      { header: 'Allow superadmin access', key: 'allowSuperadminAccess' },
      { header: 'Created deactivated at', key: 'deactivatedAt' },
    ],
    programmes.map((row) => ({
      programmeId: row.id,
      programmeName: row.name,
      currency: row.currency,
      status: row.status,
      visibility: row.visibility,
      budgetCents: Number(row.budget_total_cents),
      budgetAmount: centsToMajorUnits(Number(row.budget_total_cents)),
      childCount: childCountByProgrammeId.get(row.id) ?? 0,
      allowSuperadminAccess: row.allow_superadmin_access,
      deactivatedAt: row.deactivated_at ?? '',
    }))
  );

  createWorksheet(
    workbook,
    'Projects',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Status', key: 'status' },
      { header: 'Visibility', key: 'visibility' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Budget cents', key: 'budgetCents' },
      { header: 'Budget amount', key: 'budgetAmount' },
      {
        header: 'Sync future company defaults',
        key: 'syncCompanyDefaults',
      },
      { header: 'Allow transaction transfers', key: 'allowTxnTransfers' },
      { header: 'Allow superadmin access', key: 'allowSuperadminAccess' },
      { header: 'Deactivated at', key: 'deactivatedAt' },
    ],
    operationalProjects.map((row) => ({
      projectId: row.id,
      projectName: row.name,
      currency: row.currency,
      status: row.status,
      visibility: row.visibility,
      parentProgrammeId: row.parent_project_id ?? '',
      parentProgrammeName: row.parent_project_id
        ? (projectById.get(row.parent_project_id)?.name ?? '')
        : '',
      budgetCents: Number(row.budget_total_cents),
      budgetAmount: centsToMajorUnits(Number(row.budget_total_cents)),
      syncCompanyDefaults: row.sync_company_defaults,
      allowTxnTransfers: row.allow_txn_transfers,
      allowSuperadminAccess: row.allow_superadmin_access,
      deactivatedAt: row.deactivated_at ?? '',
    }))
  );

  createWorksheet(
    workbook,
    'Programme Membership',
    [
      { header: 'Programme ID', key: 'programmeId' },
      { header: 'Programme name', key: 'programmeName' },
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project status', key: 'projectStatus' },
      { header: 'Project visibility', key: 'projectVisibility' },
    ],
    operationalProjects
      .filter(
        (row) =>
          !!row.parent_project_id && projectIdSet.has(row.parent_project_id)
      )
      .map((row) => ({
        programmeId: row.parent_project_id ?? '',
        programmeName: row.parent_project_id
          ? (projectById.get(row.parent_project_id)?.name ?? '')
          : '',
        projectId: row.id,
        projectName: row.name,
        projectStatus: row.status,
        projectVisibility: row.visibility,
      }))
  );

  createWorksheet(
    workbook,
    'Monthly Actuals',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Month', key: 'monthKey' },
      { header: 'Actual coded cents', key: 'actualCodedCents' },
      { header: 'Actual coded amount', key: 'actualCodedAmount' },
      { header: 'Uncoded count', key: 'uncodedCount' },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount' },
    ],
    flatSummaryProjects.flatMap((project) =>
      project.months.map((month) => ({
        projectId: project.id,
        projectName: project.name,
        projectType: project.projectType,
        parentProgrammeId: project.parentProjectId ?? '',
        parentProgrammeName: project.parentProjectId
          ? (projectById.get(project.parentProjectId)?.name ?? '')
          : '',
        currency: project.currency,
        monthKey: month.monthKey,
        actualCodedCents: month.actualCodedCents,
        actualCodedAmount: centsToMajorUnits(month.actualCodedCents),
        uncodedCount: month.uncodedCount,
        uncodedAmountCents: month.uncodedAmountCents,
        uncodedAmount: centsToMajorUnits(month.uncodedAmountCents),
      }))
    )
  );

  createWorksheet(
    workbook,
    'Workflow Summary',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Currency', key: 'currency' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Total transactions', key: 'totalTransactions' },
      { header: 'Reviewed transactions', key: 'reviewedTransactions' },
      { header: 'Locked transactions', key: 'lockedTransactions' },
      { header: 'Uncoded transactions', key: 'uncodedTransactions' },
      { header: 'Auto-mapped pending', key: 'autoMappedPending' },
      { header: 'Budget-impact transactions', key: 'budgetImpactTransactions' },
    ],
    projectRows.map((row) => {
      const projectTxns = transactionsByProjectId.get(row.id) ?? [];
      const parentProgramme = row.parent_project_id
        ? projectById.get(row.parent_project_id)
        : null;
      return {
        projectId: row.id,
        projectName: row.name,
        projectType: row.project_type,
        currency: row.currency,
        parentProgrammeId: row.parent_project_id ?? '',
        parentProgrammeName: parentProgramme?.name ?? '',
        totalTransactions: projectTxns.length,
        reviewedTransactions: projectTxns.filter((txn) => !!txn.reviewed_at)
          .length,
        lockedTransactions: projectTxns.filter((txn) => !!txn.locked_at).length,
        uncodedTransactions: projectTxns.filter((txn) => !txn.sub_category_id)
          .length,
        autoMappedPending: projectTxns.filter(
          (txn) => txn.coding_pending_approval
        ).length,
        budgetImpactTransactions: projectTxns.filter((txn) => txn.budget_impact)
          .length,
      };
    })
  );

  const transactionExportRows: TransactionExportRow[] = txns.map((row) => {
    const project = projectById.get(row.project_id);
    const parentProgramme = project?.parent_project_id
      ? projectById.get(project.parent_project_id)
      : null;
    const category = row.category_id ? categoryById.get(row.category_id) : null;
    const subCategory = row.sub_category_id
      ? subCategoryById.get(row.sub_category_id)
      : null;
    const transferProject = row.transfer_project_id
      ? projectById.get(row.transfer_project_id)
      : null;
    const reviewedBy = row.reviewed_by_user_id
      ? userById.get(row.reviewed_by_user_id)
      : null;
    const lockedBy = row.locked_by_user_id
      ? userById.get(row.locked_by_user_id)
      : null;
    return {
      transactionId: row.public_id,
      internalId: row.id,
      projectId: row.project_id,
      projectName: project?.name ?? '',
      programmeId: parentProgramme?.id ?? '',
      programmeName: parentProgramme?.name ?? '',
      currency: project?.currency ?? '',
      date: row.txn_date,
      item: row.item,
      description: row.description,
      externalId: row.external_id ?? '',
      amountCents: Number(row.amount_cents),
      amount: centsToMajorUnits(Number(row.amount_cents)),
      txnType: row.txn_type,
      budgetImpact: row.budget_impact,
      categorisable: row.categorisable,
      categoryId: row.category_id ?? '',
      categoryName: category?.name ?? '',
      subCategoryId: row.sub_category_id ?? '',
      subCategoryName: subCategory?.name ?? '',
      defaultMappingRuleId: row.company_default_mapping_rule_id ?? '',
      codingSource: row.coding_source ?? '',
      codingPendingApproval: row.coding_pending_approval,
      transferProjectId:
        row.transfer_project_id && projectIdSet.has(row.transfer_project_id)
          ? row.transfer_project_id
          : '',
      transferProjectName:
        row.transfer_project_id && projectIdSet.has(row.transfer_project_id)
          ? (transferProject?.name ?? '')
          : '',
      parentTxnId: row.parent_public_id ?? '',
      sourceTxnId: row.source_public_id ?? '',
      importBatchId: row.import_batch_id ?? '',
      importSourceType: row.import_source_type ?? '',
      reviewedAt: row.reviewed_at ?? '',
      reviewedByUserId: row.reviewed_by_user_id ?? '',
      reviewedByUserName: reviewedBy?.name ?? '',
      lockedAt: row.locked_at ?? '',
      lockedByUserId: row.locked_by_user_id ?? '',
      lockedByUserName: lockedBy?.name ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const transactionColumns: WorksheetColumn[] = [
    { header: 'Transaction ID', key: 'transactionId' },
    { header: 'Internal transaction ID', key: 'internalId' },
    { header: 'Project ID', key: 'projectId' },
    { header: 'Project name', key: 'projectName' },
    { header: 'Programme ID', key: 'programmeId' },
    { header: 'Programme name', key: 'programmeName' },
    { header: 'Currency', key: 'currency' },
    { header: 'Date', key: 'date' },
    { header: 'Item', key: 'item' },
    { header: 'Description', key: 'description' },
    { header: 'External ID', key: 'externalId' },
    { header: 'Amount cents', key: 'amountCents' },
    { header: 'Amount', key: 'amount' },
    { header: 'Transaction type', key: 'txnType' },
    { header: 'Budget impact', key: 'budgetImpact' },
    { header: 'Categorisable', key: 'categorisable' },
    { header: 'Category ID', key: 'categoryId' },
    { header: 'Category name', key: 'categoryName' },
    { header: 'Subcategory ID', key: 'subCategoryId' },
    { header: 'Subcategory name', key: 'subCategoryName' },
    { header: 'Default mapping rule ID', key: 'defaultMappingRuleId' },
    { header: 'Coding source', key: 'codingSource' },
    { header: 'Coding pending approval', key: 'codingPendingApproval' },
    { header: 'Transfer project ID', key: 'transferProjectId' },
    { header: 'Transfer project name', key: 'transferProjectName' },
    { header: 'Parent transaction ID', key: 'parentTxnId' },
    { header: 'Source transaction ID', key: 'sourceTxnId' },
    { header: 'Import batch ID', key: 'importBatchId' },
    { header: 'Import source type', key: 'importSourceType' },
    { header: 'Reviewed at', key: 'reviewedAt' },
    { header: 'Reviewed by user ID', key: 'reviewedByUserId' },
    { header: 'Reviewed by user', key: 'reviewedByUserName' },
    { header: 'Locked at', key: 'lockedAt' },
    { header: 'Locked by user ID', key: 'lockedByUserId' },
    { header: 'Locked by user', key: 'lockedByUserName' },
    { header: 'Created at', key: 'createdAt' },
    { header: 'Updated at', key: 'updatedAt' },
  ];

  const uncodedTransactionRows = transactionExportRows.filter(
    (row) => row.budgetImpact && !row.subCategoryId
  );
  const autoMappedPendingRows = transactionExportRows.filter(
    (row) => row.codingPendingApproval
  );

  const projectFinanceById = new Map<string, ProjectFinanceRollup>();
  for (const project of flatSummaryProjects) {
    projectFinanceById.set(project.id, {
      budgetCents: project.budgetCents,
      actualCodedCents: sumProjectMonths(
        project,
        (month) => month.actualCodedCents
      ),
      uncodedAmountCents: sumProjectMonths(
        project,
        (month) => month.uncodedAmountCents
      ),
    });
  }

  const taxonomyRollups = new Map<string, TaxonomyRollup>();
  const ensureTaxonomyRollup = (args: {
    projectId: string;
    categoryId: string;
    categoryName: string;
    subCategoryId: string;
    subCategoryName: string;
  }) => {
    const key = [
      args.projectId,
      args.categoryId,
      args.subCategoryId || 'none',
    ].join(':');
    const existing = taxonomyRollups.get(key);
    if (existing) return existing;
    const project = projectById.get(args.projectId);
    const parentProgramme = project?.parent_project_id
      ? projectById.get(project.parent_project_id)
      : null;
    const created: TaxonomyRollup = {
      projectId: args.projectId,
      projectName: project?.name ?? '',
      projectType: project?.project_type ?? 'project',
      programmeId: parentProgramme?.id ?? '',
      programmeName: parentProgramme?.name ?? '',
      currency: project?.currency ?? '',
      categoryId: args.categoryId,
      categoryName: args.categoryName,
      subCategoryId: args.subCategoryId,
      subCategoryName: args.subCategoryName,
      budgetCents: 0,
      actualCodedCents: 0,
      uncodedAmountCents: 0,
      transactionCount: 0,
    };
    taxonomyRollups.set(key, created);
    return created;
  };

  for (const line of budgetLines) {
    const category = line.category_id
      ? categoryById.get(line.category_id)
      : null;
    const subCategory = line.sub_category_id
      ? subCategoryById.get(line.sub_category_id)
      : null;
    const rollup = ensureTaxonomyRollup({
      projectId: line.project_id,
      categoryId: line.category_id ?? '',
      categoryName: category?.name ?? 'Unassigned',
      subCategoryId: line.sub_category_id ?? '',
      subCategoryName: subCategory?.name ?? '',
    });
    rollup.budgetCents += Number(line.allocated_cents);
  }

  for (const row of transactionExportRows) {
    if (!row.budgetImpact) continue;
    const rollup = ensureTaxonomyRollup({
      projectId: row.projectId,
      categoryId: row.categoryId,
      categoryName: row.categoryName || 'Unassigned',
      subCategoryId: row.subCategoryId,
      subCategoryName: row.subCategoryName,
    });
    if (row.subCategoryId) {
      rollup.actualCodedCents += row.amountCents;
    } else {
      rollup.uncodedAmountCents += row.amountCents;
    }
    rollup.transactionCount += 1;
  }

  const taxonomyRollupRows = [...taxonomyRollups.values()].sort((a, b) => {
    const projectCompare = a.projectName.localeCompare(b.projectName);
    if (projectCompare !== 0) return projectCompare;
    const categoryCompare = a.categoryName.localeCompare(b.categoryName);
    if (categoryCompare !== 0) return categoryCompare;
    return a.subCategoryName.localeCompare(b.subCategoryName);
  });

  const categoryRollupMap = new Map<string, TaxonomyRollup>();
  for (const row of taxonomyRollupRows) {
    const key = [row.projectId, row.categoryId || 'none'].join(':');
    const existing = categoryRollupMap.get(key);
    if (existing) {
      existing.budgetCents += row.budgetCents;
      existing.actualCodedCents += row.actualCodedCents;
      existing.uncodedAmountCents += row.uncodedAmountCents;
      existing.transactionCount += row.transactionCount;
      continue;
    }
    categoryRollupMap.set(key, {
      ...row,
      subCategoryId: '',
      subCategoryName: '',
    });
  }
  const categoryRollupRows = [...categoryRollupMap.values()];

  createWorksheet(
    workbook,
    'Budget vs Actual',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Status', key: 'status' },
      { header: 'Budget cents', key: 'budgetCents' },
      { header: 'Budget amount', key: 'budgetAmount', style: amountStyle },
      { header: 'Actual coded cents', key: 'actualCodedCents' },
      {
        header: 'Actual coded amount',
        key: 'actualCodedAmount',
        style: amountStyle,
      },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount', style: amountStyle },
      { header: 'Total actual incl uncoded cents', key: 'totalActualCents' },
      {
        header: 'Total actual incl uncoded',
        key: 'totalActualAmount',
        style: amountStyle,
      },
      { header: 'Variance cents', key: 'varianceCents' },
      { header: 'Variance amount', key: 'varianceAmount', style: amountStyle },
      { header: 'Variance %', key: 'variancePct', style: percentStyle },
    ],
    flatSummaryProjects.map((project) => {
      const finance = projectFinanceById.get(project.id) ?? {
        budgetCents: project.budgetCents,
        actualCodedCents: 0,
        uncodedAmountCents: 0,
      };
      const totalActualCentsForProject =
        finance.actualCodedCents + finance.uncodedAmountCents;
      const varianceCents = finance.budgetCents - totalActualCentsForProject;
      return {
        projectId: project.id,
        projectName: project.name,
        projectType: project.projectType,
        parentProgrammeId: project.parentProjectId ?? '',
        parentProgrammeName: project.parentProjectId
          ? (projectById.get(project.parentProjectId)?.name ?? '')
          : '',
        currency: project.currency,
        status: project.status,
        budgetCents: finance.budgetCents,
        budgetAmount: centsToMajorUnits(finance.budgetCents),
        actualCodedCents: finance.actualCodedCents,
        actualCodedAmount: centsToMajorUnits(finance.actualCodedCents),
        uncodedAmountCents: finance.uncodedAmountCents,
        uncodedAmount: centsToMajorUnits(finance.uncodedAmountCents),
        totalActualCents: totalActualCentsForProject,
        totalActualAmount: centsToMajorUnits(totalActualCentsForProject),
        varianceCents,
        varianceAmount: centsToMajorUnits(varianceCents),
        variancePct:
          finance.budgetCents === 0
            ? undefined
            : varianceCents / finance.budgetCents,
      };
    })
  );

  createWorksheet(
    workbook,
    'Budget vs Actual Monthly',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Month', key: 'monthKey' },
      { header: 'Budget cents', key: 'budgetCents' },
      { header: 'Budget amount', key: 'budgetAmount', style: amountStyle },
      { header: 'Actual coded cents', key: 'actualCodedCents' },
      {
        header: 'Actual coded amount',
        key: 'actualCodedAmount',
        style: amountStyle,
      },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount', style: amountStyle },
    ],
    flatSummaryProjects.flatMap((project) => {
      const monthCount = project.months.length || 1;
      const monthlyBudgetCents =
        project.projectType === 'programme' || monthCount === 0
          ? 0
          : Math.round(project.budgetCents / monthCount);
      return project.months.map((month) => ({
        projectId: project.id,
        projectName: project.name,
        projectType: project.projectType,
        parentProgrammeId: project.parentProjectId ?? '',
        parentProgrammeName: project.parentProjectId
          ? (projectById.get(project.parentProjectId)?.name ?? '')
          : '',
        currency: project.currency,
        monthKey: month.monthKey,
        budgetCents: monthlyBudgetCents,
        budgetAmount: centsToMajorUnits(monthlyBudgetCents),
        actualCodedCents: month.actualCodedCents,
        actualCodedAmount: centsToMajorUnits(month.actualCodedCents),
        uncodedAmountCents: month.uncodedAmountCents,
        uncodedAmount: centsToMajorUnits(month.uncodedAmountCents),
      }));
    })
  );

  createWorksheet(
    workbook,
    'Category Rollup',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Programme ID', key: 'programmeId' },
      { header: 'Programme name', key: 'programmeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Category ID', key: 'categoryId' },
      { header: 'Category name', key: 'categoryName' },
      { header: 'Budget cents', key: 'budgetCents' },
      { header: 'Budget amount', key: 'budgetAmount', style: amountStyle },
      { header: 'Actual coded cents', key: 'actualCodedCents' },
      {
        header: 'Actual coded amount',
        key: 'actualCodedAmount',
        style: amountStyle,
      },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount', style: amountStyle },
      { header: 'Transaction count', key: 'transactionCount' },
    ],
    categoryRollupRows.map((row) => ({
      ...row,
      budgetAmount: centsToMajorUnits(row.budgetCents),
      actualCodedAmount: centsToMajorUnits(row.actualCodedCents),
      uncodedAmount: centsToMajorUnits(row.uncodedAmountCents),
    }))
  );

  createWorksheet(
    workbook,
    'Subcategory Rollup',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Programme ID', key: 'programmeId' },
      { header: 'Programme name', key: 'programmeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Category ID', key: 'categoryId' },
      { header: 'Category name', key: 'categoryName' },
      { header: 'Subcategory ID', key: 'subCategoryId' },
      { header: 'Subcategory name', key: 'subCategoryName' },
      { header: 'Budget cents', key: 'budgetCents' },
      { header: 'Budget amount', key: 'budgetAmount', style: amountStyle },
      { header: 'Actual coded cents', key: 'actualCodedCents' },
      {
        header: 'Actual coded amount',
        key: 'actualCodedAmount',
        style: amountStyle,
      },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount', style: amountStyle },
      { header: 'Transaction count', key: 'transactionCount' },
    ],
    taxonomyRollupRows.map((row) => ({
      ...row,
      budgetAmount: centsToMajorUnits(row.budgetCents),
      actualCodedAmount: centsToMajorUnits(row.actualCodedCents),
      uncodedAmount: centsToMajorUnits(row.uncodedAmountCents),
    }))
  );

  createWorksheet(
    workbook,
    'Uncoded Transactions',
    transactionColumns,
    uncodedTransactionRows
  );

  createWorksheet(
    workbook,
    'Auto-Mapped Pending',
    transactionColumns,
    autoMappedPendingRows
  );

  if (args.options.detail === 'full') {
    createWorksheet(
      workbook,
      'Budgets',
      [
        { header: 'Budget ID', key: 'budgetId' },
        { header: 'Project ID', key: 'projectId' },
        { header: 'Project name', key: 'projectName' },
        { header: 'Programme ID', key: 'programmeId' },
        { header: 'Programme name', key: 'programmeName' },
        { header: 'Currency', key: 'currency' },
        { header: 'Category ID', key: 'categoryId' },
        { header: 'Category name', key: 'categoryName' },
        { header: 'Subcategory ID', key: 'subCategoryId' },
        { header: 'Subcategory name', key: 'subCategoryName' },
        { header: 'Allocated cents', key: 'allocatedCents' },
        { header: 'Allocated amount', key: 'allocatedAmount' },
        { header: 'Created at', key: 'createdAt' },
        { header: 'Updated at', key: 'updatedAt' },
      ],
      budgetLines.map((row) => {
        const project = projectById.get(row.project_id);
        const category = row.category_id
          ? categoryById.get(row.category_id)
          : null;
        const subCategory = row.sub_category_id
          ? subCategoryById.get(row.sub_category_id)
          : null;
        const parentProgramme = project?.parent_project_id
          ? projectById.get(project.parent_project_id)
          : null;
        return {
          budgetId: row.id,
          projectId: row.project_id,
          projectName: project?.name ?? '',
          programmeId: parentProgramme?.id ?? '',
          programmeName: parentProgramme?.name ?? '',
          currency: project?.currency ?? '',
          categoryId: row.category_id ?? '',
          categoryName: category?.name ?? '',
          subCategoryId: row.sub_category_id ?? '',
          subCategoryName: subCategory?.name ?? '',
          allocatedCents: Number(row.allocated_cents),
          allocatedAmount: centsToMajorUnits(Number(row.allocated_cents)),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
    );

    createWorksheet(
      workbook,
      'Transactions',
      transactionColumns,
      transactionExportRows
    );

    createWorksheet(
      workbook,
      'Reviewed Transactions',
      transactionColumns,
      transactionExportRows.filter((row) => !!row.reviewedAt)
    );

    createWorksheet(
      workbook,
      'Locked Transactions',
      transactionColumns,
      transactionExportRows.filter((row) => !!row.lockedAt)
    );

    createWorksheet(
      workbook,
      'Categories',
      [
        { header: 'Category ID', key: 'categoryId' },
        { header: 'Project ID', key: 'projectId' },
        { header: 'Project name', key: 'projectName' },
        { header: 'Programme ID', key: 'programmeId' },
        { header: 'Programme name', key: 'programmeName' },
        { header: 'Name', key: 'name' },
        { header: 'Created at', key: 'createdAt' },
        { header: 'Updated at', key: 'updatedAt' },
      ],
      categories.map((row) => {
        const project = projectById.get(row.project_id);
        const parentProgramme = project?.parent_project_id
          ? projectById.get(project.parent_project_id)
          : null;
        return {
          categoryId: row.id,
          projectId: row.project_id,
          projectName: project?.name ?? '',
          programmeId: parentProgramme?.id ?? '',
          programmeName: parentProgramme?.name ?? '',
          name: row.name,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
    );

    createWorksheet(
      workbook,
      'Subcategories',
      [
        { header: 'Subcategory ID', key: 'subCategoryId' },
        { header: 'Project ID', key: 'projectId' },
        { header: 'Project name', key: 'projectName' },
        { header: 'Category ID', key: 'categoryId' },
        { header: 'Category name', key: 'categoryName' },
        { header: 'Name', key: 'name' },
        { header: 'Created at', key: 'createdAt' },
        { header: 'Updated at', key: 'updatedAt' },
      ],
      subCategories.map((row) => ({
        subCategoryId: row.id,
        projectId: row.project_id,
        projectName: projectById.get(row.project_id)?.name ?? '',
        categoryId: row.category_id,
        categoryName: categoryById.get(row.category_id)?.name ?? '',
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );

    createWorksheet(
      workbook,
      'Company Default Categories',
      [
        { header: 'Default category ID', key: 'categoryId' },
        { header: 'Name', key: 'name' },
        { header: 'Created at', key: 'createdAt' },
        { header: 'Updated at', key: 'updatedAt' },
      ],
      companyDefaultCategories.map((row) => ({
        categoryId: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );

    createWorksheet(
      workbook,
      'Company Default Subcategories',
      [
        { header: 'Default subcategory ID', key: 'subCategoryId' },
        { header: 'Default category ID', key: 'categoryId' },
        { header: 'Default category name', key: 'categoryName' },
        { header: 'Name', key: 'name' },
        { header: 'Created at', key: 'createdAt' },
        { header: 'Updated at', key: 'updatedAt' },
      ],
      companyDefaultSubCategories.map((row) => ({
        subCategoryId: row.id,
        categoryId: row.company_default_category_id,
        categoryName:
          defaultCategoryById.get(row.company_default_category_id)?.name ?? '',
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );

    createWorksheet(
      workbook,
      'Default Mapping Rules',
      [
        { header: 'Rule ID', key: 'ruleId' },
        { header: 'Match text', key: 'matchText' },
        { header: 'Default category ID', key: 'categoryId' },
        { header: 'Default category name', key: 'categoryName' },
        { header: 'Default subcategory ID', key: 'subCategoryId' },
        { header: 'Default subcategory name', key: 'subCategoryName' },
        { header: 'Sort order', key: 'sortOrder' },
        { header: 'Created at', key: 'createdAt' },
        { header: 'Updated at', key: 'updatedAt' },
      ],
      companyDefaultMappingRules.map((row) => ({
        ruleId: row.id,
        matchText: row.match_text,
        categoryId: row.company_default_category_id,
        categoryName:
          defaultCategoryById.get(row.company_default_category_id)?.name ?? '',
        subCategoryId: row.company_default_sub_category_id,
        subCategoryName:
          defaultSubCategoryById.get(row.company_default_sub_category_id)
            ?.name ?? '',
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );

    createWorksheet(
      workbook,
      'Import Rules',
      [
        { header: 'Rule ID', key: 'ruleId' },
        { header: 'Scope', key: 'scope' },
        { header: 'Project ID', key: 'projectId' },
        { header: 'Name', key: 'name' },
        { header: 'Action', key: 'action' },
        { header: 'Field', key: 'field' },
        { header: 'Operator', key: 'operator' },
        { header: 'Value', key: 'value' },
        { header: 'Sort order', key: 'sortOrder' },
        { header: 'Enabled', key: 'enabled' },
        { header: 'Created at', key: 'createdAt' },
        { header: 'Updated at', key: 'updatedAt' },
      ],
      importRules.map((row) => ({
        ruleId: row.id,
        scope: row.project_id ? 'project' : 'company',
        projectId: row.project_id ?? '',
        name: row.name,
        action: row.action,
        field: row.field,
        operator: row.operator,
        value: row.value,
        sortOrder: row.sort_order,
        enabled: row.enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );

    createWorksheet(
      workbook,
      'Company Members',
      [
        { header: 'User ID', key: 'userId' },
        { header: 'Name', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'Company role', key: 'role' },
        { header: 'User disabled', key: 'disabled' },
        { header: 'Global superadmin', key: 'isGlobalSuperadmin' },
      ],
      companyMembers.map((row) => ({
        userId: row.user_id,
        name: row.user_name,
        email: row.user_email,
        role: row.role,
        disabled: row.user_disabled,
        isGlobalSuperadmin: row.is_global_superadmin,
      }))
    );

    createWorksheet(
      workbook,
      'Project Memberships',
      [
        { header: 'Project ID', key: 'projectId' },
        { header: 'Project name', key: 'projectName' },
        { header: 'Project type', key: 'projectType' },
        { header: 'User ID', key: 'userId' },
        { header: 'User name', key: 'userName' },
        { header: 'User email', key: 'userEmail' },
        { header: 'Project role', key: 'role' },
      ],
      projectMemberships.map((row) => ({
        projectId: row.project_id,
        projectName: projectById.get(row.project_id)?.name ?? '',
        projectType: projectById.get(row.project_id)?.project_type ?? '',
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        role: row.role,
      }))
    );
  }

  const writeBufferResult = await workbook.xlsx.writeBuffer();
  const bytes =
    writeBufferResult instanceof Uint8Array
      ? writeBufferResult
      : new Uint8Array(writeBufferResult);

  return {
    bytes,
    fileName: exportFileName,
  };
}

export async function exportCompanyWorkbookServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  options: CompanyExportOptions;
}): Promise<CompanyExportResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);

    return exportCompanyWorkbookForUser({
      db,
      userId,
      companyId: args.companyId,
      options: args.options,
    });
  });
}
