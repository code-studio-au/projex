import { AppError } from '../api/errors';
import type { TxnImportTxnInput } from '../api/types';
import type {
  BudgetLine,
  Category,
  CompanyId,
  ProjectAutoCodingRule,
  ProjectId,
  SubCategory,
  Txn,
} from '../types';
import { txnInputSchema } from '../validation/schemas';
import { validateOrThrow } from '../validation/validate';
import { applyProjectAutoCodingRule } from './projectAutoCodingRules';
import { omitUndefinedProperties } from './optionalProperties';
import {
  assertUniqueTransactionKeysInProject,
  normalizeExternalId,
  withoutTxnCoding,
  withStandardTxnAccountingMetadata,
} from './transactions';

export function planTransactionImportCommit(args: {
  projectId: ProjectId;
  companyId: CompanyId;
  incomingTransactions: TxnImportTxnInput[];
  existingTransactions: Txn[];
  existingBudgets: BudgetLine[];
  projectAutoCodingRules?: ProjectAutoCodingRule[];
  mode: 'append' | 'replaceAll';
  autoCreateBudgets: boolean;
}): {
  importedTransactions: Txn[];
  nextTransactions: Txn[];
  budgetTargetsToCreate: Array<{
    categoryId: Category['id'];
    subCategoryId: SubCategory['id'];
  }>;
} {
  const normalizedIncoming = args.incomingTransactions.map((input) => {
    const { forceUncoded = false, ...txn } = input;
    if (txn.projectId !== args.projectId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction projectId does not match import target'
      );
    }
    if (txn.companyId !== args.companyId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction companyId does not match project company'
      );
    }

    return {
      forceUncoded,
      txn: withStandardTxnAccountingMetadata(
        omitUndefinedProperties({
          ...txn,
          externalId: normalizeExternalId(txn.externalId),
        })
      ),
    };
  });

  const importedTransactions = normalizedIncoming.map(
    ({ forceUncoded, txn }) => {
      if (forceUncoded) {
        return withoutTxnCoding(txn);
      }
      return applyProjectAutoCodingRule({
        txn,
        rules: args.projectAutoCodingRules ?? [],
      });
    }
  );

  for (const txn of importedTransactions) {
    validateOrThrow(txnInputSchema, txn);
  }

  const nextTransactions =
    args.mode === 'replaceAll'
      ? importedTransactions
      : [...args.existingTransactions, ...importedTransactions];
  assertUniqueTransactionKeysInProject(nextTransactions);

  const budgetTargetsToCreate = args.autoCreateBudgets
    ? missingBudgetTargets(importedTransactions, args.existingBudgets)
    : [];

  return {
    importedTransactions,
    nextTransactions,
    budgetTargetsToCreate,
  };
}

function missingBudgetTargets(
  transactions: Txn[],
  existingBudgets: BudgetLine[]
): Array<{ categoryId: Category['id']; subCategoryId: SubCategory['id'] }> {
  const existingBudgetSubIds = new Set(
    existingBudgets
      .map((budget) => budget.subCategoryId)
      .filter((id): id is SubCategory['id'] => Boolean(id))
  );
  const createdThisRun = new Set<SubCategory['id']>();
  const targets: Array<{
    categoryId: Category['id'];
    subCategoryId: SubCategory['id'];
  }> = [];

  for (const txn of transactions) {
    if (!txn.categoryId || !txn.subCategoryId) continue;
    if (
      existingBudgetSubIds.has(txn.subCategoryId) ||
      createdThisRun.has(txn.subCategoryId)
    ) {
      continue;
    }
    createdThisRun.add(txn.subCategoryId);
    targets.push({
      categoryId: txn.categoryId,
      subCategoryId: txn.subCategoryId,
    });
  }

  return targets;
}
