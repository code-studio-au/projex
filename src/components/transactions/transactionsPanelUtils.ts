import type { TxnBulkActionResult } from '../../api/types';
import type { TransactionDrilldownFilter } from '../../types';
import { showAppToast } from '../../utils/toast';
import type { TransactionView } from './transactionViews';

export type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export function toQuarterOption(value: string | null): QuarterOption | null {
  if (!value) return null;
  if (value === 'Q1' || value === 'Q2' || value === 'Q3' || value === 'Q4') {
    return value;
  }
  return null;
}

export function formatTxnCountLabel(count: number) {
  return `${count} transaction${count === 1 ? '' : 's'}`;
}

export function buildPaginationScopeKey(args: {
  yearFilter: string | null;
  quarterFilter: QuarterOption | null;
  monthFilterKey: string | null;
  transactionView: TransactionView;
  transactionDrilldown?: TransactionDrilldownFilter | null;
}) {
  const { yearFilter, quarterFilter, monthFilterKey, transactionView } = args;
  const transactionDrilldown = args.transactionDrilldown ?? null;
  return `${yearFilter ?? 'all'}-${quarterFilter ?? 'all'}-${monthFilterKey ?? 'all'}-${transactionView}-${transactionDrilldown?.kind ?? 'none'}-${transactionDrilldown?.kind === 'subcategory' ? transactionDrilldown.subCategoryId : (transactionDrilldown?.categoryId ?? 'all')}`;
}

export function showBulkActionResultToast(args: {
  result: TxnBulkActionResult;
  successLabel: string;
}) {
  const { result, successLabel } = args;
  const missingCount = result.requestedCount - result.foundCount;
  const details = [
    result.unchangedCount > 0
      ? `${formatTxnCountLabel(result.unchangedCount)} unchanged`
      : null,
    result.lockedCount > 0
      ? `${formatTxnCountLabel(result.lockedCount)} locked`
      : null,
    result.ineligibleCount > 0
      ? `${formatTxnCountLabel(result.ineligibleCount)} not eligible`
      : null,
    missingCount > 0
      ? `${formatTxnCountLabel(missingCount)} no longer found`
      : null,
  ].filter(Boolean);

  showAppToast({
    title:
      result.updatedCount > 0
        ? `Bulk ${successLabel} complete`
        : 'No changes applied',
    tone:
      result.updatedCount > 0 &&
      result.lockedCount === 0 &&
      result.ineligibleCount === 0 &&
      missingCount === 0
        ? 'success'
        : 'warning',
    message:
      result.updatedCount > 0
        ? `${successLabel} ${formatTxnCountLabel(result.updatedCount)}.${details.length > 0 ? ` ${details.join('. ')}.` : ''}`
        : details.length > 0
          ? details.join('. ')
          : 'The selected transactions already matched the requested state.',
    autoClose: 9000,
  });
}
