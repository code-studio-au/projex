import ExcelJS from 'exceljs';

import type {
  CompanyExportOptions,
  CompanyId,
  CompanySummaryProject,
} from '../../types';
import { calculateBudgetPosition } from '../../utils/budgetSemantics';
import {
  amountStyle,
  centsToMajorUnits,
  COMPANY_EXPORT_CONTRACT_VERSION,
  createWorksheet,
  percentStyle,
  setHeaderStyle,
  type ProjectFinanceRollup,
  type ProjectExportRow,
  type TaxonomyRollup,
  type TransactionExportRow,
  type WorksheetColumn,
} from './exportWorkbookShared';

export function addOverviewWorksheet(args: {
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
  totalPendingReversalCents: number;
  totalAdjustedActualCodedCents: number;
  totalUncodedCents: number;
}) {
  const worksheet = args.workbook.addWorksheet('Overview');
  const totalRecordedSpendCents =
    args.totalActualCodedCents + args.totalUncodedCents;
  const totalExpectedSpendCents =
    args.totalAdjustedActualCodedCents + args.totalUncodedCents;
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
    `- ${centsToMajorUnits(totalRecordedSpendCents).toFixed(2)} recorded spend`,
    `- ${centsToMajorUnits(args.totalPendingReversalCents).toFixed(2)} unrecorded pending reversal amount`,
    `- ${centsToMajorUnits(totalExpectedSpendCents).toFixed(2)} expected spend after pending reversals`,
    `- ${centsToMajorUnits(args.totalBudgetCents - totalRecordedSpendCents).toFixed(2)} budget headroom`,
    `- ${centsToMajorUnits(args.totalUncodedCents).toFixed(2)} uncoded exposure`,
    '',
    'Recommended worksheet order',
    '- Executive Summary: company-level totals and project-level rollup',
    '- Budget vs Actual: project budget, spend, headroom, and health',
    '- Monthly Spend: monthly recorded and expected spend components',
    '- Category Rollup / Subcategory Rollup: taxonomy-level budget and spend analysis',
    '- Workflow Summary / Uncoded / Auto-Mapped Pending: coding and review operations',
    '- Detail tabs: audit and reconciliation support',
    '',
    'Model notes',
    '- Programmes are reporting containers and roll up active child projects.',
    '- Project budgets are approved full-project totals and are not prorated across observed months.',
    '- Recorded spend includes coded actuals and uncoded exposure.',
    '- Expected spend subtracts open pending reversals but does not treat them as confirmed.',
    '- Health uses recorded spend; no straight-line burn forecast is inferred.',
    '- Currency is preserved row-by-row; aggregate mixed currencies outside this workbook with care.',
    '- IDs and parent relationships are intentionally included for reconciliation.',
    `- ${args.projectRows.filter((row) => row.project_type === 'programme' && row.status === 'active').length} active programmes contribute rolled-up child metrics.`,
  ];
  sections.forEach((line) => worksheet.addRow([line]));
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getColumn(1).width = 120;
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export function addReadmeWorksheet(args: {
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

export function addExportMetadataWorksheet(args: {
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

export function addAnalysisWorksheets(args: {
  workbook: ExcelJS.Workbook;
  flatSummaryProjects: CompanySummaryProject[];
  projectNameById: Map<string, string>;
  projectFinanceById: Map<string, ProjectFinanceRollup>;
  categoryRollupRows: TaxonomyRollup[];
  taxonomyRollupRows: TaxonomyRollup[];
  transactionColumns: WorksheetColumn[];
  uncodedTransactionRows: TransactionExportRow[];
  autoMappedPendingRows: TransactionExportRow[];
  pendingReversalRows: TransactionExportRow[];
}) {
  createWorksheet(
    args.workbook,
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
      {
        header: 'Open pending reversal workflows',
        key: 'pendingReversalCount',
      },
      {
        header: 'Unrecorded pending reversal cents',
        key: 'pendingReversalCents',
      },
      {
        header: 'Unrecorded pending reversal amount',
        key: 'pendingReversalAmount',
        style: amountStyle,
      },
      {
        header: 'Expected coded spend after pending reversals cents',
        key: 'adjustedActualCodedCents',
      },
      {
        header: 'Expected coded spend after pending reversals',
        key: 'adjustedActualCodedAmount',
        style: amountStyle,
      },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount', style: amountStyle },
      { header: 'Recorded spend cents', key: 'recordedSpendCents' },
      {
        header: 'Recorded spend',
        key: 'recordedSpendAmount',
        style: amountStyle,
      },
      {
        header: 'Expected spend after pending reversals cents',
        key: 'expectedSpendCents',
      },
      {
        header: 'Expected spend after pending reversals',
        key: 'expectedSpendAmount',
        style: amountStyle,
      },
      { header: 'Budget headroom cents', key: 'budgetHeadroomCents' },
      {
        header: 'Budget headroom',
        key: 'budgetHeadroomAmount',
        style: amountStyle,
      },
      {
        header: 'Expected headroom after pending reversals cents',
        key: 'expectedHeadroomCents',
      },
      {
        header: 'Expected headroom after pending reversals',
        key: 'expectedHeadroomAmount',
        style: amountStyle,
      },
      {
        header: 'Recorded spend utilization %',
        key: 'spendUtilizationPct',
        style: percentStyle,
      },
      { header: 'Budget health', key: 'budgetHealth' },
      { header: 'Budget health reason', key: 'budgetHealthReason' },
    ],
    args.flatSummaryProjects.map((project) => {
      const finance = args.projectFinanceById.get(project.id) ?? {
        budgetCents: project.budgetCents,
        actualCodedCents: 0,
        pendingReversalCount: 0,
        pendingReversalCents: 0,
        adjustedActualCodedCents: 0,
        uncodedCount: 0,
        uncodedAmountCents: 0,
      };
      const position = calculateBudgetPosition({
        projectBudgetCents: finance.budgetCents,
        codedActualCents: finance.actualCodedCents,
        uncodedExposureCents: finance.uncodedAmountCents,
        uncodedCount: finance.uncodedCount,
        pendingReversalCount: finance.pendingReversalCount,
        pendingReversalCents: finance.pendingReversalCents,
      });
      const parentProjectId = project.parentProjectId ?? '';
      return {
        projectId: project.id,
        projectName: project.name,
        projectType: project.projectType,
        parentProgrammeId: parentProjectId,
        parentProgrammeName: parentProjectId
          ? (args.projectNameById.get(parentProjectId) ?? '')
          : '',
        currency: project.currency,
        status: project.status,
        budgetCents: finance.budgetCents,
        budgetAmount: centsToMajorUnits(finance.budgetCents),
        actualCodedCents: finance.actualCodedCents,
        actualCodedAmount: centsToMajorUnits(finance.actualCodedCents),
        pendingReversalCount: finance.pendingReversalCount,
        pendingReversalCents: finance.pendingReversalCents,
        pendingReversalAmount: centsToMajorUnits(finance.pendingReversalCents),
        adjustedActualCodedCents: finance.adjustedActualCodedCents,
        adjustedActualCodedAmount: centsToMajorUnits(
          finance.adjustedActualCodedCents
        ),
        uncodedAmountCents: finance.uncodedAmountCents,
        uncodedAmount: centsToMajorUnits(finance.uncodedAmountCents),
        recordedSpendCents: position.recordedSpendCents,
        recordedSpendAmount: centsToMajorUnits(position.recordedSpendCents),
        expectedSpendCents: position.expectedSpendAfterPendingReversalsCents,
        expectedSpendAmount: centsToMajorUnits(
          position.expectedSpendAfterPendingReversalsCents
        ),
        budgetHeadroomCents: position.confirmedHeadroomCents,
        budgetHeadroomAmount: centsToMajorUnits(
          position.confirmedHeadroomCents
        ),
        expectedHeadroomCents:
          position.expectedHeadroomAfterPendingReversalsCents,
        expectedHeadroomAmount: centsToMajorUnits(
          position.expectedHeadroomAfterPendingReversalsCents
        ),
        spendUtilizationPct:
          position.spendUtilizationPct === null
            ? undefined
            : position.spendUtilizationPct / 100,
        budgetHealth: position.health.label,
        budgetHealthReason: position.health.reason,
      };
    })
  );

  createWorksheet(
    args.workbook,
    'Monthly Spend',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Month', key: 'monthKey' },
      { header: 'Actual coded cents', key: 'actualCodedCents' },
      {
        header: 'Actual coded amount',
        key: 'actualCodedAmount',
        style: amountStyle,
      },
      {
        header: 'Open pending reversal workflows',
        key: 'pendingReversalCount',
      },
      {
        header: 'Unrecorded pending reversal cents',
        key: 'pendingReversalCents',
      },
      {
        header: 'Unrecorded pending reversal amount',
        key: 'pendingReversalAmount',
        style: amountStyle,
      },
      {
        header: 'Expected coded spend after pending reversals cents',
        key: 'adjustedActualCodedCents',
      },
      {
        header: 'Expected coded spend after pending reversals',
        key: 'adjustedActualCodedAmount',
        style: amountStyle,
      },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount', style: amountStyle },
      { header: 'Recorded spend cents', key: 'recordedSpendCents' },
      {
        header: 'Recorded spend',
        key: 'recordedSpendAmount',
        style: amountStyle,
      },
      {
        header: 'Expected spend after pending reversals cents',
        key: 'expectedSpendCents',
      },
      {
        header: 'Expected spend after pending reversals',
        key: 'expectedSpendAmount',
        style: amountStyle,
      },
    ],
    args.flatSummaryProjects.flatMap((project) => {
      const parentProjectId = project.parentProjectId ?? '';
      return project.months.map((month) => {
        const recordedSpendCents =
          month.actualCodedCents + month.uncodedAmountCents;
        const expectedSpendCents =
          recordedSpendCents - Math.max(0, month.pendingReversalCents);
        return {
          projectId: project.id,
          projectName: project.name,
          projectType: project.projectType,
          parentProgrammeId: parentProjectId,
          parentProgrammeName: parentProjectId
            ? (args.projectNameById.get(parentProjectId) ?? '')
            : '',
          currency: project.currency,
          monthKey: month.monthKey,
          actualCodedCents: month.actualCodedCents,
          actualCodedAmount: centsToMajorUnits(month.actualCodedCents),
          pendingReversalCount: month.pendingReversalCount,
          pendingReversalCents: month.pendingReversalCents,
          pendingReversalAmount: centsToMajorUnits(month.pendingReversalCents),
          adjustedActualCodedCents: month.adjustedActualCodedCents,
          adjustedActualCodedAmount: centsToMajorUnits(
            month.adjustedActualCodedCents
          ),
          uncodedAmountCents: month.uncodedAmountCents,
          uncodedAmount: centsToMajorUnits(month.uncodedAmountCents),
          recordedSpendCents,
          recordedSpendAmount: centsToMajorUnits(recordedSpendCents),
          expectedSpendCents,
          expectedSpendAmount: centsToMajorUnits(expectedSpendCents),
        };
      });
    })
  );

  createWorksheet(
    args.workbook,
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
      {
        header: 'Open pending reversal workflows',
        key: 'pendingReversalCount',
      },
      {
        header: 'Unrecorded pending reversal cents',
        key: 'pendingReversalCents',
      },
      {
        header: 'Unrecorded pending reversal amount',
        key: 'pendingReversalAmount',
        style: amountStyle,
      },
      {
        header: 'Expected coded spend after pending reversals cents',
        key: 'adjustedActualCodedCents',
      },
      {
        header: 'Expected coded spend after pending reversals',
        key: 'adjustedActualCodedAmount',
        style: amountStyle,
      },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount', style: amountStyle },
      { header: 'Transaction count', key: 'transactionCount' },
    ],
    args.categoryRollupRows.map((row) => ({
      ...row,
      budgetAmount: centsToMajorUnits(row.budgetCents),
      actualCodedAmount: centsToMajorUnits(row.actualCodedCents),
      pendingReversalAmount: centsToMajorUnits(row.pendingReversalCents),
      adjustedActualCodedAmount: centsToMajorUnits(
        row.adjustedActualCodedCents
      ),
      uncodedAmount: centsToMajorUnits(row.uncodedAmountCents),
    }))
  );

  createWorksheet(
    args.workbook,
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
      {
        header: 'Open pending reversal workflows',
        key: 'pendingReversalCount',
      },
      {
        header: 'Unrecorded pending reversal cents',
        key: 'pendingReversalCents',
      },
      {
        header: 'Unrecorded pending reversal amount',
        key: 'pendingReversalAmount',
        style: amountStyle,
      },
      {
        header: 'Expected coded spend after pending reversals cents',
        key: 'adjustedActualCodedCents',
      },
      {
        header: 'Expected coded spend after pending reversals',
        key: 'adjustedActualCodedAmount',
        style: amountStyle,
      },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount', style: amountStyle },
      { header: 'Transaction count', key: 'transactionCount' },
    ],
    args.taxonomyRollupRows.map((row) => ({
      ...row,
      budgetAmount: centsToMajorUnits(row.budgetCents),
      actualCodedAmount: centsToMajorUnits(row.actualCodedCents),
      pendingReversalAmount: centsToMajorUnits(row.pendingReversalCents),
      adjustedActualCodedAmount: centsToMajorUnits(
        row.adjustedActualCodedCents
      ),
      uncodedAmount: centsToMajorUnits(row.uncodedAmountCents),
    }))
  );

  createWorksheet(
    args.workbook,
    'Uncoded Transactions',
    args.transactionColumns,
    args.uncodedTransactionRows
  );
  createWorksheet(
    args.workbook,
    'Auto-Mapped Pending',
    args.transactionColumns,
    args.autoMappedPendingRows
  );
  createWorksheet(
    args.workbook,
    'Pending Reversal',
    args.transactionColumns,
    args.pendingReversalRows
  );
}

