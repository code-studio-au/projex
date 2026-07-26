import { useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import type {
  MRT_PaginationState,
  MRT_SortingState,
} from 'mantine-react-table-open';
import { useIsHydrated } from '../../hooks/useIsHydrated';
import type { TransactionDrilldownFilter, Txn } from '../../types';
import type { ProjectRuleSuggestionPrompt } from '../../api/types';
import type { TxnId } from '../../types/ids';
import type { TransactionView } from './transactionViews';
import {
  buildPaginationScopeKey,
  type QuarterOption,
} from './transactionsPanelUtils';
import type { ReversalReviewQueueState } from './reversalReviewQueue';

export function useTransactionsPanelState(args: {
  yearFilter: string | null;
  quarterFilter: QuarterOption | null;
  monthFilterKey: string | null;
  transactionView: TransactionView;
  transactionDrilldown?: TransactionDrilldownFilter | null;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const [splitTxn, setSplitTxn] = useState<Txn | null>(null);
  const [transferTxn, setTransferTxn] = useState<Txn | null>(null);
  const [reversalTxn, setReversalTxn] = useState<Txn | null>(null);
  const [reversalReviewQueue, setReversalReviewQueue] =
    useState<ReversalReviewQueueState | null>(null);
  const [unlockTxn, setUnlockTxn] = useState<Txn | null>(null);
  const [reversalModalNonce, setReversalModalNonce] = useState(0);
  const [commentsTxn, setCommentsTxn] = useState<Txn | null>(null);
  const [dismissedLinkedCommentTxnId, setDismissedLinkedCommentTxnId] =
    useState<TxnId | null>(null);
  const [expandedCommentsTxn, setExpandedCommentsTxn] = useState<Txn | null>(
    null
  );
  const [projectRulePrompt, setProjectRulePrompt] =
    useState<ProjectRuleSuggestionPrompt | null>(null);
  const [projectRuleMatchText, setProjectRuleMatchText] = useState('');
  const [projectRuleError, setProjectRuleError] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [bulkRecodeOpen, setBulkRecodeOpen] = useState(false);
  const [bulkRecodeCategoryId, setBulkRecodeCategoryId] = useState<
    string | null
  >(null);
  const [bulkRecodeSubCategoryId, setBulkRecodeSubCategoryId] = useState<
    string | null
  >(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useIsHydrated();
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: isMobile ? 10 : 20,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'date', desc: true },
  ]);
  const paginationScopeKey = buildPaginationScopeKey(args);

  return {
    bulkRecodeCategoryId,
    bulkRecodeOpen,
    bulkRecodeSubCategoryId,
    commentsTxn,
    dismissedLinkedCommentTxnId,
    expandedCommentsTxn,
    isHydrated,
    isMobile,
    manageOpen,
    pagination,
    paginationScopeKey,
    projectRuleError,
    projectRuleMatchText,
    projectRulePrompt,
    rowSelection,
    reversalModalNonce,
    reversalReviewQueue,
    reversalTxn,
    sorting,
    splitTxn,
    transferTxn,
    unlockTxn,
    setBulkRecodeCategoryId,
    setBulkRecodeOpen,
    setBulkRecodeSubCategoryId,
    setCommentsTxn,
    setDismissedLinkedCommentTxnId,
    setExpandedCommentsTxn,
    setManageOpen,
    setPagination,
    setProjectRuleError,
    setProjectRuleMatchText,
    setProjectRulePrompt,
    setReversalModalNonce,
    setReversalReviewQueue,
    setReversalTxn,
    setRowSelection,
    setSorting,
    setSplitTxn,
    setTransferTxn,
    setUnlockTxn,
  };
}
