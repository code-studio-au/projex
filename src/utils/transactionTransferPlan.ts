import { AppError } from '../api/errors';
import type { TxnTransferInput } from '../api/types';
import type { CompanyId, Txn, TxnId } from '../types';
import { withoutTxnCoding } from './transactions';

export function planTransactionTransfer(args: {
  source: Txn;
  input: TxnTransferInput;
  destinationCompanyId: CompanyId;
  now: string;
  createTxnId: () => TxnId;
}): { source: Txn; destination: Txn } {
  if (args.source.companyId !== args.destinationCompanyId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Transactions can only be moved within the same company'
    );
  }

  if (args.input.destinationProjectId === args.source.projectId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Destination project must be different from source project'
    );
  }

  if (!args.source.budgetImpact || !args.source.categorisable) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only budget-impact categorisable transactions can be moved'
    );
  }

  if (
    args.source.txnType !== 'standard' &&
    args.source.txnType !== 'split_child'
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only standard transactions or split children can be moved'
    );
  }

  const source: Txn = withoutTxnCoding({
    ...args.source,
    txnType: 'transfer_source',
    transferProjectId: args.input.destinationProjectId,
    budgetImpact: false,
    categorisable: false,
    updatedAt: args.now,
  });

  const destination: Txn = {
    id: args.input.destinationTxnId ?? args.createTxnId(),
    companyId: args.source.companyId,
    projectId: args.input.destinationProjectId,
    date: args.source.date,
    item: args.input.item ?? args.source.item,
    description: args.input.description ?? args.source.description,
    amountCents: args.source.amountCents,
    txnType: 'transfer_child',
    sourceTxnId: args.source.id,
    transferProjectId: args.source.projectId,
    budgetImpact: true,
    categorisable: true,
    codingPendingApproval: false,
    createdAt: args.now,
    updatedAt: args.now,
  };

  return { source, destination };
}
