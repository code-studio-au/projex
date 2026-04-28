import { AppError } from '../api/errors';
import type { TxnUpdateInput } from '../api/types';
import type { Txn, TxnId } from '../types';

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

function compareOptionalString(
  a: string | undefined,
  b: string | undefined
): number {
  if (a && b) return a.localeCompare(b);
  if (a) return 1;
  if (b) return -1;
  return 0;
}

function compareOptionalDecimalString(
  a: string | undefined,
  b: string | undefined
): number {
  if (a && b) {
    const aNumber = /^\d+$/.test(a) ? BigInt(a) : null;
    const bNumber = /^\d+$/.test(b) ? BigInt(b) : null;
    if (aNumber !== null && bNumber !== null) {
      if (aNumber < bNumber) return -1;
      if (aNumber > bNumber) return 1;
      return 0;
    }
    return a.localeCompare(b);
  }
  if (a) return 1;
  if (b) return -1;
  return 0;
}

export function sortTransactionsForList<
  T extends Pick<Txn, 'createdAt' | 'internalId'>,
>(transactions: readonly T[]): T[] {
  return transactions
    .map((transaction, index) => ({ transaction, index }))
    .sort((a, b) => {
      const createdAtOrder = compareOptionalString(
        a.transaction.createdAt,
        b.transaction.createdAt
      );
      if (createdAtOrder !== 0) return createdAtOrder;

      const internalIdOrder = compareOptionalDecimalString(
        a.transaction.internalId,
        b.transaction.internalId
      );
      if (internalIdOrder !== 0) return internalIdOrder;

      return a.index - b.index;
    })
    .map(({ transaction }) => transaction);
}
