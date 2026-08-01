import { AppError } from '../api/errors';
import type { TxnSplitChildInput } from '../api/types';
import type { Txn, TxnId } from '../types';
import { omitUndefinedProperties } from './optionalProperties';
import { withoutTxnCoding } from './transactions';

export function planTransactionSplit(args: {
  parent: Txn;
  children: TxnSplitChildInput[];
  now: string;
  createTxnId: () => TxnId;
}): { parent: Txn; children: Txn[] } {
  if (!args.parent.budgetImpact || !args.parent.categorisable) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only budget-impact categorisable transactions can be split'
    );
  }

  if (
    args.parent.txnType !== 'standard' &&
    args.parent.txnType !== 'transfer_child'
  ) {
    throw new AppError('VALIDATION_ERROR', 'Transaction type cannot be split');
  }

  if (args.children.length < 2) {
    throw new AppError(
      'VALIDATION_ERROR',
      'At least two split children are required'
    );
  }

  const total = args.children.reduce((sum, child) => {
    if (!Number.isSafeInteger(child.amountCents) || child.amountCents === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Split child amount must be a non-zero safe integer'
      );
    }
    if (
      (args.parent.amountCents > 0 && child.amountCents < 0) ||
      (args.parent.amountCents < 0 && child.amountCents > 0)
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Split child amounts must use the same sign as the parent transaction'
      );
    }
    return sum + child.amountCents;
  }, 0);

  if (!Number.isSafeInteger(total) || total !== args.parent.amountCents) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Split child amounts must exactly equal the parent transaction amount'
    );
  }

  const parent: Txn = withoutTxnCoding({
    ...args.parent,
    txnType: 'split_parent',
    budgetImpact: false,
    categorisable: false,
    updatedAt: args.now,
  });

  const children = args.children.map((child, index): Txn => {
    const hasCoding = Boolean(child.categoryId || child.subCategoryId);
    return omitUndefinedProperties({
      id: child.id ?? args.createTxnId(),
      companyId: args.parent.companyId,
      projectId: args.parent.projectId,
      date: args.parent.date,
      item: child.item ?? `${args.parent.item} split ${index + 1}`,
      description: child.description ?? args.parent.description,
      amountCents: child.amountCents,
      txnType: 'split_child' as const,
      parentTxnId: args.parent.id,
      sourceTxnId: args.parent.sourceTxnId,
      transferProjectId: args.parent.transferProjectId,
      budgetImpact: true,
      categorisable: true,
      categoryId: child.categoryId ?? undefined,
      subCategoryId: child.subCategoryId ?? undefined,
      codingSource: hasCoding ? ('manual' as const) : undefined,
      codingPendingApproval: false,
      createdAt: args.now,
      updatedAt: args.now,
    });
  });

  return { parent, children };
}
