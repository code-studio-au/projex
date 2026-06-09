import type { TxnComment, TxnCommentId } from '../types';
import { formatUtcDate } from './dateTime';

export function formatTxnCommentDateTime(value: string): string {
  return formatUtcDate(value);
}

export function buildTxnCommentRepliesByParent(
  comments: TxnComment[]
): Map<TxnCommentId, TxnComment[]> {
  const repliesByParent = new Map<TxnCommentId, TxnComment[]>();
  for (const comment of comments) {
    if (!comment.parentCommentId) continue;
    const current = repliesByParent.get(comment.parentCommentId) ?? [];
    current.push(comment);
    repliesByParent.set(comment.parentCommentId, current);
  }
  return repliesByParent;
}
