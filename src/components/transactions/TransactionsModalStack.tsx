import type {
  ProjectRuleSuggestionPrompt,
  TxnReversalActionInput,
  TxnReversalActionResult,
  TxnReversalMatchSuggestion,
  TxnSplitInput,
  TxnTransferInput,
} from '../../api/types';
import type { TaxonomyHook } from '../../hooks/useTaxonomy';
import type { ProjectId, Txn, TxnId } from '../../types';
import { asCategoryId, asSubCategoryId } from '../../types/ids';
import TaxonomyManagerModal from '../TaxonomyManagerModal';
import TransactionCommentsModal from '../TransactionCommentsModal';
import TransactionReversalModal from './TransactionReversalModal';
import TransactionSplitModal from '../TransactionSplitModal';
import TransactionTransferModal from '../TransactionTransferModal';
import TransactionBulkRecodeModal from './TransactionBulkRecodeModal';
import TransactionProjectRuleModal from './TransactionProjectRuleModal';

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
  expectedProjectOptions: Array<{ value: ProjectId; label: string }>;
  onCloseReversal: () => void;
  onLoadReversalSuggestions: (
    txnId: TxnId
  ) => Promise<TxnReversalMatchSuggestion[]>;
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
    expectedProjectOptions,
    onCloseReversal,
    onLoadReversalSuggestions,
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
          onClose={onCloseReversal}
          onLoadSuggestions={onLoadReversalSuggestions}
          onSubmitAction={onSubmitReversalAction}
        />
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
    </>
  );
}
