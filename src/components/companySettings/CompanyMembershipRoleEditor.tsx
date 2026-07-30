import { Alert, Button, Group, Select } from '@mantine/core';

import type { CompanyRole, UserId } from '../../types';
import { asUserId } from '../../types';

const companyRoleOptions: Array<{ value: CompanyRole; label: CompanyRole }> = [
  { value: 'member', label: 'member' },
  { value: 'management', label: 'management' },
  { value: 'executive', label: 'executive' },
  { value: 'admin', label: 'admin' },
];

function toCompanyRole(value: string | null): CompanyRole | null {
  return companyRoleOptions.some((option) => option.value === value)
    ? (value as CompanyRole)
    : null;
}

export default function CompanyMembershipRoleEditor(props: {
  userOptions: Array<{ value: UserId; label: string }>;
  selectedUserId: UserId | null;
  selectedRole: CompanyRole | null;
  wouldDemoteLastAdmin: boolean;
  isPending: boolean;
  onUserChange: (userId: UserId | null) => void;
  onRoleChange: (role: CompanyRole | null) => void;
  onSubmit: () => void;
}) {
  const {
    userOptions,
    selectedUserId,
    selectedRole,
    wouldDemoteLastAdmin,
    isPending,
    onUserChange,
    onRoleChange,
    onSubmit,
  } = props;

  return (
    <>
      <Group align="flex-end" wrap="wrap">
        <Select
          label="User"
          data={userOptions}
          value={selectedUserId}
          disabled={isPending}
          onChange={(value) => onUserChange(value ? asUserId(value) : null)}
          searchable
          style={{ width: '100%', maxWidth: 420 }}
        />
        <Select
          label="Company role"
          data={companyRoleOptions}
          value={selectedRole}
          disabled={isPending}
          onChange={(value) => onRoleChange(toCompanyRole(value))}
          style={{ width: '100%', maxWidth: 220 }}
        />
        <Button
          size="sm"
          variant="default"
          loading={isPending}
          disabled={
            isPending ||
            !selectedUserId ||
            !selectedRole ||
            wouldDemoteLastAdmin
          }
          onClick={onSubmit}
        >
          Set
        </Button>
      </Group>
      {wouldDemoteLastAdmin ? (
        <Alert color="yellow">
          This company must retain at least one admin. Assign another admin
          before changing this role.
        </Alert>
      ) : null}
    </>
  );
}
