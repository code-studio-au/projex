import { AppError } from '../api/errors';
import type { TxnUpdateInput } from '../api/types';
import type { Txn, TxnId } from '../types';

type TxnAccountingMetadata = Pick<
  Txn,
  | 'txnType'
  | 'parentTxnId'
  | 'sourceTxnId'
  | 'transferProjectId'
  | 'budgetImpact'
  | 'categorisable'
>;

function standardTxnAccountingMetadata(): TxnAccountingMetadata {
  return {
    txnType: 'standard',
    parentTxnId: undefined,
    sourceTxnId: undefined,
    transferProjectId: undefined,
    budgetImpact: true,
    categorisable: true,
  };
}

export function withStandardTxnAccountingMetadata<T extends object>(
  txn: T
): T & TxnAccountingMetadata {
  return {
    ...standardTxnAccountingMetadata(),
    ...txn,
  };
}

export function isBudgetImpactTxn(txn: Pick<Txn, 'budgetImpact'>): boolean {
  return txn.budgetImpact;
}

export function isCategorisableTxn(txn: Pick<Txn, 'categorisable'>): boolean {
  return txn.categorisable;
}

export function assertTxnCodingAllowed(
  txn: Pick<
    Txn,
    | 'categorisable'
    | 'categoryId'
    | 'subCategoryId'
    | 'companyDefaultMappingRuleId'
    | 'codingSource'
    | 'codingPendingApproval'
  >
) {
  if (txn.categorisable) return;

  if (
    txn.categoryId ||
    txn.subCategoryId ||
    txn.companyDefaultMappingRuleId ||
    txn.codingSource ||
    txn.codingPendingApproval
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Transaction cannot be coded because it is a source marker'
    );
  }
}

export function txnTypeLabel(txn: Pick<Txn, 'txnType'>): string {
  switch (txn.txnType) {
    case 'split_parent':
      return 'Split parent';
    case 'split_child':
      return 'Split child';
    case 'transfer_source':
      return 'Transferred out';
    case 'transfer_child':
      return 'Transferred in';
    case 'standard':
      return 'Standard';
  }
}

export function normalizeExternalId(
  value: string | null | undefined
): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

export function normalizeTxnPatch(
  input: TxnUpdateInput
): Partial<Txn> & { id: TxnId } {
  const next: Partial<Txn> & { id: TxnId } = { id: input.id };
  if (typeof input.companyId !== 'undefined') next.companyId = input.companyId;
  if (typeof input.projectId !== 'undefined') next.projectId = input.projectId;
  if (typeof input.date !== 'undefined') next.date = input.date;
  if (typeof input.item !== 'undefined') next.item = input.item;
  if (typeof input.description !== 'undefined')
    next.description = input.description;
  if (typeof input.amountCents !== 'undefined')
    next.amountCents = input.amountCents;
  if (typeof input.companyDefaultMappingRuleId !== 'undefined') {
    next.companyDefaultMappingRuleId =
      input.companyDefaultMappingRuleId ?? undefined;
  }
  if (typeof input.codingSource !== 'undefined')
    next.codingSource = input.codingSource;
  if (typeof input.codingPendingApproval !== 'undefined') {
    next.codingPendingApproval = input.codingPendingApproval;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'externalId')) {
    next.externalId = input.externalId ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'categoryId')) {
    next.categoryId = input.categoryId ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'subCategoryId')) {
    next.subCategoryId = input.subCategoryId ?? undefined;
  }
  return next;
}

export function assertUniqueTransactionKeysInProject(
  transactions: Array<{ id: TxnId | string; externalId?: string | null }>
) {
  const ids = new Set<string>();
  const externalIds = new Set<string>();

  for (const txn of transactions) {
    const idKey = String(txn.id);
    if (ids.has(idKey)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Duplicate transaction id in project: ${idKey}`
      );
    }
    ids.add(idKey);

    const externalId = normalizeExternalId(txn.externalId);
    if (!externalId) continue;
    if (externalIds.has(externalId)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Duplicate transaction externalId in project: ${externalId}`
      );
    }
    externalIds.add(externalId);
  }
}
