import { type KeyboardEvent, useMemo, useReducer, useRef } from 'react';
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
import { useMediaQuery } from '@mantine/hooks';
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

function commentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function commentExcerpt(value: string | undefined) {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No comment text';
  return normalized.length > 140
    ? `${normalized.slice(0, 140).trim()}...`
    : normalized;
}

type CommentDraftState = {
  body: string;
  assignedToUserId: UserId | null;
  mentionRange: MentionRange | null;
  activeMentionIndex: number;
  replyToCommentId: TxnCommentId | null;
  error: string | null;
};

type CommentDraftAction =
  | { type: 'reset' }
  | { type: 'startReply'; commentId: TxnCommentId }
  | { type: 'setBody'; body: string }
  | { type: 'setAssignee'; userId: UserId | null }
  | { type: 'syncMention'; range: MentionRange | null }
  | { type: 'moveMention'; index: number }
  | { type: 'selectMention'; body: string; userId: UserId }
  | { type: 'clearReply' }
  | { type: 'clearError' }
  | { type: 'fail'; message: string }
  | { type: 'submitSuccess' };

const initialCommentDraft: CommentDraftState = {
  body: '',
  assignedToUserId: null,
  mentionRange: null,
  activeMentionIndex: 0,
  replyToCommentId: null,
  error: null,
};

function commentDraftReducer(
  state: CommentDraftState,
  action: CommentDraftAction
): CommentDraftState {
  if (action.type === 'reset') return initialCommentDraft;
  if (action.type === 'startReply') {
    return {
      ...initialCommentDraft,
      replyToCommentId: action.commentId,
    };
  }
  if (action.type === 'setBody') return { ...state, body: action.body };
  if (action.type === 'setAssignee') {
    return { ...state, assignedToUserId: action.userId };
  }
  if (action.type === 'syncMention') {
    return {
      ...state,
      mentionRange: action.range,
      activeMentionIndex:
        action.range?.query === state.mentionRange?.query
          ? state.activeMentionIndex
          : 0,
    };
  }
  if (action.type === 'moveMention') {
    return { ...state, activeMentionIndex: action.index };
  }
  if (action.type === 'selectMention') {
    return {
      ...state,
      body: action.body,
      assignedToUserId: action.userId,
      mentionRange: null,
      activeMentionIndex: 0,
    };
  }
  if (action.type === 'clearReply') {
    return { ...state, replyToCommentId: null };
  }
  if (action.type === 'clearError') return { ...state, error: null };
  if (action.type === 'fail') return { ...state, error: action.message };
  return {
    ...state,
    body: '',
    assignedToUserId: null,
    mentionRange: null,
    activeMentionIndex: 0,
    replyToCommentId: null,
  };
}

