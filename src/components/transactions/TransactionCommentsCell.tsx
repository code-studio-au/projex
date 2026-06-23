import { Badge, Button, Collapse, Group, Paper, Stack, Text } from '@mantine/core';

import type { TxnComment, TxnCommentSummary } from '../../types';
import {
  buildTxnCommentRepliesByParent,
  formatTxnCommentDateTime,
} from '../../utils/transactionComments';
import classes from '../../styles/ui.module.css';

function commentExcerpt(value: string | undefined): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No comment text';
  return normalized.length > 96
    ? `${normalized.slice(0, 96).trim()}...`
    : normalized;
}

function commentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function CompactCommentCard(props: {
  comment: TxnComment;
  nested?: boolean;
  onActivate: () => void;
}) {
  const { comment, nested = false, onActivate } = props;

  return (
    <Paper
      className={`${classes.commentCard}${comment.resolvedAt ? ` ${classes.commentCardResolved}` : ''}${nested ? ` ${classes.commentCardReply}` : ''}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
    >
      <Stack gap={4}>
        <div className={classes.commentHeader}>
          <div className={classes.commentAuthorBlock}>
            <span className={classes.commentAvatar}>
              {commentInitials(comment.createdByName)}
            </span>
            <div className={classes.commentMeta}>
              <Group gap={6} wrap="wrap">
                <Text fw={650} size="xs">
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
            </div>
          </div>
        </div>
        <Text size="xs" lineClamp={3} style={{ whiteSpace: 'pre-wrap' }}>
          {comment.body}
        </Text>
      </Stack>
    </Paper>
  );
}

export default function TransactionCommentsCell(props: {
  summary?: TxnCommentSummary;
  expanded: boolean;
  comments: TxnComment[];
  commentsLoading: boolean;
  onOpenComments: () => void;
  onToggleExpanded: () => void;
}) {
  const {
    summary,
    expanded,
    comments,
    commentsLoading,
    onOpenComments,
    onToggleExpanded,
  } = props;

  if (!summary) {
    return (
      <Button
        size="xs"
        variant="subtle"
        color="gray"
        onClick={onOpenComments}
      >
        Add comment
      </Button>
    );
  }

  const threadResolved = summary.resolvedCount > 0;
  const repliesByParent = buildTxnCommentRepliesByParent(comments);
  const topLevelComments = comments.filter((comment) => !comment.parentCommentId);

  return (
    <Stack gap={6} style={{ minWidth: 0 }}>
      {expanded ? (
        <Collapse expanded={expanded}>
          <Stack gap="xs" mt={4} className={classes.commentInlineThread}>
            {commentsLoading ? (
              <Text size="xs" c="dimmed">
                Loading thread...
              </Text>
            ) : topLevelComments.length > 0 ? (
              topLevelComments.map((comment) => (
                <Stack key={comment.id} gap={4}>
                  <CompactCommentCard
                    comment={comment}
                    onActivate={onOpenComments}
                  />
                  {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                    <CompactCommentCard
                      key={reply.id}
                      comment={reply}
                      nested
                      onActivate={onOpenComments}
                    />
                  ))}
                </Stack>
              ))
            ) : (
              <Text size="xs" c="dimmed">
                No thread comments found.
              </Text>
            )}
          </Stack>
        </Collapse>
      ) : (
        <Paper
          className={classes.commentSummaryCard}
          onClick={onOpenComments}
        >
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={5} wrap="wrap">
              {threadResolved ? (
                <Badge size="xs" variant="light" color="green">
                  Resolved
                </Badge>
              ) : summary.unresolvedCount > 0 ? (
                <Badge size="xs" variant="light" color="yellow">
                  Unresolved
                </Badge>
              ) : null}
              {!threadResolved && summary.assignedToMeUnresolvedCount > 0 ? (
                <Badge size="xs" variant="light" color="orange">
                  Assigned to me
                </Badge>
              ) : null}
            </Group>
            <Group gap={8} align="flex-start" wrap="nowrap">
              <span className={classes.commentAvatar}>
                {commentInitials(summary.latestCommentAuthorName ?? 'Someone')}
              </span>
              <Stack gap={3} style={{ minWidth: 0, flex: 1 }}>
                <Text fw={650} size="xs">
                  {summary.latestCommentAuthorName ?? 'Someone'}
                </Text>
                {summary.latestCommentCreatedAt ? (
                  <Text size="xs" c="dimmed">
                    {formatTxnCommentDateTime(summary.latestCommentCreatedAt)}
                  </Text>
                ) : null}
                <Text
                  size="xs"
                  lineClamp={2}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {commentExcerpt(summary.latestCommentBody)}
                </Text>
              </Stack>
            </Group>
          </Stack>
        </Paper>
      )}
      <Button
        size="compact-xs"
        variant="subtle"
        color="gray"
        onClick={onToggleExpanded}
      >
        {expanded
          ? 'Hide thread'
          : `View thread (${summary.totalCount} comment${summary.totalCount === 1 ? '' : 's'})`}
      </Button>
    </Stack>
  );
}
