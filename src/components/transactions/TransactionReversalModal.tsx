import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';

import type {
  TxnReversalActionInput,
  TxnReversalActionResult,
} from '../../api/types';
import type { ProjectId, Txn, TxnId } from '../../types';
import type { TxnReversalTxnSummary } from '../../types';
import { useTxnReversalSuggestionsQuery } from '../../queries/transactions';
import { formatCurrencyFromCents } from '../../utils/money';
import { omitUndefinedProperties } from '../../utils/optionalProperties';
import ModalSelect from '../ModalSelect';
import TransactionReversalPairDetails from './TransactionReversalPairDetails';

export type ReversalReviewQueueControls = {
  currentPosition: number;
  totalCount: number;
  reviewedCount: number;
  remainingCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onResolved: (outcome: 'approved' | 'rejected') => void;
};

function statusTone(txn: Txn) {
  if (txn.reversal?.status === 'reversal_exception') return 'red';
  if (txn.reversal?.status === 'reversed_matched') return 'green';
  if (txn.reversal?.status === 'auto_matched_ambiguous_pending_approval')
    return 'orange';
  if (txn.reversal?.status === 'auto_matched_pending_approval') return 'blue';
  if (txn.reversal?.status === 'pending_reversal') return 'violet';
  return 'gray';
}

function statusLabel(txn: Txn) {
  if (txn.reversal?.status === 'reversal_exception')
    return 'Reversal exception';
  if (txn.reversal?.status === 'reversed_matched')
    return txn.reversal.side === 'source'
      ? 'Matched original'
      : 'Matched reversal';
  if (txn.reversal?.status === 'auto_matched_ambiguous_pending_approval')
    return 'Defaulted auto-match awaiting approval';
  if (txn.reversal?.status === 'auto_matched_pending_approval')
    return 'Auto-match awaiting approval';
  if (txn.reversal?.status === 'pending_reversal') return 'Awaiting reversal';
  return 'No reversal workflow';
}

function toTxnSummary(txn: Txn): TxnReversalTxnSummary {
  return omitUndefinedProperties({
    txnId: txn.id,
    externalId: txn.externalId,
    date: txn.date,
    item: txn.item,
    description: txn.description,
    amountCents: txn.amountCents,
    sourceType: txn.importSourceType,
  });
}