export function addExecutiveSummaryWorksheet(args: {
  workbook: ExcelJS.Workbook;
  companyName: string;
  companyStatus: string;
  generatedAt: string;
  options: CompanyExportOptions;
  projectCount: number;
  programmeCount: number;
  operationalProjectCount: number;
  budgetCount: number;
  transactionCount: number;
  totalBudgetCents: number;
  totalTxnCents: number;
  totalPendingReversalCents: number;
  uncodedTxnCount: number;
  pendingReversalTxnCount: number;
  reviewedTxnCount: number;
  lockedTxnCount: number;
  autoMappedPendingTxnCount: number;
  flatSummaryProjects: CompanySummaryProject[];
  projectNameById: Map<string, string>;
}) {
  const executiveSummary = args.workbook.addWorksheet('Executive Summary');

  const metadataRows = [
    ['Company', args.companyName],
    ['Company status', args.companyStatus],
    ['Generated at', args.generatedAt],
    ['Project filter', args.options.scope],
    ['Workbook detail', args.options.detail],
    [
      'Transaction date range',
      `${args.options.fromDate ?? 'beginning'} to ${args.options.toDate ?? 'latest'}`,
    ],
    ['Projects in scope', args.projectCount],
    ['Programmes in scope', args.programmeCount],
    ['Operational projects in scope', args.operationalProjectCount],
    ['Budget rows', args.budgetCount],
    ['Transaction rows', args.transactionCount],
    [
      'Total planned budget (major units)',
      centsToMajorUnits(args.totalBudgetCents),
    ],
    [
      'Total transaction amount (major units)',
      centsToMajorUnits(args.totalTxnCents),
    ],
    [
      'Unrecorded pending reversal amount (major units)',
      centsToMajorUnits(args.totalPendingReversalCents),
    ],
    ['Uncoded transactions', args.uncodedTxnCount],
    ['Pending reversal transactions', args.pendingReversalTxnCount],
    ['Reviewed transactions', args.reviewedTxnCount],
    ['Locked transactions', args.lockedTxnCount],
    ['Auto-mapped pending transactions', args.autoMappedPendingTxnCount],
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
    'Open pending reversal workflows',
    'Unrecorded pending reversal cents',
    'Unrecorded pending reversal amount',
    'Expected coded spend after pending reversals cents',
    'Expected coded spend after pending reversals',
    'Uncoded count',
    'Uncoded amount cents',
    'Uncoded amount',
    'Recorded spend cents',
    'Recorded spend',
    'Expected spend after pending reversals cents',
    'Expected spend after pending reversals',
    'Budget headroom cents',
    'Budget headroom',
    'Expected headroom after pending reversals cents',
    'Expected headroom after pending reversals',
    'Recorded spend utilization %',
    'Budget health',
    'Budget health reason',
  ]);
  args.flatSummaryProjects.forEach((project) => {
    const actualCodedCents = project.months.reduce(
      (sum, month) => sum + month.actualCodedCents,
      0
    );
    const pendingReversalCents = project.months.reduce(
      (sum, month) => sum + month.pendingReversalCents,
      0
    );
    const pendingReversalCount = project.months.reduce(
      (sum, month) => sum + month.pendingReversalCount,
      0
    );
    const adjustedActualCodedCents = project.months.reduce(
      (sum, month) => sum + month.adjustedActualCodedCents,
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
    const position = calculateBudgetPosition({
      projectBudgetCents: project.budgetCents,
      codedActualCents: actualCodedCents,
      uncodedExposureCents: uncodedAmountCents,
      uncodedCount,
      pendingReversalCount,
      pendingReversalCents,
    });
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
      pendingReversalCount,
      pendingReversalCents,
      centsToMajorUnits(pendingReversalCents),
      adjustedActualCodedCents,
      centsToMajorUnits(adjustedActualCodedCents),
      uncodedCount,
      uncodedAmountCents,
      centsToMajorUnits(uncodedAmountCents),
      position.recordedSpendCents,
      centsToMajorUnits(position.recordedSpendCents),
      position.expectedSpendAfterPendingReversalsCents,
      centsToMajorUnits(position.expectedSpendAfterPendingReversalsCents),
      position.confirmedHeadroomCents,
      centsToMajorUnits(position.confirmedHeadroomCents),
      position.expectedHeadroomAfterPendingReversalsCents,
      centsToMajorUnits(position.expectedHeadroomAfterPendingReversalsCents),
      position.spendUtilizationPct === null
        ? ''
        : position.spendUtilizationPct / 100,
      position.health.label,
      position.health.reason,
    ]);
  });
  const headerRow = metadataRows.length + 2;
  executiveSummary.getRow(headerRow).font = { bold: true };
  setHeaderStyle(executiveSummary, headerRow);
  executiveSummary.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: 29 },
  };
  executiveSummary.views = [{ state: 'frozen', ySplit: headerRow }];
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
    { key: 'l', width: 18 },
    { key: 'm', width: 18 },
    { key: 'n', width: 18 },
    { key: 'o', width: 20 },
    { key: 'p', width: 20 },
    { key: 'q', width: 18 },
    { key: 'r', width: 20 },
    { key: 's', width: 18 },
    { key: 't', width: 28 },
    { key: 'u', width: 28 },
    { key: 'v', width: 20 },
    { key: 'w', width: 18 },
    { key: 'x', width: 30 },
    { key: 'y', width: 30 },
    { key: 'z', width: 24 },
    { key: 'aa', width: 16 },
    { key: 'ab', width: 16 },
    { key: 'ac', width: 54 },
  ];
  executiveSummary.getColumn(27).numFmt = '0.00%';
}
