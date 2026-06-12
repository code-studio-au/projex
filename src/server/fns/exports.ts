import ExcelJS from 'exceljs';

import { AppError } from '../../api/errors';
import type { CompanyId, CompanySummaryProject, Project, ProjectId } from '../../types';
import { asCompanyId, asProjectId } from '../../types';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { getDb } from '../db/db';
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

export type CompanyExportOptions = {
  scope: 'all' | 'active';
  detail: 'full' | 'summary';
  fromDate?: string;
  toDate?: string;
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
  allow_txn_transfers: boolean;
};

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

function autosizeColumns(worksheet: ExcelJS.Worksheet, minimum = 12, maximum = 36) {
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
    [
      `Scope: ${args.isScopedForSuperadmin ? 'global superadmin visible projects only' : 'full company access scope'}`,
    ],
    [`Project filter: ${args.options.scope === 'active' ? 'active projects/programmes only' : 'all visible projects/programmes'}`],
    [`Workbook detail: ${args.options.detail === 'summary' ? 'summary only' : 'full detail'}`],
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
    ['- Programme transactions and budgets are not duplicated from sub-projects.'],
    ['- Currency is preserved per row; mixed-currency exports should be grouped before aggregation outside Projex.'],
    ['- IDs and relationship columns are included intentionally for reconciliation and downstream analysis.'],
  ];
  rows.forEach((values) => worksheet.addRow(values));
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getColumn(1).width = 120;
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
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
            .select(['id', 'company_id', 'project_id', 'name', 'created_at', 'updated_at'])
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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Codex';
    workbook.company = 'Projex';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;

    const generatedAt = new Date().toISOString();
    const programmes = projectRows.filter((row) => row.project_type === 'programme');
    const operationalProjects = projectRows.filter(
      (row) => row.project_type === 'project'
    );

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

    const executiveSummary = workbook.addWorksheet('Executive Summary');
    const totalBudgetCents = projectRows.reduce(
      (sum, row) => sum + Number(row.budget_total_cents),
      0
    );
    const totalTxnCents = txns.reduce(
      (sum, row) => sum + Number(row.amount_cents),
      0
    );
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
      ['Total transaction amount (major units)', centsToMajorUnits(totalTxnCents)],
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
        childCount: projectRows.filter((candidate) => candidate.parent_project_id === row.id)
          .length,
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
          ? projectById.get(row.parent_project_id)?.name ?? ''
          : '',
        budgetCents: Number(row.budget_total_cents),
        budgetAmount: centsToMajorUnits(Number(row.budget_total_cents)),
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
        .filter((row) => !!row.parent_project_id && projectIdSet.has(row.parent_project_id))
        .map((row) => ({
          programmeId: row.parent_project_id ?? '',
          programmeName: row.parent_project_id
            ? projectById.get(row.parent_project_id)?.name ?? ''
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
            ? projectById.get(project.parentProjectId)?.name ?? ''
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
        const projectTxns = txns.filter((txn) => txn.project_id === row.id);
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
          reviewedTransactions: projectTxns.filter((txn) => !!txn.reviewed_at).length,
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

    const transactionExportRows = txns.map((row) => {
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
            ? transferProject?.name ?? ''
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
        const category = row.category_id ? categoryById.get(row.category_id) : null;
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

      createWorksheet(workbook, 'Transactions', transactionColumns, transactionExportRows);

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
          defaultSubCategoryById.get(row.company_default_sub_category_id)?.name ??
          '',
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
      fileName: buildExportFileName({
        companyName: company.name,
        options: args.options,
      }),
    };
  });
}
