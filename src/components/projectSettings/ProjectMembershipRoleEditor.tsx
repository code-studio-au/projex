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
import ModalSelect from '../ModalSelect';

function toProjectRole(value: string | null): ProjectRole | null {
  return projectRoleOptions.some((option) => option.value === value)
    ? (value as ProjectRole)
    : null;
}

export function ProjectMembershipAssignmentEditor(props: {
  userOptions: Array<{ value: UserId; label: string }>;
  selectedUserId: UserId | null;
  selectedRole: ProjectRole | null;
  canEdit: boolean;
  isPending: boolean;
  onUserChange: (userId: UserId | null) => void;
  onRoleChange: (role: ProjectRole | null) => void;
  onSubmit: () => Promise<void>;
}) {
  const {
    userOptions,
    selectedUserId,
    selectedRole,
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
  const selectedDefinition = selectedRole
    ? getProjectRoleDefinition(selectedRole)
    : null;

  return (
    <>
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
          label="Initial project role"
          data={projectRoleOptions}
          value={selectedRole}
          disabled={isPending || !selectedUserId}
          onChange={(value) => onRoleChange(toProjectRole(value))}
          style={{ width: '100%', maxWidth: 220 }}
        />
        <Button
          size="sm"
          variant="default"
          disabled={!canEdit || isPending || !selectedUserId || !selectedRole}
          onClick={() => setConfirmationOpen(true)}
        >
          Add Project User
        </Button>
      </Group>

      <Modal
        opened={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        title="Review project user access"
        centered
        closeOnClickOutside={!isPending}
        closeOnEscape={!isPending}
        withCloseButton={!isPending}
      >
        <Stack gap="md">
          <Text>
            Add <strong>{selectedUserLabel}</strong> as{' '}
            <strong>{selectedDefinition?.label}</strong>?
          </Text>
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
              disabled={!selectedUserId || !selectedRole}
              onClick={async () => {
                try {
                  await onSubmit();
                  setConfirmationOpen(false);
                } catch {
                  // The parent owns the mutation error and the confirmation
                  // remains open for a deliberate retry.
                }
              }}
            >
              Confirm and add user
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default function ProjectMembershipRoleEditor(props: {
  userLabel: string;
  currentRole: ProjectRole;
  isSelf: boolean;
  isOnlyOwner: boolean;
  hasCompanyWideProjectAccess: boolean;
  canEdit: boolean;
  isPending: boolean;
  onSubmit: (role: ProjectRole) => Promise<void>;
}) {
  const {
    userLabel,
    currentRole,
    isSelf,
    isOnlyOwner,
    hasCompanyWideProjectAccess,
    canEdit,
    isPending,
    onSubmit,
  } = props;
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ProjectRole>(currentRole);
  const hasChange = currentRole !== selectedRole;
  const wouldRemoveLastOwner =
    isOnlyOwner && currentRole === 'owner' && selectedRole !== 'owner';
  const wouldLoseSettingsAccess =
    isSelf &&
    !hasCompanyWideProjectAccess &&
    (currentRole === 'owner' || currentRole === 'lead') &&
    (selectedRole === 'member' || selectedRole === 'viewer');
  const selectedDefinition = getProjectRoleDefinition(selectedRole);

  function openConfirmation() {
    setSelectedRole(currentRole);
    setConfirmationOpen(true);
  }

  return (
    <>
      <Button
        size="xs"
        variant="default"
        aria-label={`Change role for ${userLabel}`}
        disabled={!canEdit || isPending}
        onClick={openConfirmation}
      >
        Change role
      </Button>

      {/* Release the document lock as closing starts so the exit animation
          cannot swallow the user's first parent-page scroll gesture. */}
      <Modal
        opened={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        title="Confirm project role change"
        centered
        lockScroll={confirmationOpen}
        closeOnClickOutside={!isPending}
        closeOnEscape={!isPending}
        withCloseButton={!isPending}
      >
        <Stack gap="md">
          <ModalSelect
            label="Project role"
            data={projectRoleOptions}
            value={selectedRole}
            disabled={isPending}
            onChange={(value) => {
              const role = toProjectRole(value);
              if (role) setSelectedRole(role);
            }}
          />
          <Text>
            Change <strong>{userLabel}</strong> from{' '}
            <strong>{getProjectRoleDefinition(currentRole).label}</strong> to{' '}
            <strong>{selectedDefinition.label}</strong>?
          </Text>
          {wouldLoseSettingsAccess ? (
            <Alert color="yellow" title="Project settings access will end">
              This is your own role. After confirmation, you will leave project
              settings because Members and Viewers cannot administer them.
            </Alert>
          ) : isSelf ? (
            <Alert color="yellow" title="This is your own role">
              Your project capabilities will update immediately.
            </Alert>
          ) : null}
          {wouldRemoveLastOwner ? (
            <Alert color="yellow">
              This project must retain at least one Owner. Assign another Owner
              before changing this role.
            </Alert>
          ) : null}
          <RolePermissionSummary definition={selectedDefinition} />
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
                  await onSubmit(selectedRole);
                  setConfirmationOpen(false);
                } catch {
                  // The parent owns the mutation error and the confirmation
                  // remains open for a deliberate retry.
                }
              }}
            >
              Confirm role change
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
