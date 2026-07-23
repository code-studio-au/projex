import { useEffect, useEffectEvent, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';

import type {
  TxnReversalActionInput,
  TxnReversalActionResult,
  TxnReversalMatchSuggestion,
} from '../../api/types';
import type { ProjectId, Txn, TxnId } from '../../types';
import type { TxnReversalTxnSummary } from '../../types';
import { formatCurrencyFromCents } from '../../utils/money';
import { firefoxSafeModalSelectProps } from '../modalSelectProps';
import TransactionReversalPairDetails from './TransactionReversalPairDetails';

const containedModalSelectProps = {
  ...firefoxSafeModalSelectProps,
  // Keep wheel events inside the modal's scroll-lock boundary.
  comboboxProps: { withinPortal: false },
} as const;

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
  return {
    txnId: txn.id,
    externalId: txn.externalId,
    date: txn.date,
    item: txn.item,
    description: txn.description,
    amountCents: txn.amountCents,
    sourceType: txn.importSourceType,
  };
}

export default function TransactionReversalModal(props: {
  opened: boolean;
  txn: Txn;
  currencyCode: string;
  expectedProjectOptions: Array<{ value: ProjectId; label: string }>;
  canManage: boolean;
  reviewQueue?: ReversalReviewQueueControls;
  onClose: () => void;
  onLoadSuggestions: (txnId: TxnId) => Promise<TxnReversalMatchSuggestion[]>;
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
    onLoadSuggestions,
    onSubmitAction,
  } = props;
  const [commentBody, setCommentBody] = useState('');
  const [expectedProjectId, setExpectedProjectId] = useState<string | null>(
    txn.reversal?.expectedProjectId ?? null
  );
  const [selectedSuggestionTxnId, setSelectedSuggestionTxnId] = useState<
    string | null
  >(null);
  const [suggestions, setSuggestions] = useState<TxnReversalMatchSuggestion[]>(
    []
  );
  const shouldLoadSuggestions =
    txn.reversal?.side !== 'reversal' &&
    (txn.reversal?.status === 'pending_reversal' ||
      txn.reversal?.status === 'reversal_exception');
  const [suggestionsLoading, setSuggestionsLoading] = useState(
    shouldLoadSuggestions
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSuggestions = useEffectEvent((txnId: TxnId) =>
    onLoadSuggestions(txnId)
  );

  useEffect(() => {
    if (!opened || !shouldLoadSuggestions) return;
    let cancelled = false;

    void loadSuggestions(txn.id)
      .then((next) => {
        if (cancelled) return;
        setSuggestions(next);
        setSelectedSuggestionTxnId(next[0]?.txnId ?? null);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Could not load reversal suggestions.'
        );
        setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setSuggestionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [opened, shouldLoadSuggestions, txn.id]);

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
    ? {
        txnId: selectedSuggestion.txnId,
        externalId: selectedSuggestion.externalId,
        date: selectedSuggestion.date,
        item: selectedSuggestion.item,
        description: selectedSuggestion.description,
        amountCents: selectedSuggestion.amountCents,
      }
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
    setError(null);
    try {
      await onSubmitAction({
        ...input,
        expectedReversalVersion: txn.reversal?.version,
      });
      if (queueOutcome && reviewQueue) {
        reviewQueue.onResolved(queueOutcome);
      } else {
        onClose();
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not update reversal workflow.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={modalTitle}
      centered
      size="xl"
      lockScroll={false}
      styles={{
        body: {
          maxHeight: 'calc(100dvh - 10rem)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        },
      }}
    >
      <Stack gap="md">
        {!isSuggested ? (
          <Group justify="space-between" align="flex-start">
            <Stack gap={2}>
              <Text fw={600}>{txn.item}</Text>
              <Text size="sm" c="dimmed">
                {txn.description || 'No description provided'}
              </Text>
              <Text size="sm" c="dimmed">
                {txn.date} ·{' '}
                {formatCurrencyFromCents(txn.amountCents, currencyCode)}
              </Text>
            </Stack>
            <Badge color={statusTone(txn)} variant="light">
              {statusLabel(txn)}
            </Badge>
          </Group>
        ) : null}

        {isSuggested && canManage ? (
          <Paper withBorder radius="md" p="md">
            <Stack gap={reviewQueue ? 'sm' : 2}>
              <Stack gap={2}>
                <Text size="sm" fw={650}>
                  {isAmbiguousSuggested
                    ? 'Default match selected'
                    : 'Recommended match'}
                </Text>
                <Text size="sm" c="dimmed">
                  {isAmbiguousSuggested
                    ? 'Multiple valid pairings existed, so Projex selected a deterministic default. Verify both transactions and the evidence before deciding.'
                    : 'Projex recommended this pair automatically. Verify both transactions and the evidence before deciding.'}
                </Text>
              </Stack>
              {reviewQueue ? (
                <>
                  <Divider />
                  <Group justify="space-between" gap="sm" wrap="wrap">
                    <Badge color="gray" variant="light">
                      Match {reviewQueue.currentPosition} of{' '}
                      {reviewQueue.totalCount}
                    </Badge>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="default"
                        disabled={!reviewQueue.hasPrevious || submitting}
                        onClick={reviewQueue.onPrevious}
                      >
                        Previous
                      </Button>
                      <Button
                        size="xs"
                        variant="default"
                        disabled={!reviewQueue.hasNext || submitting}
                        onClick={reviewQueue.onNext}
                      >
                        Next
                      </Button>
                    </Group>
                  </Group>
                </>
              ) : null}
            </Stack>
          </Paper>
        ) : null}

        {sourceSummary && counterpartSummary ? (
          <TransactionReversalPairDetails
            sourceTxn={sourceSummary}
            counterpartTxn={counterpartSummary}
            evidence={txn.reversal?.matchEvidence}
            currencyCode={currencyCode}
          />
        ) : null}

        {txn.reversal?.expectedProjectId ? (
          <Text size="sm" c="dimmed">
            Expected destination project:{' '}
            {expectedProjectName ?? txn.reversal.expectedProjectId}
          </Text>
        ) : null}

        {!txn.reversal && canManage ? (
          <>
            <Select
              label="Expected destination project"
              placeholder="Optional"
              data={expectedProjectOptions}
              value={expectedProjectId}
              clearable
              searchable
              {...containedModalSelectProps}
              onChange={setExpectedProjectId}
            />
            <Textarea
              label="Comment"
              description="Required. This note is written into the transaction comment thread."
              value={commentBody}
              minRows={4}
              onChange={(event) => setCommentBody(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                loading={submitting}
                disabled={!commentBody.trim()}
                onClick={() =>
                  void submit({
                    action: 'markPending',
                    txnId: txn.id,
                    commentBody,
                    expectedProjectId:
                      (expectedProjectId as ProjectId | null) ?? undefined,
                  })
                }
              >
                Mark pending reversal
              </Button>
            </Group>
          </>
        ) : null}

        {isPending && isSourceSide && canManage ? (
          <>
            <Textarea
              label={isException ? 'Review note' : 'Workflow note'}
              description="Used for exception updates, clearing the state, and optional match notes."
              value={commentBody}
              minRows={4}
              onChange={(event) => setCommentBody(event.currentTarget.value)}
            />

            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text size="sm" fw={600}>
                  Suggested reversal matches
                </Text>
                {suggestionsLoading ? <Loader size="sm" /> : null}
              </Group>
              {suggestions.length > 0 ? (
                <Select
                  label="Match candidate"
                  data={suggestions.map((suggestion) => ({
                    value: suggestion.txnId,
                    label: `${suggestion.date} · ${formatCurrencyFromCents(
                      suggestion.amountCents,
                      currencyCode
                    )} · ${suggestion.item}`,
                  }))}
                  value={selectedSuggestionTxnId}
                  onChange={setSelectedSuggestionTxnId}
                  searchable
                  {...containedModalSelectProps}
                />
              ) : (
                <Text size="sm" c="dimmed">
                  {suggestionsLoading
                    ? 'Loading suggestions...'
                    : 'No candidate refund transactions were found yet.'}
                </Text>
              )}
              {selectedSuggestion &&
              selectedSuggestionSummary &&
              sourceSummary ? (
                <TransactionReversalPairDetails
                  sourceTxn={sourceSummary}
                  counterpartTxn={selectedSuggestionSummary}
                  evidence={selectedSuggestion.evidence}
                  currencyCode={currencyCode}
                  showAlternatives={false}
                />
              ) : null}
            </Stack>

            <Group justify="space-between" wrap="wrap">
              <Group gap="sm">
                {isException ? (
                  <Button
                    variant="light"
                    color="gray"
                    loading={submitting}
                    disabled={!commentBody.trim()}
                    onClick={() =>
                      void submit({
                        action: 'clearException',
                        txnId: txn.id,
                        commentBody,
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
                      loading={submitting}
                      disabled={!commentBody.trim()}
                      onClick={() =>
                        void submit({
                          action: 'markException',
                          txnId: txn.id,
                          commentBody,
                        })
                      }
                    >
                      Mark exception
                    </Button>
                    <Button
                      variant="light"
                      color="gray"
                      loading={submitting}
                      disabled={!commentBody.trim()}
                      onClick={() =>
                        void submit({
                          action: 'clearPending',
                          txnId: txn.id,
                          commentBody,
                        })
                      }
                    >
                      Cancel workflow
                    </Button>
                  </>
                )}
              </Group>
              <Button
                loading={submitting}
                disabled={!selectedSuggestionTxnId}
                onClick={() =>
                  selectedSuggestionTxnId
                    ? void submit({
                        action: 'match',
                        txnId: txn.id,
                        reversalTxnId: selectedSuggestionTxnId as TxnId,
                        commentBody: commentBody.trim() || undefined,
                      })
                    : undefined
                }
              >
                Match selected reversal
              </Button>
            </Group>
          </>
        ) : null}

        {isSuggested && canManage ? (
          <>
            <Textarea
              label="Review note (optional)"
              value={commentBody}
              autosize
              minRows={2}
              maxRows={4}
              onChange={(event) => setCommentBody(event.currentTarget.value)}
            />
            <Divider />
            <Group justify="flex-end" gap="sm" wrap="wrap">
              <Button
                variant="light"
                color="gray"
                loading={submitting}
                w={{ base: '100%', sm: 'auto' }}
                onClick={() =>
                  void submit(
                    {
                      action: 'rejectSuggestedMatch',
                      txnId: txn.id,
                      commentBody: commentBody.trim() || undefined,
                    },
                    reviewQueue ? 'rejected' : undefined
                  )
                }
              >
                {reviewQueue
                  ? reviewQueue.remainingCount === 1
                    ? 'Reject and finish'
                    : 'Reject and next'
                  : isAmbiguousSuggested
                    ? 'Reject default match'
                    : 'Reject suggestion'}
              </Button>
              <Button
                loading={submitting}
                w={{ base: '100%', sm: 'auto' }}
                onClick={() =>
                  void submit(
                    {
                      action: 'approveSuggestedMatch',
                      txnId: txn.id,
                      commentBody: commentBody.trim() || undefined,
                    },
                    reviewQueue ? 'approved' : undefined
                  )
                }
              >
                {reviewQueue
                  ? reviewQueue.remainingCount === 1
                    ? 'Approve and finish'
                    : 'Approve and next'
                  : isAmbiguousSuggested
                    ? 'Approve default match'
                    : 'Approve auto-match'}
              </Button>
            </Group>
          </>
        ) : null}

        {isMatched && canManage ? (
          <>
            <Textarea
              label="Reason"
              description="Required. This note is written into both linked transaction threads."
              value={commentBody}
              minRows={4}
              onChange={(event) => setCommentBody(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                variant="light"
                color="red"
                loading={submitting}
                disabled={!commentBody.trim()}
                onClick={() =>
                  void submit({
                    action: 'unmatch',
                    txnId: txn.id,
                    commentBody,
                  })
                }
              >
                Remove match
              </Button>
            </Group>
          </>
        ) : null}

        {txn.reversal && !canManage ? (
          <Alert color="blue" variant="light">
            This reversal workflow is read-only for your role. The pair details
            and recorded match evidence are shown above.
          </Alert>
        ) : null}

        {error ? <Alert color="red">{error}</Alert> : null}
      </Stack>
    </Modal>
  );
}
