import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
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
import {
  activeMentionFromSelection,
  filterMentionUsers,
  insertMention,
  mentionUserLabel,
  type MentionRange,
} from '../utils/commentMentions';
import classes from '../styles/ui.module.css';

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
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
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
    setActiveMentionIndex(0);
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
        .sort((a, b) => mentionUserLabel(a).localeCompare(mentionUserLabel(b))),
    [projectMemberUserIds, usersQ.data]
  );
  const userOptions = useMemo(
    () =>
      assignableUsers.map((user) => ({
        value: user.id,
        label: mentionUserLabel(user),
      })),
    [assignableUsers]
  );
  const mentionOptions = useMemo(
    () =>
      !mentionRange
        ? []
        : filterMentionUsers(assignableUsers, mentionRange.query),
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
  const selectedMentionIndex =
    mentionOptions.length === 0
      ? 0
      : Math.min(activeMentionIndex, mentionOptions.length - 1);

  function syncMentionState(value: string, selectionStart: number) {
    const nextRange = activeMentionFromSelection(value, selectionStart);
    if (nextRange?.query !== mentionRange?.query) {
      setActiveMentionIndex(0);
    }
    setMentionRange(nextRange);
  }

  function selectMentionedUser(user: (typeof assignableUsers)[number]) {
    const selectionStart = textareaRef.current?.selectionStart ?? body.length;
    const range =
      mentionRange ?? activeMentionFromSelection(body, selectionStart);
    if (!range) return;

    const next = insertMention(body, range, mentionUserLabel(user));
    setBody(next.value);
    setAssignedToUserId(user.id);
    setMentionRange(null);
    setActiveMentionIndex(0);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function handleCommentKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionRange) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setMentionRange(null);
      setActiveMentionIndex(0);
      return;
    }

    if (mentionOptions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveMentionIndex((current) => (current + 1) % mentionOptions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveMentionIndex(
        (current) =>
          (current - 1 + mentionOptions.length) % mentionOptions.length
      );
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      selectMentionedUser(
        mentionOptions[selectedMentionIndex] ?? mentionOptions[0]
      );
    }
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
      setActiveMentionIndex(0);
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
                    setActiveMentionIndex(0);
                  }}
                >
                  Reply
                </Button>
              ) : null}
            </Group>
          </Group>

          <Text size="sm" className={classes.commentBody}>
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
        <Stack className={classes.modalStack}>
          <Paper withBorder radius="md" p="md" className={classes.modalCard}>
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
              <Text className={classes.emptyState}>
                Loading comments...
              </Text>
            ) : topLevelComments.length > 0 ? (
              topLevelComments.map((comment) => renderComment(comment))
            ) : (
              <Text className={classes.emptyState}>
                No comments yet. Add the first note for this transaction.
              </Text>
            )}
          </Stack>

          <Paper withBorder radius="md" p="sm" className={classes.subtleCard}>
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
                  onKeyDown={handleCommentKeyDown}
                  onBlur={() => {
                    window.setTimeout(() => setMentionRange(null));
                  }}
                  description="Type @ to pick a project member and assign the comment."
                />
                {mentionRange ? (
                  <Paper
                    role="listbox"
                    aria-label="Project members"
                    withBorder
                    shadow="md"
                    radius="md"
                    p={4}
                    className={classes.mentionMenu}
                  >
                    {mentionOptions.length > 0 ? (
                      <Stack gap={2}>
                        {mentionOptions.map((user, index) => (
                          <Button
                            key={user.id}
                            role="option"
                            aria-selected={index === selectedMentionIndex}
                            variant="subtle"
                            color={
                              index === selectedMentionIndex ? 'blue' : 'gray'
                            }
                            size="xs"
                            justify="flex-start"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectMentionedUser(user);
                            }}
                          >
                            {mentionUserLabel(user)}
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
                    {mentionUserLabel(
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
              <Group className={classes.footerRowBetween}>
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
