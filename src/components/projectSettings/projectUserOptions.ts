import type { UserId } from '../../types';

export function getAssignableProjectUserOptions(
  companyUsers: readonly {
    id: UserId;
    name: string;
    email: string;
  }[],
  projectMemberships: readonly { userId: UserId }[]
) {
  const assignedUserIds = new Set(
    projectMemberships.map((membership) => membership.userId)
  );

  return companyUsers.reduce<Array<{ value: UserId; label: string }>>(
    (options, user) => {
      if (!assignedUserIds.has(user.id)) {
        options.push({
          value: user.id,
          label: `${user.name} (${user.email})`,
        });
      }
      return options;
    },
    []
  );
}
