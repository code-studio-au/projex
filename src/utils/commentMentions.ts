import type { UserId } from '../types';

export type MentionRange = { start: number; end: number; query: string };

export type MentionUser = {
  id: UserId;
  name: string;
  email: string;
};

export function mentionUserLabel(user: Pick<MentionUser, 'name' | 'email'>) {
  return user.name || user.email;
}

export function activeMentionFromSelection(
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

export function filterMentionUsers<TUser extends MentionUser>(
  users: TUser[],
  query: string,
  limit = 6
): TUser[] {
  const normalizedQuery = query.trim().toLowerCase();
  return users
    .filter((user) => {
      if (!normalizedQuery) return true;
      return (
        user.name.toLowerCase().includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, limit);
}

export function insertMention(
  value: string,
  range: MentionRange,
  label: string
): { value: string; cursor: number } {
  const suffix = value.slice(range.end);
  const spacer = suffix.startsWith(' ') ? '' : ' ';
  const nextValue = `${value.slice(0, range.start)}@${label}${spacer}${suffix}`;
  return { value: nextValue, cursor: range.start + label.length + 2 };
}
