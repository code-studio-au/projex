import ExcelJS from 'exceljs';

import {
  createWorksheet,
  type TransactionExportRow,
  type WorksheetColumn,
  type WorksheetRowValue,
} from './exportWorkbookShared';

export function addFullDetailWorksheets(args: {
  workbook: ExcelJS.Workbook;
  transactionColumns: WorksheetColumn[];
  budgetRows: Array<Record<string, WorksheetRowValue>>;
  transactionRows: TransactionExportRow[];
  categoryRows: Array<Record<string, WorksheetRowValue>>;
  subCategoryRows: Array<Record<string, WorksheetRowValue>>;
  companyDefaultCategoryRows: Array<Record<string, WorksheetRowValue>>;
  companyDefaultSubCategoryRows: Array<Record<string, WorksheetRowValue>>;
  defaultMappingRuleRows: Array<Record<string, WorksheetRowValue>>;
  importRuleRows: Array<Record<string, WorksheetRowValue>>;
  companyMemberRows: Array<Record<string, WorksheetRowValue>>;
  projectMembershipRows: Array<Record<string, WorksheetRowValue>>;
}) {
  createWorksheet(
    args.workbook,
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
    args.budgetRows
  );
  createWorksheet(
    args.workbook,
    'Transactions',
    args.transactionColumns,
    args.transactionRows
  );
  createWorksheet(
    args.workbook,
    'Reviewed Transactions',
    args.transactionColumns,
    args.transactionRows.filter((row) => !!row.reviewedAt)
  );
  createWorksheet(
    args.workbook,
    'Locked Transactions',
    args.transactionColumns,
    args.transactionRows.filter((row) => !!row.lockedAt)
  );
  createWorksheet(
    args.workbook,
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
    args.categoryRows
  );
  createWorksheet(
    args.workbook,
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
    args.subCategoryRows
  );
  createWorksheet(
    args.workbook,
    'Company Default Categories',
    [
      { header: 'Default category ID', key: 'categoryId' },
      { header: 'Name', key: 'name' },
      { header: 'Created at', key: 'createdAt' },
      { header: 'Updated at', key: 'updatedAt' },
    ],
    args.companyDefaultCategoryRows
  );
  createWorksheet(
    args.workbook,
    'Company Default Subcategories',
    [
      { header: 'Default subcategory ID', key: 'subCategoryId' },
      { header: 'Default category ID', key: 'categoryId' },
      { header: 'Default category name', key: 'categoryName' },
      { header: 'Name', key: 'name' },
      { header: 'Created at', key: 'createdAt' },
      { header: 'Updated at', key: 'updatedAt' },
    ],
    args.companyDefaultSubCategoryRows
  );
  createWorksheet(
    args.workbook,
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
    args.defaultMappingRuleRows
  );
  createWorksheet(
    args.workbook,
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
    args.importRuleRows
  );
  createWorksheet(
    args.workbook,
    'Company Members',
    [
      { header: 'User ID', key: 'userId' },
      { header: 'Name', key: 'name' },
      { header: 'Email', key: 'email' },
      { header: 'Company role', key: 'role' },
      { header: 'User disabled', key: 'disabled' },
      { header: 'Global superadmin', key: 'isGlobalSuperadmin' },
    ],
    args.companyMemberRows
  );
  createWorksheet(
    args.workbook,
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
    args.projectMembershipRows
  );
}
