import ExcelJS from 'exceljs';

import type {
  CompanyExportOptions,
  CompanySummaryProject,
  Project,
} from '../../types';
import { asCompanyId, asProjectId } from '../../types';

export type WorksheetRowValue = string | number | boolean | null | undefined;

export type WorksheetColumn = {
  header: string;
  key: string;
  width?: number;
  style?: Partial<ExcelJS.Style>;
};

export type ProjectExportRow = {
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

export type TransactionExportRow = {
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
  reversalStatus: string;
  reversalSide: string;
  reversalCounterpartTxnId: string;
  reversalExpectedProjectId: string;
  reversalVersion: number | string;
  reversalMatchMethod: string;
  reversalMatchScore: number | string;
  reversalCandidateCount: number | string;
  reversalSourceSnapshot: string;
  reversalCounterpartSnapshot: string;
  reversalMatchEvidence: string;
  reversalProposedAt: string;
  reversalProposedByUserId: string;
  reversalMarkedAt: string;
  reversalMarkedByUserId: string;
  reversalMatchedAt: string;
  reversalMatchedByUserId: string;
  pendingReversalOpen: boolean;
  pendingReversalExpected: boolean;
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

export type ProjectFinanceRollup = {
  budgetCents: number;
  actualCodedCents: number;
  pendingReversalCount: number;
  pendingReversalCents: number;
  adjustedActualCodedCents: number;
  uncodedCount: number;
  uncodedAmountCents: number;
};

export type TaxonomyRollup = {
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
  pendingReversalCount: number;
  pendingReversalCents: number;
  adjustedActualCodedCents: number;
  uncodedAmountCents: number;
  transactionCount: number;
};

export const amountStyle: Partial<ExcelJS.Style> = { numFmt: '#,##0.00' };
export const percentStyle: Partial<ExcelJS.Style> = { numFmt: '0.00%' };
export const COMPANY_EXPORT_CONTRACT_VERSION = '2026.07-v5';

export function buildTransactionColumns(): WorksheetColumn[] {
  return [
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
    { header: 'Reversal status', key: 'reversalStatus' },
    { header: 'Reversal side', key: 'reversalSide' },
    {
      header: 'Reversal counterpart transaction ID',
      key: 'reversalCounterpartTxnId',
    },
    {
      header: 'Reversal expected project ID',
      key: 'reversalExpectedProjectId',
    },
    { header: 'Reversal version', key: 'reversalVersion' },
    { header: 'Reversal match method', key: 'reversalMatchMethod' },
    { header: 'Reversal match score', key: 'reversalMatchScore' },
    { header: 'Reversal candidate count', key: 'reversalCandidateCount' },
    { header: 'Reversal source details', key: 'reversalSourceSnapshot' },
    {
      header: 'Reversal counterpart details',
      key: 'reversalCounterpartSnapshot',
    },
    { header: 'Reversal match evidence', key: 'reversalMatchEvidence' },
    { header: 'Reversal proposed at', key: 'reversalProposedAt' },
    {
      header: 'Reversal proposed by user ID',
      key: 'reversalProposedByUserId',
    },
    { header: 'Reversal marked at', key: 'reversalMarkedAt' },
    { header: 'Reversal marked by user ID', key: 'reversalMarkedByUserId' },
    { header: 'Reversal matched at', key: 'reversalMatchedAt' },
    { header: 'Reversal matched by user ID', key: 'reversalMatchedByUserId' },
    { header: 'Pending reversal open', key: 'pendingReversalOpen' },
    {
      header: 'Pending reversal still expected',
      key: 'pendingReversalExpected',
    },
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
}

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

export function centsToMajorUnits(cents: number): number {
  return cents / 100;
}

export function buildExportFileName(args: {
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

export function toProject(row: ProjectExportRow): Project {
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

export function flattenSummaryProjects(
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

export function setHeaderStyle(
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

export function createWorksheet(
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

export function sumProjectMonths(
  project: CompanySummaryProject,
  selector: (month: CompanySummaryProject['months'][number]) => number
): number {
  return project.months.reduce((sum, month) => sum + selector(month), 0);
}
