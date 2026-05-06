import type { TxnComment } from '../../types';
import {
  asCompanyId,
  asProjectId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../../types';

export type TxnCommentRow = {
  id: string;
  company_id: string;
  project_id: string;
  txn_public_id: string;
  parent_comment_id: string | null;
  body: string;
  assigned_to_user_id: string | null;
  created_by_user_id: string;
  created_by_name: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export function toTxnComment(row: TxnCommentRow): TxnComment {
  return {
    id: asTxnCommentId(row.id),
    companyId: asCompanyId(row.company_id),
    projectId: asProjectId(row.project_id),
    txnId: asTxnId(row.txn_public_id),
    parentCommentId: row.parent_comment_id
      ? asTxnCommentId(row.parent_comment_id)
      : undefined,
    body: row.body,
    assignedToUserId: row.assigned_to_user_id
      ? asUserId(row.assigned_to_user_id)
      : undefined,
    createdByUserId: asUserId(row.created_by_user_id),
    createdByName: row.created_by_name,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedByUserId: row.resolved_by_user_id
      ? asUserId(row.resolved_by_user_id)
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
