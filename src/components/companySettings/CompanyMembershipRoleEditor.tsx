import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import {
  companyRoleOptions,
  getCompanyRoleDefinition,
} from '../../access/roleDefinitions';
import classes from '../../styles/ui.module.css';
import type { CompanyRole } from '../../types';
import RolePermissionSummary from '../access/RolePermissionSummary';
import ModalSelect from '../ModalSelect';

function toCompanyRole(value: string | null): CompanyRole | null {
  return companyRoleOptions.some((option) => option.value === value)
    ? (value as CompanyRole)
    : null;
}

export default function CompanyMembershipRoleEditor(props: {
  userLabel: string;
  currentRole: CompanyRole;
  isSelf: boolean;
  isOnlyAdmin: boolean;
  canEdit: boolean;
  isPending: boolean;
  onSubmit: (role: CompanyRole) => Promise<void>;
}) {
  const {
    userLabel,
    currentRole,
    isSelf,
    isOnlyAdmin,
    canEdit,
    isPending,
    onSubmit,
  } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<CompanyRole>(currentRole);
  const hasChange = currentRole !== selectedRole;
  const wouldDemoteLastAdmin =
    isOnlyAdmin && currentRole === 'admin' && selectedRole !== 'admin';
  const selectedDefinition = selectedRole
    ? getCompanyRoleDefinition(selectedRole)
    : null;

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

      <Modal
        opened={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        title="Confirm company role change"
        fullScreen={isMobile}
        centered={!isMobile}
        closeOnClickOutside={!isPending}
        closeOnEscape={!isPending}
        withCloseButton={!isPending}
      >
        <Stack gap="md">
          <ModalSelect
            label="Company role"
            data={companyRoleOptions}
            value={selectedRole}
            disabled={isPending}
            onChange={(value) => {
              const role = toCompanyRole(value);
              if (role) setSelectedRole(role);
            }}
          />
          <Text>
            Change <strong>{userLabel}</strong> from{' '}
            <strong>{getCompanyRoleDefinition(currentRole).label}</strong> to{' '}
            <strong>{selectedDefinition?.label}</strong>?
          </Text>
          {isSelf ? (
            <Alert color="yellow" title="This is your own role">
              Your available company and project administration controls will
              update immediately after this change.
            </Alert>
          ) : null}
          {wouldDemoteLastAdmin ? (
            <Alert color="yellow">
              This company must retain at least one Admin. Assign another Admin
              before changing this role.
            </Alert>
          ) : null}
          {selectedDefinition ? (
            <RolePermissionSummary definition={selectedDefinition} />
          ) : null}
          <Group className={classes.footerRow}>
            <Button
              variant="default"
              fullWidth={isMobile}
              disabled={isPending}
              onClick={() => setConfirmationOpen(false)}
            >
              Cancel
            </Button>
            <Button
              fullWidth={isMobile}
              loading={isPending}
              disabled={!hasChange || wouldDemoteLastAdmin}
              onClick={async () => {
                try {
                  await onSubmit(selectedRole);
                  setConfirmationOpen(false);
                } catch {
                  // The parent renders the mutation error and the dialog stays
                  // open so the administrator can review or retry safely.
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