function useTransactionCommentsModalController(props: {
  opened: boolean;
  txn: Txn | null;
  onClose: () => void;
}) {
  const { opened, txn, onClose } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, dispatchDraft] = useReducer(
    commentDraftReducer,
    initialCommentDraft
  );
  const {
    body,
    assignedToUserId,
    mentionRange,
    activeMentionIndex,
    replyToCommentId,
    error,
  } = draft;
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
    dispatchDraft({ type: 'reset' });
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
    dispatchDraft({ type: 'syncMention', range: nextRange });
  }

  function selectMentionedUser(user: (typeof assignableUsers)[number]) {
    const selectionStart = textareaRef.current?.selectionStart ?? body.length;
    const range =
      mentionRange ?? activeMentionFromSelection(body, selectionStart);
    if (!range) return;

    const next = insertMention(body, range, mentionUserLabel(user));
    dispatchDraft({
      type: 'selectMention',
      body: next.value,
      userId: user.id,
    });
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function handleCommentKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionRange) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      dispatchDraft({ type: 'syncMention', range: null });
      return;
    }

    if (mentionOptions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      dispatchDraft({
        type: 'moveMention',
        index: (activeMentionIndex + 1) % mentionOptions.length,
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      dispatchDraft({
        type: 'moveMention',
        index:
          (activeMentionIndex - 1 + mentionOptions.length) %
          mentionOptions.length,
      });
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const selectedUser =
        mentionOptions[selectedMentionIndex] ?? mentionOptions[0];
      if (selectedUser) selectMentionedUser(selectedUser);
    }
  }

  async function submit() {
    if (!txn || !body.trim()) return;
    try {
      dispatchDraft({ type: 'clearError' });
      await createComment.mutateAsync({
        txnId: txn.id,
        body,
        ...(replyToCommentId ? { parentCommentId: replyToCommentId } : {}),
        assignedToUserId: assignedToUserId ?? null,
      });
      dispatchDraft({ type: 'submitSuccess' });
    } catch (err) {
      dispatchDraft({
        type: 'fail',
        message: err instanceof Error ? err.message : 'Could not save comment',
      });
    }
  }

  async function setResolved(comment: TxnComment, resolved: boolean) {
    if (!txn) return;
    try {
      dispatchDraft({ type: 'clearError' });
      await updateComment.mutateAsync({ id: comment.id, resolved });
    } catch (err) {
      dispatchDraft({
        type: 'fail',
        message:
          err instanceof Error
            ? err.message
            : 'Could not update comment status',
      });
    }
  }

  async function assignComment(comment: TxnComment, value: string | null) {
    if (!txn) return;
    try {
      dispatchDraft({ type: 'clearError' });
      await updateComment.mutateAsync({
        id: comment.id,
        assignedToUserId: value ? asUserId(value) : null,
      });
    } catch (err) {
      dispatchDraft({
        type: 'fail',
        message:
          err instanceof Error
            ? err.message
            : 'Could not update comment assignee',
      });
    }
  }

  function renderComment(comment: TxnComment, nested = false) {
    const assignedUser = comment.assignedToUserId
      ? usersById.get(comment.assignedToUserId)
      : null;
    const replies = repliesByParent.get(comment.id) ?? [];
    const resolved = Boolean(comment.resolvedAt);

    return (
      <Paper
        key={comment.id}
        className={`${classes.commentCard}${comment.resolvedAt ? ` ${classes.commentCardResolved}` : ''}${nested ? ` ${classes.commentCardReply}` : ''}`}
      >
        <Stack gap="xs">
          <div className={classes.commentHeader}>
            <div className={classes.commentAuthorBlock}>
              <span className={classes.commentAvatar}>
                {commentInitials(comment.createdByName)}
              </span>
              <div className={classes.commentMeta}>
                <Group gap={6} wrap="wrap">
                  {nested ? <IconCornerDownRight size={14} /> : null}
                  <Text fw={650} size="sm">
                    {comment.createdByName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatTxnCommentDateTime(comment.createdAt)}
                  </Text>
                  {comment.resolvedAt ? (
                    <Badge size="xs" color="green" variant="light">
                      Closed
                    </Badge>
                  ) : null}
                </Group>
                {assignedUser && !resolved ? (
                  <div className={classes.commentAssignment}>
                    Assigned to {assignedUser.name || assignedUser.email}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={classes.commentActionRow}>
              <Select
                size="xs"
                placeholder={resolved ? 'Closed' : 'Assign'}
                data={userOptions}
                value={comment.assignedToUserId ?? null}
                clearable
                searchable
                disabled={updateComment.isPending || resolved}
                onChange={(value) => void assignComment(comment, value)}
                style={{ width: 170 }}
              />
              <Button
                size="xs"
                variant="subtle"
                disabled={updateComment.isPending}
                onClick={() => void setResolved(comment, !comment.resolvedAt)}
              >
                {comment.resolvedAt ? 'Reopen' : 'Close'}
              </Button>
              {!nested ? (
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => {
                    dispatchDraft({
                      type: 'startReply',
                      commentId: comment.id,
                    });
                  }}
                >
                  Reply
                </Button>
              ) : null}
            </div>
          </div>

          <Text size="sm" className={classes.commentBody}>
            {comment.body}
          </Text>

          {replies.length > 0 ? (
            <div className={classes.commentReplies}>
              {replies.map((reply) => renderComment(reply, true))}
            </div>
          ) : null}
        </Stack>
      </Paper>
    );
  }

  return {
    assignedToUserId,
    body,
    close,
    commentsQ,
    dispatchDraft,
    error,
    handleCommentKeyDown,
    isMobile,
    mentionOptions,
    mentionRange,
    onClose,
    opened,
    renderComment,
    replyTarget,
    selectMentionedUser,
    selectedMentionIndex,
    submit,
    submitting,
    syncMentionState,
    textareaRef,
    topLevelComments,
    txn,
    usersById,
  };
}

type TransactionCommentsModalController = ReturnType<
  typeof useTransactionCommentsModalController
>;

function TransactionCommentsModalView({
  model,
}: {
  model: TransactionCommentsModalController;
}) {
  const {
    assignedToUserId,
    body,
    close,
    commentsQ,
    dispatchDraft,
    error,
    handleCommentKeyDown,
    isMobile,
    mentionOptions,
    mentionRange,
    opened,
    renderComment,
    replyTarget,
    selectMentionedUser,
    selectedMentionIndex,
    submit,
    submitting,
    syncMentionState,
    textareaRef,
    topLevelComments,
    txn,
    usersById,
  } = model;

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Transaction comments"
      size="xl"
      centered
      styles={{
        body: {
          maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
          overflowY: 'auto',
        },
      }}
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

          <Stack gap="sm" className={classes.commentThread}>
            {commentsQ.isLoading ? (
              <Text className={classes.emptyState}>Loading comments...</Text>
            ) : topLevelComments.length > 0 ? (
              topLevelComments.map((comment) => renderComment(comment))
            ) : (
              <Text className={classes.emptyState}>
                No comments yet. Add the first note for this transaction.
              </Text>
            )}
          </Stack>

          <Paper className={classes.commentComposer}>
            <Stack gap="sm">
              {replyTarget ? (
                <div className={classes.commentComposerReply}>
                  <Stack gap={6}>
                    <Group justify="space-between" gap="sm">
                      <Text size="sm" c="dimmed">
                        Replying to {replyTarget.createdByName}
                      </Text>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => dispatchDraft({ type: 'clearReply' })}
                      >
                        Cancel reply
                      </Button>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {formatTxnCommentDateTime(replyTarget.createdAt)}
                    </Text>
                    <Text className={classes.commentReplyContext}>
                      {commentExcerpt(replyTarget.body)}
                    </Text>
                  </Stack>
                </div>
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
                    dispatchDraft({ type: 'setBody', body: nextBody });
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
                    window.setTimeout(() =>
                      dispatchDraft({ type: 'syncMention', range: null })
                    );
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
                    onClick={() =>
                      dispatchDraft({ type: 'setAssignee', userId: null })
                    }
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

export default function TransactionCommentsModal(
  props: Parameters<typeof useTransactionCommentsModalController>[0]
) {
  const model = useTransactionCommentsModalController(props);
  return <TransactionCommentsModalView model={model} />;
}
