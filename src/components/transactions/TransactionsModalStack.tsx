import type {
  ProjectRuleSuggestionPrompt,
  TxnReversalActionInput,
  TxnReversalActionResult,
  TxnSplitInput,
  TxnTransferInput,
} from '../../api/types';
import type { TaxonomyHook } from '../../hooks/useTaxonomy';
import type { ProjectId, Txn, TxnId } from '../../types';
import { asCategoryId, asSubCategoryId } from '../../types/ids';
import TaxonomyManagerModal from '../TaxonomyManagerModal';
import TransactionCommentsModal from '../TransactionCommentsModal';
import TransactionReversalModal, {
  type ReversalReviewQueueControls,
} from './TransactionReversalModal';
import TransactionSplitModal from '../TransactionSplitModal';
import TransactionTransferModal from '../TransactionTransferModal';
import TransactionBulkRecodeModal from './TransactionBulkRecodeModal';
import TransactionProjectRuleModal from './TransactionProjectRuleModal';
import TransactionUnlockModal from './TransactionUnlockModal';
import type { TransactionActions } from '../../hooks/useTransactionActions';

export default function TransactionsModalStack(props: {
  manageOpen: boolean;
  onCloseManage: () => void;
  taxonomy: TaxonomyHook;
  canEditTaxonomy: boolean;
  splitTxn: Txn | null;
  currencyCode: string;
  onCloseSplit: () => void;
  onSplit: (children: TxnSplitInput['children']) => Promise<void>;
  transferTxn: Txn | null;
  transferProjectOptions: Array<{ value: ProjectId; label: string }>;
  onCloseTransfer: () => void;
  onTransfer: (input: Omit<TxnTransferInput, 'txnId'>) => Promise<void>;
  reversalTxn: Txn | null;
  reversalModalNonce: number;
  reversalReviewQueue?: ReversalReviewQueueControls;
  reversalReviewQueueLoading: boolean;
  reversalReviewQueueError: string | null;
  canManageReversals: boolean;
  expectedProjectOptions: Array<{ value: ProjectId; label: string }>;
  onCloseReversal: () => void;
  onSubmitReversalAction: (
    input: TxnReversalActionInput
  ) => Promise<TxnReversalActionResult>;
  activeCommentsTxn: Txn | null;
  onCloseComments: () => void;
  bulkRecodeOpen: boolean;
  bulkRecodeCategoryId: string | null;
  bulkRecodeSubCategoryId: string | null;
  bulkRecodeSubCategoryOptions: Array<{ value: string; label: string }>;
  onCloseBulkRecode: () => void;
  onCategoryChange: (value: string | null) => void;
  onSubCategoryChange: (value: string | null) => void;
  selectedTxnIds: TxnId[];
  onSubmitBulkRecode: (args: {
    txnIds: TxnId[];
    categoryId: ReturnType<typeof asCategoryId>;
    subCategoryId: ReturnType<typeof asSubCategoryId>;
  }) => Promise<boolean>;
  projectRulePrompt: ProjectRuleSuggestionPrompt | null;
  projectRuleMatchText: string;
  projectRuleError: string | null;
  createProjectRulePending: boolean;
  onCloseProjectRule: () => void;
  onProjectRuleMatchTextChange: (value: string) => void;
  onSubmitProjectRule: () => Promise<void>;
  unlockTxn: Txn | null;
  canResolveUnlock: boolean;
  canAdminUnlock: boolean;
  transactionActions: TransactionActions;
  onCloseUnlock: () => void;
}) {
  const {
    manageOpen,
    onCloseManage,
    taxonomy,
    canEditTaxonomy,
    splitTxn,
    currencyCode,
    onCloseSplit,
    onSplit,
    transferTxn,
    transferProjectOptions,
    onCloseTransfer,
    onTransfer,
    reversalTxn,
    reversalModalNonce,
    reversalReviewQueue,
    reversalReviewQueueLoading,
    reversalReviewQueueError,
    canManageReversals,
    expectedProjectOptions,
    onCloseReversal,
    onSubmitReversalAction,
    activeCommentsTxn,
    onCloseComments,
    bulkRecodeOpen,
    bulkRecodeCategoryId,
    bulkRecodeSubCategoryId,
    bulkRecodeSubCategoryOptions,
    onCloseBulkRecode,
    onCategoryChange,
    onSubCategoryChange,
    selectedTxnIds,
    onSubmitBulkRecode,
    projectRulePrompt,
    projectRuleMatchText,
    projectRuleError,
    createProjectRulePending,
    onCloseProjectRule,
    onProjectRuleMatchTextChange,
    onSubmitProjectRule,
    unlockTxn,
    canResolveUnlock,
    canAdminUnlock,
    transactionActions,
    onCloseUnlock,
  } = props;

  return (
    <>
      <TaxonomyManagerModal
        opened={manageOpen}
        onClose={onCloseManage}
        taxonomy={taxonomy}
        readOnly={!canEditTaxonomy}
      />

      <TransactionSplitModal
        opened={Boolean(splitTxn)}
        txn={splitTxn}
        taxonomy={taxonomy}
        currencyCode={currencyCode}
        onClose={onCloseSplit}
        onSplit={onSplit}
      />

      <TransactionTransferModal
        opened={Boolean(transferTxn)}
        txn={transferTxn}
        currencyCode={currencyCode}
        projectOptions={transferProjectOptions}
        onClose={onCloseTransfer}
        onTransfer={onTransfer}
      />

      {reversalTxn ? (
        <TransactionReversalModal
          key={`${reversalTxn.id}:${reversalModalNonce}`}
          opened
          txn={reversalTxn}
          currencyCode={currencyCode}
          expectedProjectOptions={expectedProjectOptions}
          canManage={canManageReversals}
          {...(reversalReviewQueue ? { reviewQueue: reversalReviewQueue } : {})}
          onClose={onCloseReversal}
          onSubmitAction={onSubmitReversalAction}
        />
      ) : null}

      {reversalReviewQueue && !reversalTxn ? (
        <Modal
          opened
          centered
          title={
            <Group gap="xs">
              <span>Review reversal match</span>
              <Badge color="gray" variant="light">
                Match {reversalReviewQueue.currentPosition} of{' '}
                {reversalReviewQueue.totalCount}
              </Badge>
            </Group>
          }
          onClose={onCloseReversal}
        >
          <Stack gap="md" align="center">
            {reversalReviewQueueLoading ? (
              <>
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Loading the next reversal match...
                </Text>
              </>
            ) : (
              <>
                <Alert color="yellow" w="100%">
                  {reversalReviewQueueError ??
                    'This transaction is no longer available for review.'}
                </Alert>
                <Button
                  variant="light"
                  disabled={!reversalReviewQueue.hasNext}
                  onClick={reversalReviewQueue.onNext}
                >
                  Next match
                </Button>
              </>
            )}
          </Stack>
        </Modal>
      ) : null}

      <TransactionCommentsModal
        opened={Boolean(activeCommentsTxn)}
        txn={activeCommentsTxn}
        onClose={onCloseComments}
      />

      <TransactionBulkRecodeModal
        opened={bulkRecodeOpen}
        categoryId={bulkRecodeCategoryId}
        subCategoryId={bulkRecodeSubCategoryId}
        categoryOptions={taxonomy.categoryOptions}
        subCategoryOptions={bulkRecodeSubCategoryOptions}
        onClose={onCloseBulkRecode}
        onCategoryChange={onCategoryChange}
        onSubCategoryChange={onSubCategoryChange}
        onSubmit={async () => {
          if (!bulkRecodeCategoryId || !bulkRecodeSubCategoryId) return;
          const success = await onSubmitBulkRecode({
            txnIds: selectedTxnIds,
            categoryId: asCategoryId(bulkRecodeCategoryId),
            subCategoryId: asSubCategoryId(bulkRecodeSubCategoryId),
          });
          if (success) {
            onCloseBulkRecode();
          }
        }}
      />

      <TransactionProjectRuleModal
        opened={Boolean(projectRulePrompt)}
        prompt={projectRulePrompt}
        matchText={projectRuleMatchText}
        error={projectRuleError}
        isSubmitting={createProjectRulePending}
        onClose={onCloseProjectRule}
        onMatchTextChange={onProjectRuleMatchTextChange}
        onSubmit={onSubmitProjectRule}
      />

      {unlockTxn ? (
        <TransactionUnlockModal
          key={`${unlockTxn.id}:${unlockTxn.workflowVersion}`}
          txn={unlockTxn}
          canResolveUnlock={canResolveUnlock}
          canAdminUnlock={canAdminUnlock}
          transactionActions={transactionActions}
          onClose={onCloseUnlock}
        />
      ) : null}
    </>
  );
}
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
