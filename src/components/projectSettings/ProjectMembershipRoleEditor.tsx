import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from '@mantine/core';

import {
  getProjectRoleDefinition,
  projectRoleOptions,
} from '../../access/roleDefinitions';
import type { ProjectRole, UserId } from '../../types';
import { asUserId } from '../../types';
import RolePermissionSummary from '../access/RolePermissionSummary';

function toProjectRole(value: string | null): ProjectRole | null {
  return projectRoleOptions.some((option) => option.value === value)
    ? (value as ProjectRole)
    : null;
}

export default function ProjectMembershipRoleEditor(props: {
  userOptions: Array<{ value: UserId; label: string }>;
  selectedUserId: UserId | null;
  currentRole: ProjectRole | null;
  selectedRole: ProjectRole | null;
  selectedUserIsSelf: boolean;
  wouldRemoveLastOwner: boolean;
  wouldLoseSettingsAccess: boolean;
  canEdit: boolean;
  isPending: boolean;
  onUserChange: (userId: UserId | null) => void;
  onRoleChange: (role: ProjectRole | null) => void;
  onSubmit: () => Promise<void>;
}) {
  const {
    userOptions,
    selectedUserId,
    currentRole,
    selectedRole,
    selectedUserIsSelf,
    wouldRemoveLastOwner,
    wouldLoseSettingsAccess,
    canEdit,
    isPending,
    onUserChange,
    onRoleChange,
    onSubmit,
  } = props;
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const selectedUserLabel =
    userOptions.find((option) => option.value === selectedUserId)?.label ??
    'this user';
  const hasChange =
    !!selectedUserId && !!selectedRole && currentRole !== selectedRole;
  const selectedDefinition = selectedRole
    ? getProjectRoleDefinition(selectedRole)
    : null;

  return (
    <>
      <Stack gap="sm">
        <Group align="flex-end" wrap="wrap">
          <Select
            label="User (this company)"
            data={userOptions}
            value={selectedUserId}
            disabled={isPending}
            onChange={(value) => onUserChange(value ? asUserId(value) : null)}
            searchable
            style={{ width: '100%', maxWidth: 420 }}
          />
          <Select
            label="Project role"
            data={projectRoleOptions}
            value={selectedRole}
            disabled={isPending || !selectedUserId}
            onChange={(value) => onRoleChange(toProjectRole(value))}
            style={{ width: '100%', maxWidth: 220 }}
          />
          <Button
            size="sm"
            variant="default"
            disabled={
              !canEdit || isPending || !hasChange || wouldRemoveLastOwner
            }
            loading={isPending}
            onClick={() => setConfirmationOpen(true)}
          >
            {currentRole ? 'Review role change' : 'Review assignment'}
          </Button>
        </Group>
        {selectedDefinition ? (
          <RolePermissionSummary definition={selectedDefinition} />
        ) : null}
        {selectedUserId && !hasChange && !wouldRemoveLastOwner ? (
          <Text size="xs" c="dimmed">
            {currentRole
              ? 'This user already has the selected role. No database write will occur.'
              : 'Select a project role to review this assignment.'}
          </Text>
        ) : null}
        {wouldRemoveLastOwner ? (
          <Alert color="yellow">
            This project must retain at least one Owner. Assign another Owner
            before changing this role.
          </Alert>
        ) : null}
      </Stack>

      <Modal
        opened={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        title={
          currentRole
            ? 'Confirm project role change'
            : 'Confirm project assignment'
        }
        centered
        closeOnClickOutside={!isPending}
        closeOnEscape={!isPending}
        withCloseButton={!isPending}
      >
        <Stack gap="md">
          <Text>
            {currentRole ? 'Change' : 'Assign'}{' '}
            <strong>{selectedUserLabel}</strong>
            {currentRole ? (
              <>
                {' '}
                from{' '}
                <strong>{getProjectRoleDefinition(currentRole).label}</strong>
              </>
            ) : null}{' '}
            to <strong>{selectedDefinition?.label}</strong>?
          </Text>
          {wouldLoseSettingsAccess ? (
            <Alert color="yellow" title="Project settings access will end">
              This is your own role. After confirmation, you will leave project
              settings because Members and Viewers cannot administer them.
            </Alert>
          ) : selectedUserIsSelf ? (
            <Alert color="yellow" title="This is your own role">
              Your project capabilities will update immediately.
            </Alert>
          ) : null}
          {selectedDefinition ? (
            <RolePermissionSummary definition={selectedDefinition} />
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={isPending}
              onClick={() => setConfirmationOpen(false)}
            >
              Cancel
            </Button>
            <Button
              loading={isPending}
              disabled={!hasChange || wouldRemoveLastOwner}
              onClick={async () => {
                try {
                  await onSubmit();
                  setConfirmationOpen(false);
                } catch {
                  // The parent owns the visible error and the confirmation
                  // remains open for a deliberate retry.
                }
              }}
            >
              {currentRole ? 'Confirm role change' : 'Confirm assignment'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
