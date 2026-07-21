import { useEffect, useEffectEvent, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
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
import { formatCurrencyFromCents } from '../../utils/money';
import { firefoxSafeModalSelectProps } from '../modalSelectProps';

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
    return 'Matched reversal pair';
  if (txn.reversal?.status === 'auto_matched_ambiguous_pending_approval')
    return 'Defaulted auto-match awaiting approval';
  if (txn.reversal?.status === 'auto_matched_pending_approval')
    return 'Auto-match awaiting approval';
  if (txn.reversal?.status === 'pending_reversal') return 'Pending reversal';
  return 'No reversal workflow';
}

export default function TransactionReversalModal(props: {
  opened: boolean;
  txn: Txn;
  currencyCode: string;
  expectedProjectOptions: Array<{ value: ProjectId; label: string }>;
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

  async function submit(input: TxnReversalActionInput) {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmitAction(input);
      onClose();
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
      title="Pending reversal"
      centered
      size="lg"
    >
      <Stack gap="md">
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

        {txn.reversal?.counterpartTxnId ? (
          <Paper withBorder radius="md" p="sm">
            <Text size="sm" fw={600}>
              Linked transaction
            </Text>
            <Text size="sm" c="dimmed">
              {txn.reversal.side === 'source'
                ? `Matched reversal: ${txn.reversal.counterpartTxnId}`
                : `Source transaction: ${txn.reversal.counterpartTxnId}`}
            </Text>
          </Paper>
        ) : null}

        {!txn.reversal ? (
          <>
            <Select
              label="Expected destination project"
              placeholder="Optional"
              data={expectedProjectOptions}
              value={expectedProjectId}
              clearable
              searchable
              {...firefoxSafeModalSelectProps}
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

        {isPending && isSourceSide ? (
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
                  {...firefoxSafeModalSelectProps}
                />
              ) : (
                <Text size="sm" c="dimmed">
                  {suggestionsLoading
                    ? 'Loading suggestions...'
                    : 'No candidate refund transactions were found yet.'}
                </Text>
              )}
              {selectedSuggestion ? (
                <Paper withBorder radius="md" p="sm">
                  <Text size="sm" fw={600}>
                    {selectedSuggestion.item}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {selectedSuggestion.description ||
                      'No description provided'}
                  </Text>
                  {(selectedSuggestion.reasons ?? []).length > 0 ? (
                    <Text size="xs" c="dimmed" mt={4}>
                      {selectedSuggestion.reasons.join(' · ')}
                    </Text>
                  ) : null}
                </Paper>
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
                    Clear exception
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
                      Clear pending
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
                Match selected refund
              </Button>
            </Group>
          </>
        ) : null}

        {isSuggested ? (
          <>
            <Textarea
              label="Review note"
              description="Optional. Add context when approving or rejecting the auto-match."
              value={commentBody}
              minRows={4}
              onChange={(event) => setCommentBody(event.currentTarget.value)}
            />
            <Paper withBorder radius="md" p="sm">
              <Text size="sm" fw={600}>
                Auto-match review
              </Text>
              <Text size="sm" c="dimmed">
                {isAmbiguousSuggested
                  ? 'This Power BI reversal pair was default-matched because multiple possible reversals existed. Approve it to accept the default, or reject it to return the source transaction to pending reversal for manual matching.'
                  : 'This Power BI reversal pair was suggested automatically. Approve it to finalize the match, or reject it to return the source transaction to pending reversal for manual matching.'}
              </Text>
            </Paper>
            <Group justify="space-between" wrap="wrap">
              <Button
                variant="light"
                color="gray"
                loading={submitting}
                onClick={() =>
                  void submit({
                    action: 'rejectSuggestedMatch',
                    txnId: txn.id,
                    commentBody: commentBody.trim() || undefined,
                  })
                }
              >
                {isAmbiguousSuggested
                  ? 'Reject default match'
                  : 'Reject suggestion'}
              </Button>
              <Button
                loading={submitting}
                onClick={() =>
                  void submit({
                    action: 'approveSuggestedMatch',
                    txnId: txn.id,
                    commentBody: commentBody.trim() || undefined,
                  })
                }
              >
                {isAmbiguousSuggested
                  ? 'Approve default match'
                  : 'Approve auto-match'}
              </Button>
            </Group>
          </>
        ) : null}

        {isMatched ? (
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

        {error ? <Alert color="red">{error}</Alert> : null}
      </Stack>
    </Modal>
  );
}