function useTransactionReversalModalController(props: {
  opened: boolean;
  txn: Txn;
  currencyCode: string;
  expectedProjectOptions: Array<{ value: ProjectId; label: string }>;
  canManage: boolean;
  reviewQueue?: ReversalReviewQueueControls;
  onClose: () => void;
  onSubmitAction: (
    input: TxnReversalActionInput
  ) => Promise<TxnReversalActionResult>;
}) {
  const {
    opened,
    txn,
    currencyCode,
    expectedProjectOptions,
    canManage,
    reviewQueue,
    onClose,
    onSubmitAction,
  } = props;
  const [commentBody, setCommentBody] = useState('');
  const [expectedProjectId, setExpectedProjectId] = useState<string | null>(
    txn.reversal?.expectedProjectId ?? null
  );
  const [selectedSuggestionTxnIdOverride, setSelectedSuggestionTxnId] =
    useState<string | null>(null);
  const shouldLoadSuggestions =
    txn.reversal?.side !== 'reversal' &&
    (txn.reversal?.status === 'pending_reversal' ||
      txn.reversal?.status === 'reversal_exception');
  const suggestionsQuery = useTxnReversalSuggestionsQuery(
    txn.projectId,
    txn.id,
    { enabled: opened && shouldLoadSuggestions }
  );
  const suggestions = suggestionsQuery.data ?? [];
  const selectedSuggestionTxnId = suggestions.some(
    (suggestion) => suggestion.txnId === selectedSuggestionTxnIdOverride
  )
    ? selectedSuggestionTxnIdOverride
    : (suggestions[0]?.txnId ?? null);
  const suggestionsLoading =
    shouldLoadSuggestions && suggestionsQuery.isLoading;
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const error =
    actionError ??
    (suggestionsQuery.error instanceof Error
      ? suggestionsQuery.error.message
      : suggestionsQuery.isError
        ? 'Could not load reversal suggestions.'
        : null);

  const isSourceSide = txn.reversal?.side !== 'reversal';
  const isPending =
    txn.reversal?.status === 'pending_reversal' ||
    txn.reversal?.status === 'reversal_exception';
  const isSuggested =
    txn.reversal?.status === 'auto_matched_pending_approval' ||
    txn.reversal?.status === 'auto_matched_ambiguous_pending_approval';
  const isAmbiguousSuggested =
    txn.reversal?.status === 'auto_matched_ambiguous_pending_approval';
  const isException = txn.reversal?.status === 'reversal_exception';
  const isMatched = txn.reversal?.status === 'reversed_matched';
  const selectedSuggestion =
    suggestions.find(
      (suggestion) => suggestion.txnId === selectedSuggestionTxnId
    ) ?? null;
  const sourceSummary =
    txn.reversal?.sourceTxn ??
    (txn.reversal?.side === 'reversal' ? undefined : toTxnSummary(txn));
  const counterpartSummary =
    txn.reversal?.counterpartTxn ??
    (txn.reversal?.side === 'reversal' ? toTxnSummary(txn) : undefined);
  const selectedSuggestionSummary = selectedSuggestion
    ? omitUndefinedProperties({
        txnId: selectedSuggestion.txnId,
        externalId: selectedSuggestion.externalId,
        date: selectedSuggestion.date,
        item: selectedSuggestion.item,
        description: selectedSuggestion.description,
        amountCents: selectedSuggestion.amountCents,
      })
    : null;
  const expectedProjectName =
    expectedProjectOptions.find(
      (option) => option.value === txn.reversal?.expectedProjectId
    )?.label ?? null;
  const modalTitle = isMatched
    ? 'Reversal pair'
    : isSuggested
      ? 'Review reversal match'
      : isException
        ? 'Reversal exception'
        : txn.reversal
          ? 'Pending reversal'
          : 'Mark pending reversal';

  async function submit(
    input: TxnReversalActionInput,
    queueOutcome?: 'approved' | 'rejected'
  ) {
    setSubmitting(true);
    setActionError(null);
    try {
      await onSubmitAction(
        omitUndefinedProperties({
          ...input,
          expectedReversalVersion: txn.reversal?.version,
        })
      );
      if (queueOutcome && reviewQueue) {
        reviewQueue.onResolved(queueOutcome);
      } else {
        onClose();
      }
    } catch (nextError) {
      setActionError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not update reversal workflow.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return {
    canManage,
    commentBody,
    counterpartSummary,
    currencyCode,
    error,
    expectedProjectId,
    expectedProjectName,
    expectedProjectOptions,
    isAmbiguousSuggested,
    isException,
    isMatched,
    isPending,
    isSourceSide,
    isSuggested,
    modalTitle,
    onClose,
    opened,
    reviewQueue,
    selectedSuggestion,
    selectedSuggestionSummary,
    selectedSuggestionTxnId,
    setCommentBody,
    setExpectedProjectId,
    setSelectedSuggestionTxnId,
    sourceSummary,
    submit,
    submitting,
    suggestions,
    suggestionsLoading,
    txn,
  };
}

type TransactionReversalModalController = ReturnType<
  typeof useTransactionReversalModalController
>;

function ReversalPairSummary({
  model,
}: {
  model: TransactionReversalModalController;
}) {
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap={model.reviewQueue ? 'sm' : 2}>
        <Stack gap={2}>
          <Text size="sm" fw={650}>
            {model.isAmbiguousSuggested
              ? 'Default match selected'
              : 'Recommended match'}
          </Text>
          <Text size="sm" c="dimmed">
            {model.isAmbiguousSuggested
              ? 'Multiple valid pairings existed, so Projex selected a deterministic default. Verify both transactions and the evidence before deciding.'
              : 'Projex recommended this pair automatically. Verify both transactions and the evidence before deciding.'}
          </Text>
        </Stack>
        {model.reviewQueue ? (
          <>
            <Divider />
            <Group justify="space-between" gap="sm" wrap="wrap">
              <Badge color="gray" variant="light">
                Match {model.reviewQueue.currentPosition} of{' '}
                {model.reviewQueue.totalCount}
              </Badge>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  disabled={!model.reviewQueue.hasPrevious || model.submitting}
                  onClick={model.reviewQueue.onPrevious}
                >
                  Previous
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  disabled={!model.reviewQueue.hasNext || model.submitting}
                  onClick={model.reviewQueue.onNext}
                >
                  Next
                </Button>
              </Group>
            </Group>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}

function PendingReversalActions({
  model,
}: {
  model: TransactionReversalModalController;
}) {
  return (
    <>
      <ModalSelect
        label="Expected destination project"
        placeholder="Optional"
        data={model.expectedProjectOptions}
        value={model.expectedProjectId}
        clearable
        searchable
        onChange={model.setExpectedProjectId}
      />
      <Textarea
        label="Comment"
        description="Required. This note is written into the transaction comment thread."
        value={model.commentBody}
        minRows={4}
        onChange={(event) => model.setCommentBody(event.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button
          loading={model.submitting}
          disabled={!model.commentBody.trim()}
          onClick={() =>
            void model.submit(
              omitUndefinedProperties({
                action: 'markPending' as const,
                txnId: model.txn.id,
                commentBody: model.commentBody,
                ...(model.expectedProjectId
                  ? { expectedProjectId: model.expectedProjectId as ProjectId }
                  : {}),
              })
            )
          }
        >
          Mark pending reversal
        </Button>
      </Group>
    </>
  );
}

function SuggestedReversalActions({
  model,
}: {
  model: TransactionReversalModalController;
}) {
  return (
    <>
      <Textarea
        label={model.isException ? 'Review note' : 'Workflow note'}
        description="Used for exception updates, clearing the state, and optional match notes."
        value={model.commentBody}
        minRows={4}
        onChange={(event) => model.setCommentBody(event.currentTarget.value)}
      />

      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={600}>
            Suggested reversal matches
          </Text>
          {model.suggestionsLoading ? <Loader size="sm" /> : null}
        </Group>
        {model.suggestions.length > 0 ? (
          <ModalSelect
            label="Match candidate"
            data={model.suggestions.map((suggestion) => ({
              value: suggestion.txnId,
              label: `${suggestion.date} · ${formatCurrencyFromCents(
                suggestion.amountCents,
                model.currencyCode
              )} · ${suggestion.item}`,
            }))}
            value={model.selectedSuggestionTxnId}
            onChange={model.setSelectedSuggestionTxnId}
            searchable
          />
        ) : (
          <Text size="sm" c="dimmed">
            {model.suggestionsLoading
              ? 'Loading suggestions...'
              : 'No candidate refund transactions were found yet.'}
          </Text>
        )}
        {model.selectedSuggestion &&
        model.selectedSuggestionSummary &&
        model.sourceSummary ? (
          <TransactionReversalPairDetails
            sourceTxn={model.sourceSummary}
            counterpartTxn={model.selectedSuggestionSummary}
            {...(model.selectedSuggestion.evidence
              ? { evidence: model.selectedSuggestion.evidence }
              : {})}
            currencyCode={model.currencyCode}
            showAlternatives={false}
          />
        ) : null}
      </Stack>

      <Group justify="space-between" wrap="wrap">
        <Group gap="sm">
          {model.isException ? (
            <Button
              variant="light"
              color="gray"
              loading={model.submitting}
              disabled={!model.commentBody.trim()}
              onClick={() =>
                void model.submit({
                  action: 'clearException',
                  txnId: model.txn.id,
                  commentBody: model.commentBody,
                })
              }
            >
              Return to pending
            </Button>
          ) : (
            <>
              <Button
                variant="light"
                color="red"
                loading={model.submitting}
                disabled={!model.commentBody.trim()}
                onClick={() =>
                  void model.submit({
                    action: 'markException',
                    txnId: model.txn.id,
                    commentBody: model.commentBody,
                  })
                }
              >
                Mark exception
              </Button>
              <Button
                variant="light"
                color="gray"
                loading={model.submitting}
                disabled={!model.commentBody.trim()}
                onClick={() =>
                  void model.submit({
                    action: 'clearPending',
                    txnId: model.txn.id,
                    commentBody: model.commentBody,
                  })
                }
              >
                Cancel workflow
              </Button>
            </>
          )}
        </Group>
        <Button
          loading={model.submitting}
          disabled={!model.selectedSuggestionTxnId}
          onClick={() =>
            model.selectedSuggestionTxnId
              ? void model.submit(
                  omitUndefinedProperties({
                    action: 'match' as const,
                    txnId: model.txn.id,
                    reversalTxnId: model.selectedSuggestionTxnId as TxnId,
                    commentBody: model.commentBody.trim() || undefined,
                  })
                )
              : undefined
          }
        >
          Match selected reversal
        </Button>
      </Group>
    </>
  );
}

function ExceptionReversalActions({
  model,
}: {
  model: TransactionReversalModalController;
}) {
  return (
    <>
      <Textarea
        label="Review note (optional)"
        value={model.commentBody}
        autosize
        minRows={2}
        maxRows={4}
        onChange={(event) => model.setCommentBody(event.currentTarget.value)}
      />
      <Divider />
      <Group justify="flex-end" gap="sm" wrap="wrap">
        <Button
          variant="light"
          color="gray"
          loading={model.submitting}
          w={{ base: '100%', sm: 'auto' }}
          onClick={() =>
            void model.submit(
              omitUndefinedProperties({
                action: 'rejectSuggestedMatch' as const,
                txnId: model.txn.id,
                commentBody: model.commentBody.trim() || undefined,
              }),
              model.reviewQueue ? 'rejected' : undefined
            )
          }
        >
          {model.reviewQueue
            ? model.reviewQueue.remainingCount === 1
              ? 'Reject and finish'
              : 'Reject and next'
            : model.isAmbiguousSuggested
              ? 'Reject default match'
              : 'Reject suggestion'}
        </Button>
        <Button
          loading={model.submitting}
          w={{ base: '100%', sm: 'auto' }}
          onClick={() =>
            void model.submit(
              omitUndefinedProperties({
                action: 'approveSuggestedMatch' as const,
                txnId: model.txn.id,
                commentBody: model.commentBody.trim() || undefined,
              }),
              model.reviewQueue ? 'approved' : undefined
            )
          }
        >
          {model.reviewQueue
            ? model.reviewQueue.remainingCount === 1
              ? 'Approve and finish'
              : 'Approve and next'
            : model.isAmbiguousSuggested
              ? 'Approve default match'
              : 'Approve auto-match'}
        </Button>
      </Group>
    </>
  );
}

function MatchedReversalActions({
  model,
}: {
  model: TransactionReversalModalController;
}) {
  return (
    <>
      <Textarea
        label="Reason"
        description="Required. This note is written into both linked transaction threads."
        value={model.commentBody}
        minRows={4}
        onChange={(event) => model.setCommentBody(event.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button
          variant="light"
          color="red"
          loading={model.submitting}
          disabled={!model.commentBody.trim()}
          onClick={() =>
            void model.submit({
              action: 'unmatch',
              txnId: model.txn.id,
              commentBody: model.commentBody,
            })
          }
        >
          Remove match
        </Button>
      </Group>
    </>
  );
}

function TransactionReversalModalView({
  model,
}: {
  model: TransactionReversalModalController;
}) {
  return (
    <Modal
      opened={model.opened}
      onClose={model.onClose}
      title={model.modalTitle}
      centered
      size="xl"
      styles={{
        body: {
          maxHeight: 'calc(100dvh - 10rem)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        },
      }}
    >
      <Stack gap="md">
        {!model.isSuggested ? (
          <Group justify="space-between" align="flex-start">
            <Stack gap={2}>
              <Text fw={600}>{model.txn.item}</Text>
              <Text size="sm" c="dimmed">
                {model.txn.description || 'No description provided'}
              </Text>
              <Text size="sm" c="dimmed">
                {model.txn.date} ·{' '}
                {formatCurrencyFromCents(
                  model.txn.amountCents,
                  model.currencyCode
                )}
              </Text>
            </Stack>
            <Badge color={statusTone(model.txn)} variant="light">
              {statusLabel(model.txn)}
            </Badge>
          </Group>
        ) : null}

        {model.isSuggested && model.canManage ? (
          <ReversalPairSummary model={model} />
        ) : null}

        {model.sourceSummary && model.counterpartSummary ? (
          <TransactionReversalPairDetails
            sourceTxn={model.sourceSummary}
            counterpartTxn={model.counterpartSummary}
            {...(model.txn.reversal?.matchEvidence
              ? { evidence: model.txn.reversal.matchEvidence }
              : {})}
            currencyCode={model.currencyCode}
          />
        ) : null}

        {model.txn.reversal?.expectedProjectId ? (
          <Text size="sm" c="dimmed">
            Expected destination project:{' '}
            {model.expectedProjectName ?? model.txn.reversal.expectedProjectId}
          </Text>
        ) : null}

        {!model.txn.reversal && model.canManage ? (
          <PendingReversalActions model={model} />
        ) : null}

        {model.isPending && model.isSourceSide && model.canManage ? (
          <SuggestedReversalActions model={model} />
        ) : null}

        {model.isSuggested && model.canManage ? (
          <ExceptionReversalActions model={model} />
        ) : null}

        {model.isMatched && model.canManage ? (
          <MatchedReversalActions model={model} />
        ) : null}

        {model.txn.reversal && !model.canManage ? (
          <Alert color="blue" variant="light">
            This reversal workflow is read-only for your role. The pair details
            and recorded match evidence are shown above.
          </Alert>
        ) : null}

        {model.error ? <Alert color="red">{model.error}</Alert> : null}
      </Stack>
    </Modal>
  );
}

export default function TransactionReversalModal(
  props: Parameters<typeof useTransactionReversalModalController>[0]
) {
  const model = useTransactionReversalModalController(props);
  return <TransactionReversalModalView model={model} />;
}
