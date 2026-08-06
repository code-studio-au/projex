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

function mutationErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

type AssignmentDataState = 'loading' | 'ready' | 'error';

export function ProjectMembershipAssignmentEditor(props: {
  userOptions: Array<{ value: UserId; label: string }>;
  selectedUserId: UserId | null;
  selectedRole: ProjectRole | null;
  canEdit: boolean;
  isPending: boolean;
  dataState: AssignmentDataState;
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
    dataState,
    onUserChange,
    onRoleChange,
    onSubmit,
  } = props;
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const selectedUserOption = userOptions.find(
    (option) => option.value === selectedUserId
  );
  const selectedUserIsAssignable = Boolean(selectedUserOption);
  const selectedUserLabel = selectedUserOption?.label ?? 'this user';
  const selectedDefinition = selectedRole
    ? getProjectRoleDefinition(selectedRole)
    : null;
  const controlsDisabled = isPending || dataState !== 'ready';

  function closeConfirmation() {
    setMutationError(null);
    setConfirmationOpen(false);
  }

  return (
    <>
      <Group align="flex-end" wrap="wrap">
        <Select
          label="User (this company)"
          data={userOptions}
          value={selectedUserId}
          disabled={controlsDisabled}
          onChange={(value) => onUserChange(value ? asUserId(value) : null)}
          searchable
          style={{ width: '100%', maxWidth: 420 }}
        />
        <Select
          label="Initial project role"
          data={projectRoleOptions}
          value={selectedRole}
          disabled={controlsDisabled || !selectedUserIsAssignable}
          onChange={(value) => onRoleChange(toProjectRole(value))}
          style={{ width: '100%', maxWidth: 220 }}
        />
        <Button
          size="sm"
          variant="default"
          disabled={
            !canEdit ||
            controlsDisabled ||
            !selectedUserIsAssignable ||
            !selectedRole
          }
          onClick={() => {
            setMutationError(null);
            setConfirmationOpen(true);
          }}
        >
          Add Project User
        </Button>
      </Group>

      {dataState === 'loading' ? (
        <Text size="sm" c="dimmed">
          Loading company and project users...
        </Text>
      ) : dataState === 'error' ? (
        <Alert color="red" title="Could not load project users">
          Refresh the page before assigning project access.
        </Alert>
      ) : null}

      <Modal
        opened={confirmationOpen}
        onClose={closeConfirmation}
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
          {mutationError ? (
            <Alert color="red" title="Could not add project user">
              {mutationError}
            </Alert>
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={isPending}
              onClick={closeConfirmation}
            >
              Cancel
            </Button>
            <Button
              loading={isPending}
              disabled={
                dataState !== 'ready' ||
                !selectedUserIsAssignable ||
                !selectedRole
              }
              onClick={async () => {
                setMutationError(null);
                try {
                  await onSubmit();
                  closeConfirmation();
                } catch (error) {
                  setMutationError(
                    mutationErrorMessage(
                      error,
                      'The project user could not be added. Please try again.'
                    )
                  );
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
  const [mutationError, setMutationError] = useState<string | null>(null);
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
    setMutationError(null);
    setConfirmationOpen(true);
  }

  function closeConfirmation() {
    setMutationError(null);
    setConfirmationOpen(false);
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
        onClose={closeConfirmation}
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
              if (role) {
                setMutationError(null);
                setSelectedRole(role);
              }
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
          {mutationError ? (
            <Alert color="red" title="Could not change project role">
              {mutationError}
            </Alert>
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={isPending}
              onClick={closeConfirmation}
            >
              Cancel
            </Button>
            <Button
              loading={isPending}
              disabled={!hasChange || wouldRemoveLastOwner}
              onClick={async () => {
                setMutationError(null);
                try {
                  await onSubmit(selectedRole);
                  closeConfirmation();
                } catch (error) {
                  setMutationError(
                    mutationErrorMessage(
                      error,
                      'The project role could not be changed. Please try again.'
                    )
                  );
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
