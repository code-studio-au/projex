import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { IconCornerDownRight } from '@tabler/icons-react';

import type { Txn, TxnComment, TxnCommentId, UserId } from '../types';
import { asProjectId, asTxnId, asUserId } from '../types';
import { useUsersQuery } from '../queries/reference';
import {
  useCreateTransactionCommentMutation,
  useTransactionCommentsQuery,
  useUpdateTransactionCommentMutation,
} from '../queries/transactionComments';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function buildRepliesByParent(comments: TxnComment[]) {
  const repliesByParent = new Map<TxnCommentId, TxnComment[]>();
  for (const comment of comments) {
    if (!comment.parentCommentId) continue;
    const current = repliesByParent.get(comment.parentCommentId) ?? [];
    current.push(comment);
    repliesByParent.set(comment.parentCommentId, current);
  }
  return repliesByParent;
}

export default function TransactionCommentsModal(props: {
  opened: boolean;
  txn: Txn | null;
  onClose: () => void;
}) {
  const { opened, txn, onClose } = props;
  const [body, setBody] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState<UserId | null>(null);
  const [replyToCommentId, setReplyToCommentId] = useState<TxnCommentId | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const projectId = txn?.projectId ?? asProjectId('__no_project__');
  const txnId = txn?.id ?? asTxnId('__no_txn__');

  const commentsQ = useTransactionCommentsQuery(projectId, txnId, {
    enabled: opened && Boolean(txn),
  });
  const usersQ = useUsersQuery();
  const createComment = useCreateTransactionCommentMutation(projectId);
  const updateComment = useUpdateTransactionCommentMutation(projectId, txnId);

  function resetDraft() {
    setBody('');
    setAssignedToUserId(null);
    setReplyToCommentId(null);
    setError(null);
  }

  function close() {
    resetDraft();
    onClose();
  }

  const usersById = useMemo(
    () => new Map((usersQ.data ?? []).map((user) => [user.id, user])),
    [usersQ.data]
  );
  const userOptions = useMemo(
    () =>
      (usersQ.data ?? [])
        .filter((user) => !user.disabled)
        .map((user) => ({
          value: user.id,
          label: user.name || user.email,
        })),
    [usersQ.data]
  );
  const comments = commentsQ.data ?? [];
  const topLevelComments = comments.filter(
    (comment) => !comment.parentCommentId
  );
  const repliesByParent = buildRepliesByParent(comments);
  const replyTarget = replyToCommentId
    ? comments.find((comment) => comment.id === replyToCommentId)
    : null;
  const submitting = createComment.isPending;

  async function submit() {
    if (!txn || !body.trim()) return;
    try {
      setError(null);
      await createComment.mutateAsync({
        txnId: txn.id,
        body,
        parentCommentId: replyToCommentId ?? undefined,
        assignedToUserId,
      });
      setBody('');
      setAssignedToUserId(null);
      setReplyToCommentId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save comment');
    }
  }

  async function setResolved(comment: TxnComment, resolved: boolean) {
    if (!txn) return;
    try {
      setError(null);
      await updateComment.mutateAsync({ id: comment.id, resolved });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update comment status'
      );
    }
  }

  async function assignComment(comment: TxnComment, value: string | null) {
    if (!txn) return;
    try {
      setError(null);
      await updateComment.mutateAsync({
        id: comment.id,
        assignedToUserId: value ? asUserId(value) : null,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update comment assignee'
      );
    }
  }

  function renderComment(comment: TxnComment, nested = false) {
    const assignedUser = comment.assignedToUserId
      ? usersById.get(comment.assignedToUserId)
      : null;
    const replies = repliesByParent.get(comment.id) ?? [];

    return (
      <Paper key={comment.id} withBorder radius="md" p="sm">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={2}>
              <Group gap="xs" wrap="wrap">
                {nested ? <IconCornerDownRight size={14} /> : null}
                <Text fw={600} size="sm">
                  {comment.createdByName}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatDateTime(comment.createdAt)}
                </Text>
                {comment.resolvedAt ? (
                  <Badge size="xs" color="green" variant="light">
                    Resolved
                  </Badge>
                ) : null}
              </Group>
              {assignedUser ? (
                <Text size="xs" c="dimmed">
                  Assigned to {assignedUser.name || assignedUser.email}
                </Text>
              ) : null}
            </Stack>

            <Group gap="xs" align="flex-end">
              <Select
                size="xs"
                placeholder="Assign"
                data={userOptions}
                value={comment.assignedToUserId ?? null}
                clearable
                searchable
                disabled={updateComment.isPending}
                onChange={(value) => void assignComment(comment, value)}
                style={{ width: 170 }}
              />
              <Button
                size="xs"
                variant="subtle"
                disabled={updateComment.isPending}
                onClick={() => void setResolved(comment, !comment.resolvedAt)}
              >
                {comment.resolvedAt ? 'Reopen' : 'Resolve'}
              </Button>
              {!nested ? (
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => {
                    setReplyToCommentId(comment.id);
                    setBody('');
                  }}
                >
                  Reply
                </Button>
              ) : null}
            </Group>
          </Group>

          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {comment.body}
          </Text>

          {replies.length > 0 ? (
            <Stack gap="xs" pl="md">
              {replies.map((reply) => renderComment(reply, true))}
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    );
  }

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Transaction comments"
      size="xl"
      centered
    >
      {!txn ? null : (
        <Stack gap="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap={4}>
              <Group justify="space-between" gap="sm" wrap="wrap">
                <Text fw={700}>{txn.item}</Text>
                <Badge variant="light">{txn.date}</Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {txn.description}
              </Text>
            </Stack>
          </Paper>

          {error ? (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          ) : null}

          <Stack gap="sm">
            {commentsQ.isLoading ? (
              <Text size="sm" c="dimmed">
                Loading comments...
              </Text>
            ) : topLevelComments.length > 0 ? (
              topLevelComments.map((comment) => renderComment(comment))
            ) : (
              <Text size="sm" c="dimmed">
                No comments yet. Add the first note for this transaction.
              </Text>
            )}
          </Stack>

          <Paper withBorder radius="md" p="sm">
            <Stack gap="sm">
              {replyTarget ? (
                <Group justify="space-between" gap="sm">
                  <Text size="sm" c="dimmed">
                    Replying to {replyTarget.createdByName}
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => setReplyToCommentId(null)}
                  >
                    Cancel reply
                  </Button>
                </Group>
              ) : null}
              <Textarea
                label={replyTarget ? 'Reply' : 'New comment'}
                placeholder="Add a note, decision, or follow-up..."
                minRows={3}
                value={body}
                disabled={submitting}
                onChange={(event) => setBody(event.currentTarget.value)}
              />
              <Group justify="space-between" align="flex-end" wrap="wrap">
                <Select
                  label="Assign to"
                  placeholder="Optional"
                  data={userOptions}
                  value={assignedToUserId}
                  clearable
                  searchable
                  disabled={submitting}
                  onChange={(value) =>
                    setAssignedToUserId(value ? asUserId(value) : null)
                  }
                  style={{ width: 220 }}
                />
                <Button
                  disabled={!body.trim() || submitting}
                  loading={submitting}
                  onClick={() => void submit()}
                >
                  {replyTarget ? 'Add reply' : 'Add comment'}
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Stack>
      )}
    </Modal>
  );
}
