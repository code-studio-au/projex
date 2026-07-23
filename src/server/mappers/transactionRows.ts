import { AppError } from '../../api/errors';
import type {
  BudgetLine,
  Txn,
  TxnReversalSide,
  TxnReversalStatus,
  TxnType,
} from '../../types';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyId,
  asCompanyDefaultMappingRuleId,
  asImportBatchId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
  asTxnUnlockRequestId,
  asUserId,
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
  txn_type: TxnType;
  parent_public_id: string | null;
  source_public_id: string | null;
  transfer_project_id: string | null;
  budget_impact: boolean;
  categorisable: boolean;
  import_batch_id?: string | null;
  import_source_type?: 'powerbi_expenditure_actuals' | null;
  import_source_meta?: Record<string, string> | null;
  category_id: string | null;
  sub_category_id: string | null;
  company_default_mapping_rule_id: string | null;
  coding_source: 'manual' | 'company_default_rule' | 'project_rule' | null;
  coding_pending_approval: boolean;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  locked_at: string | null;
  locked_by_user_id: string | null;
  workflow_version?: number;
  unlock_request_id?: string | null;
  unlock_request_reason?: string | null;
  unlock_request_requested_by_user_id?: string | null;
  unlock_request_requested_at?: string | null;
  unlock_request_version?: number | null;
  reversal_id?: string | null;
  reversal_status?: TxnReversalStatus | null;
  reversal_side?: TxnReversalSide | null;
  reversal_counterpart_txn_public_id?: string | null;
  reversal_expected_project_id?: string | null;
  reversal_marked_at?: string | null;
  reversal_marked_by_user_id?: string | null;
  reversal_matched_at?: string | null;
  reversal_matched_by_user_id?: string | null;
  reversal_created_at?: string | null;
  reversal_updated_at?: string | null;
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
    txnType: row.txn_type,
    parentTxnId: row.parent_public_id
      ? asTxnId(row.parent_public_id)
      : undefined,
    sourceTxnId: row.source_public_id
      ? asTxnId(row.source_public_id)
      : undefined,
    transferProjectId: row.transfer_project_id
      ? asProjectId(row.transfer_project_id)
      : undefined,
    budgetImpact: row.budget_impact,
    categorisable: row.categorisable,
    importBatchId: row.import_batch_id
      ? asImportBatchId(row.import_batch_id)
      : undefined,
    importSourceType: row.import_source_type ?? undefined,
    importSourceMeta: row.import_source_meta ?? undefined,
    categoryId: row.category_id ? asCategoryId(row.category_id) : undefined,
    subCategoryId: row.sub_category_id
      ? asSubCategoryId(row.sub_category_id)
      : undefined,
    companyDefaultMappingRuleId: row.company_default_mapping_rule_id
      ? asCompanyDefaultMappingRuleId(row.company_default_mapping_rule_id)
      : undefined,
    codingSource: row.coding_source ?? undefined,
    codingPendingApproval: row.coding_pending_approval,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedByUserId: row.reviewed_by_user_id
      ? asUserId(row.reviewed_by_user_id)
      : undefined,
    lockedAt: row.locked_at ?? undefined,
    lockedByUserId: row.locked_by_user_id
      ? asUserId(row.locked_by_user_id)
      : undefined,
    workflowVersion: Number(row.workflow_version ?? 0),
    pendingUnlockRequest:
      row.unlock_request_id &&
      row.unlock_request_reason &&
      row.unlock_request_requested_by_user_id &&
      row.unlock_request_requested_at &&
      row.unlock_request_version != null
        ? {
            id: asTxnUnlockRequestId(row.unlock_request_id),
            txnId: asTxnId(row.public_id),
            status: 'pending',
            reason: row.unlock_request_reason,
            requestedByUserId: asUserId(
              row.unlock_request_requested_by_user_id
            ),
            requestedAt: row.unlock_request_requested_at,
            version: Number(row.unlock_request_version),
          }
        : undefined,
    reversal:
      row.reversal_id && row.reversal_status && row.reversal_side
        ? {
            id: row.reversal_id,
            status: row.reversal_status,
            side: row.reversal_side,
            counterpartTxnId: row.reversal_counterpart_txn_public_id
              ? asTxnId(row.reversal_counterpart_txn_public_id)
              : undefined,
            expectedProjectId: row.reversal_expected_project_id
              ? asProjectId(row.reversal_expected_project_id)
              : undefined,
            markedAt: row.reversal_marked_at ?? undefined,
            markedByUserId: row.reversal_marked_by_user_id
              ? asUserId(row.reversal_marked_by_user_id)
              : undefined,
            matchedAt: row.reversal_matched_at ?? undefined,
            matchedByUserId: row.reversal_matched_by_user_id
              ? asUserId(row.reversal_matched_by_user_id)
              : undefined,
            createdAt: row.reversal_created_at ?? undefined,
            updatedAt: row.reversal_updated_at ?? undefined,
          }
        : undefined,
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
