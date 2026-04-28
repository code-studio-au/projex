import { AppError } from '../../api/errors';
import type { BudgetLine, Txn } from '../../types';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyId,
  asCompanyDefaultMappingRuleId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
} from '../../types';
import { dateOnlyFromInput } from '../../utils/finance';
import { normalizeExternalId } from '../../utils/transactions';

export type TxnRow = {
  id: string;
  public_id: string;
  external_id: string | null;
  company_id: string;
  project_id: string;
  txn_date: string | Date;
  item: string;
  description: string;
  amount_cents: number;
  category_id: string | null;
  sub_category_id: string | null;
  company_default_mapping_rule_id: string | null;
  coding_source: 'manual' | 'company_default_rule' | null;
  coding_pending_approval: boolean;
  created_at: string;
  updated_at: string;
};

export type BudgetLineRow = {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string | null;
  sub_category_id: string | null;
  allocated_cents: number;
  created_at: string;
  updated_at: string;
};

export function toTxn(row: TxnRow): Txn {
  const date = dateOnlyFromInput(row.txn_date);
  if (!date) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Invalid transaction date from database'
    );
  }

  return {
    id: asTxnId(row.public_id),
    internalId: row.id,
    externalId: normalizeExternalId(row.external_id),
    companyId: asCompanyId(row.company_id),
    projectId: asProjectId(row.project_id),
    date,
    item: row.item,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id ? asCategoryId(row.category_id) : undefined,
    subCategoryId: row.sub_category_id
      ? asSubCategoryId(row.sub_category_id)
      : undefined,
    companyDefaultMappingRuleId: row.company_default_mapping_rule_id
      ? asCompanyDefaultMappingRuleId(row.company_default_mapping_rule_id)
      : undefined,
    codingSource: row.coding_source ?? undefined,
    codingPendingApproval: row.coding_pending_approval,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBudgetLine(row: BudgetLineRow): BudgetLine | null {
  if (!row.category_id) return null;

  return {
    id: asBudgetLineId(row.id),
    companyId: asCompanyId(row.company_id),
    projectId: asProjectId(row.project_id),
    categoryId: asCategoryId(row.category_id),
    subCategoryId: row.sub_category_id
      ? asSubCategoryId(row.sub_category_id)
      : undefined,
    allocatedCents: Number(row.allocated_cents),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBudgetLines(rows: BudgetLineRow[]): BudgetLine[] {
  return rows.flatMap((row) => {
    const budgetLine = toBudgetLine(row);
    return budgetLine ? [budgetLine] : [];
  });
}
