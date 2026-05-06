import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
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
import { useProjectMembershipsQuery } from '../queries/memberships';
import { useUsersQuery } from '../queries/reference';
import {
  useCreateTransactionCommentMutation,
  useTransactionCommentsQuery,
  useUpdateTransactionCommentMutation,
} from '../queries/transactionComments';
import {
  buildTxnCommentRepliesByParent,
  formatTxnCommentDateTime,
} from '../utils/transactionComments';

type MentionRange = { start: number; end: number; query: string };

function activeMentionFromSelection(
  value: string,
  selectionStart: number
): MentionRange | null {
  const beforeCursor = value.slice(0, selectionStart);
  const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;

  return {
    start: beforeCursor.lastIndexOf('@'),
    end: selectionStart,
    query: match[1] ?? '',
  };
}

function userLabel(user: { name: string; email: string }): string {
  return user.name || user.email;
}

export default function TransactionCommentsModal(props: {
  opened: boolean;
  txn: Txn | null;
  onClose: () => void;
}) {
  const { opened, txn, onClose } = props;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [body, setBody] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState<UserId | null>(null);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [replyToCommentId, setReplyToCommentId] = useState<TxnCommentId | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const projectId = txn?.projectId ?? asProjectId('__no_project__');
  const txnId = txn?.id ?? asTxnId('__no_txn__');

  const commentsQ = useTransactionCommentsQuery(projectId, txnId, {
    enabled: opened && Boolean(txn),
  });
  const projectMembershipsQ = useProjectMembershipsQuery(projectId, {
    enabled: opened && Boolean(txn),
  });
  const usersQ = useUsersQuery();
  const createComment = useCreateTransactionCommentMutation(projectId);
  const updateComment = useUpdateTransactionCommentMutation(projectId, txnId);

  function resetDraft() {
    setBody('');
    setAssignedToUserId(null);
    setMentionRange(null);
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
  const projectMemberUserIds = useMemo(
    () =>
      new Set(
        (projectMembershipsQ.data ?? []).map((membership) => membership.userId)
      ),
    [projectMembershipsQ.data]
  );
  const assignableUsers = useMemo(
    () =>
      (usersQ.data ?? [])
        .filter((user) => !user.disabled && projectMemberUserIds.has(user.id))
        .sort((a, b) => userLabel(a).localeCompare(userLabel(b))),
    [projectMemberUserIds, usersQ.data]
  );
  const userOptions = useMemo(
    () =>
      assignableUsers.map((user) => ({
        value: user.id,
        label: userLabel(user),
      })),
    [assignableUsers]
  );
  const mentionOptions = useMemo(
    () =>
      !mentionRange
        ? []
        : assignableUsers
            .filter((user) => {
              const query = mentionRange.query.trim().toLowerCase();
              if (!query) return true;
              return (
                user.name.toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query)
              );
            })
            .slice(0, 6),
    [assignableUsers, mentionRange]
  );
  const comments = commentsQ.data ?? [];
  const topLevelComments = comments.filter(
    (comment) => !comment.parentCommentId
  );
  const repliesByParent = buildTxnCommentRepliesByParent(comments);
  const replyTarget = replyToCommentId
    ? comments.find((comment) => comment.id === replyToCommentId)
    : null;
  const submitting = createComment.isPending;

  function syncMentionState(value: string, selectionStart: number) {
    setMentionRange(activeMentionFromSelection(value, selectionStart));
  }

  function selectMentionedUser(user: (typeof assignableUsers)[number]) {
    const selectionStart = textareaRef.current?.selectionStart ?? body.length;
    const range =
      mentionRange ?? activeMentionFromSelection(body, selectionStart);
    if (!range) return;

    const label = userLabel(user);
    const nextBody = `${body.slice(0, range.start)}@${label} ${body.slice(range.end)}`;
    const nextCursor = range.start + label.length + 2;
    setBody(nextBody);
    setAssignedToUserId(user.id);
    setMentionRange(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function submit() {
    if (!txn || !body.trim()) return;
    try {
      setError(null);
      await createComment.mutateAsync({
        txnId: txn.id,
        body,
        parentCommentId: replyToCommentId ?? undefined,
        assignedToUserId: assignedToUserId ?? null,
      });
      setBody('');
      setAssignedToUserId(null);
      setMentionRange(null);
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
                  {formatTxnCommentDateTime(comment.createdAt)}
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
                    setAssignedToUserId(null);
                    setMentionRange(null);
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
              <Box pos="relative">
                <Textarea
                  ref={textareaRef}
                  label={replyTarget ? 'Reply' : 'New comment'}
                  placeholder="Add a note, decision, or type @ to assign someone..."
                  minRows={3}
                  value={body}
                  disabled={submitting}
                  onChange={(event) => {
                    const nextBody = event.currentTarget.value;
                    setBody(nextBody);
                    syncMentionState(
                      nextBody,
                      event.currentTarget.selectionStart
                    );
                  }}
                  onClick={(event) =>
                    syncMentionState(body, event.currentTarget.selectionStart)
                  }
                  onKeyUp={(event) =>
                    syncMentionState(body, event.currentTarget.selectionStart)
                  }
                  description="Type @ to pick a project member and assign the comment."
                />
                {mentionRange ? (
                  <Paper
                    withBorder
                    shadow="md"
                    radius="md"
                    p={4}
                    style={{
                      left: 10,
                      maxHeight: 220,
                      overflowY: 'auto',
                      position: 'absolute',
                      right: 10,
                      top: '100%',
                      zIndex: 20,
                    }}
                  >
                    {mentionOptions.length > 0 ? (
                      <Stack gap={2}>
                        {mentionOptions.map((user) => (
                          <Button
                            key={user.id}
                            variant="subtle"
                            color="gray"
                            size="xs"
                            justify="flex-start"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectMentionedUser(user);
                            }}
                          >
                            {userLabel(user)}
                          </Button>
                        ))}
                      </Stack>
                    ) : (
                      <Text size="xs" c="dimmed" p="xs">
                        No project members match that name.
                      </Text>
                    )}
                  </Paper>
                ) : null}
              </Box>
              {assignedToUserId ? (
                <Group gap="xs">
                  <Badge variant="light" color="orange">
                    Assigned to{' '}
                    {userLabel(
                      usersById.get(assignedToUserId) ?? {
                        name: '',
                        email: assignedToUserId,
                      }
                    )}
                  </Badge>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    disabled={submitting}
                    onClick={() => setAssignedToUserId(null)}
                  >
                    Clear assignment
                  </Button>
                </Group>
              ) : null}
              <Group justify="space-between" align="flex-end" wrap="wrap">
                <Text size="xs" c="dimmed">
                  Assignment is optional and limited to members of this project.
                </Text>
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
