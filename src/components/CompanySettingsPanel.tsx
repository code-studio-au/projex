import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Divider,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyId, CompanyRole, UserId } from '../types';
import { asUserId } from '../types';

import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { getCompanyUsers } from '../store/access';
import { useUsersQuery, useCompanyQuery } from '../queries/reference';
import {
  useCompanyMembershipsQuery,
  useDeleteCompanyMembershipMutation,
  useUpsertCompanyMembershipMutation,
} from '../queries/memberships';
import {
  useCreateUserInCompanyMutation,
  useSendCompanyUserInviteEmailMutation,
} from '../queries/admin';
import { isServerAuthMode } from '../routes/-authMode';
import {
  useCompanyDefaultCategoriesQuery,
  useCompanyDefaultSubCategoriesQuery,
} from '../queries/taxonomy';
import CompanyDefaultTaxonomyModal from './CompanyDefaultTaxonomyModal';

export default function CompanySettingsPanel(props: { companyId: CompanyId }) {
  const { companyId } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');

  const access = useCompanyAccess(companyId);
  const company = useCompanyQuery(companyId);
  const usersQ = useUsersQuery();
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);

  const createUser = useCreateUserInCompanyMutation(companyId);
  const sendInviteEmail = useSendCompanyUserInviteEmailMutation(companyId);
  const removeCompanyMember = useDeleteCompanyMembershipMutation(companyId);
  const upsertCompanyMembership = useUpsertCompanyMembershipMutation(companyId);

  // Permissions are evaluated via `access.can(...)` so that global superadmin
  // works across companies even without explicit membership.
  const currentCompanyRole = access.companyRole;
  const canAddCompanyUsers = access.can('company:manage_members');
  const canEditCompanyDefaults = access.can('company:edit');
  const defaultCategoriesQ = useCompanyDefaultCategoriesQuery(companyId);
  const defaultSubCategoriesQ = useCompanyDefaultSubCategoriesQuery(companyId);

  const companyUsers = useMemo(() => {
    return getCompanyUsers(
      companyId,
      usersQ.data ?? [],
      companyMembershipsQ.data ?? []
    );
  }, [companyId, usersQ.data, companyMembershipsQ.data]);

  const userOptions = useMemo(
    () =>
      companyUsers.map((u) => ({
        value: u.id,
        label: `${u.name} (${u.email})`,
      })),
    [companyUsers]
  );


  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<CompanyRole | null>('member');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [roleUserId, setRoleUserId] = useState<UserId | null>(null);
  const [defaultsModalOpen, setDefaultsModalOpen] = useState(false);

  // Derive a sensible default selection without synchronously setting state in an effect.
  // This avoids cascading renders and keeps `react-hooks/set-state-in-effect` happy.
  const effectiveRoleUserId: UserId | null =
    roleUserId ?? (userOptions[0]?.value ? asUserId(userOptions[0].value) : null);

  const [membershipCompanyRole, setMembershipCompanyRole] =
    useState<CompanyRole | null>('member');

  const companyRoleValues = ['member', 'management', 'executive', 'admin'] as const;
  const toCompanyRole = (v: string | null): CompanyRole | null => {
    if (!v) return null;
    return (companyRoleValues as readonly string[]).includes(v) ? (v as CompanyRole) : null;
  };

  const highestRoleBadge = (
    <Badge variant="light">
      Your company role: {currentCompanyRole}
      {access.isSuperadmin ? ' (global superadmin)' : ''}
    </Badge>
  );

  const membershipRows = useMemo(
    () => {
      const adminCount = (companyMembershipsQ.data ?? []).filter((m) => m.role === 'admin').length;
      return (companyMembershipsQ.data ?? []).map((m) => {
        const u = (usersQ.data ?? []).find((x) => x.id === m.userId);
        return {
          key: `${m.companyId}:${m.userId}`,
          userName: u?.name ?? String(m.userId),
          userEmail: u?.email ?? '',
          userId: m.userId,
          role: m.role,
          isSelf: m.userId === access.userId,
          isOnlyAdmin: m.role === 'admin' && adminCount <= 1,
        };
      });
    },
    [access.userId, companyMembershipsQ.data, usersQ.data]
  );

  const selectedMembership = useMemo(
    () => membershipRows.find((row) => row.userId === effectiveRoleUserId) ?? null,
    [effectiveRoleUserId, membershipRows]
  );
  const wouldDemoteLastAdmin =
    !!selectedMembership &&
    selectedMembership.role === 'admin' &&
    selectedMembership.isOnlyAdmin &&
    membershipCompanyRole !== 'admin';

  const membershipColumns = useMemo<MRT_ColumnDef<(typeof membershipRows)[number]>[]>(
    () => [
      {
        accessorKey: 'userName',
        header: 'User',
        Cell: ({ row }) => (
          <Stack gap={2}>
            <Text fw={600}>{row.original.userName}</Text>
            {row.original.userEmail ? (
              <Text size="xs" c="dimmed">
                {row.original.userEmail}
              </Text>
            ) : null}
          </Stack>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        Cell: ({ row }) => <Badge variant="light">{row.original.role}</Badge>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        size: 280,
        minSize: 280,
        Cell: ({ row }) => (
          <Group gap="xs" wrap="nowrap">
            {isServerAuthMode ? (
              <Button
                size="xs"
                variant="light"
                disabled={!canAddCompanyUsers || sendInviteEmail.isPending}
                onClick={async () => {
                  setInviteError(null);
                  setInviteStatus(null);
                  try {
                    const result = await sendInviteEmail.mutateAsync(row.original.userId);
                    setInviteStatus(
                      result.onboardingDelivery === 'email'
                        ? `${result.user.email} was sent a password setup email.`
                        : `${result.user.email} was sent a password setup email request, but delivery is not configured so the link was logged on the server.`
                    );
                  } catch (err) {
                    setInviteError(
                      err instanceof Error ? err.message : 'Could not send invite email.'
                    );
                  }
                }}
              >
                Send invite
              </Button>
            ) : null}
            <Button
              size="xs"
              color="red"
              variant="light"
              disabled={!canAddCompanyUsers || row.original.isSelf || row.original.isOnlyAdmin}
              onClick={async () => {
                setMembershipError(null);
                setMembershipStatus(null);
                try {
                  await removeCompanyMember.mutateAsync(row.original.userId);
                  setMembershipStatus(`${row.original.userName} was removed from the company.`);
                } catch (err) {
                  setMembershipError(
                    err instanceof Error ? err.message : 'Could not remove company member.'
                  );
                }
              }}
            >
              Remove
            </Button>
          </Group>
        ),
      },
    ],
    [canAddCompanyUsers, removeCompanyMember, sendInviteEmail]
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={2}>
          <Title order={4}>Company settings</Title>
          <Text size="sm" c="dimmed">
            {company.data?.name ?? companyId} • Manage projects, users, and project roles
          </Text>
        </Stack>
        {highestRoleBadge}
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>{isServerAuthMode ? 'Invite user' : 'Add user (company)'}</Title>
              <Badge variant="light" color={canAddCompanyUsers ? 'gray' : 'red'}>
                {canAddCompanyUsers ? 'Ready' : 'Not allowed'}
              </Badge>
            </Group>
            {inviteError ? <Alert color="red">{inviteError}</Alert> : null}
            {inviteStatus ? <Alert color="green">{inviteStatus}</Alert> : null}
            <TextInput
              label="Name"
              value={newUserName}
              onChange={(e) => setNewUserName(e.currentTarget.value)}
            />
            <TextInput
              label="Email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.currentTarget.value)}
            />
            <Select
              label="Initial company role"
              data={[
                { value: 'member', label: 'member' },
                { value: 'management', label: 'management' },
                { value: 'executive', label: 'executive' },
                { value: 'admin', label: 'admin' },
              ]}
              value={newUserRole}
              onChange={(v) => setNewUserRole((v as CompanyRole | null) ?? null)}
            />
            <Button
              disabled={!canAddCompanyUsers || createUser.isPending}
              onClick={async () => {
                const name = newUserName.trim();
                const email = newUserEmail.trim();
                if (!name || !email) return;
                setInviteError(null);
                setInviteStatus(null);
                try {
                  const result = await createUser.mutateAsync({
                    name,
                    email,
                    role: newUserRole ?? 'member',
                  });
                  setNewUserName('');
                  setNewUserEmail('');
                  setNewUserRole('member');
                  if (!isServerAuthMode) {
                    setInviteStatus(`${result.user.name} was added to the company.`);
                    return;
                  }
                  if (result.onboardingEmailSent) {
                    setInviteStatus(
                      result.onboardingDelivery === 'email'
                        ? `${result.user.email} was invited and sent a password setup email.`
                        : `${result.user.email} was invited. Email delivery is not configured, so the password setup link was logged on the server.`
                    );
                    return;
                  }
                  setInviteStatus(`${result.user.email} was added to the company.`);
                } catch (err) {
                  setInviteError(err instanceof Error ? err.message : 'Could not invite user.');
                }
              }}
            >
              {isServerAuthMode ? 'Send invite' : 'Create user'}
            </Button>
            <Text size="xs" c="dimmed">
              {isServerAuthMode
                ? 'New users get a BetterAuth account, are linked to this company, and receive a password setup link. Existing users can also be re-sent an invite from the member list.'
                : 'Users created here belong only to this company.'}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>Company default categories</Title>
              <Badge variant="light" color={canEditCompanyDefaults ? 'gray' : 'red'}>
                {canEditCompanyDefaults ? 'Ready' : 'Not allowed'}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Define company-wide default categories and subcategories that can be safely added into projects later.
            </Text>
            <Group gap="sm" wrap="wrap">
              <Badge variant="light">{(defaultCategoriesQ.data ?? []).length} categories</Badge>
              <Badge variant="light">{(defaultSubCategoriesQ.data ?? []).length} subcategories</Badge>
            </Group>
            <Button
              variant="light"
              disabled={!canEditCompanyDefaults}
              onClick={() => setDefaultsModalOpen(true)}
            >
              Manage company defaults
            </Button>
            <Text size="xs" c="dimmed">
              Applying company defaults to a project only adds missing categories and subcategories. Existing project taxonomy is left unchanged.
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Title order={5}>Company roles</Title>
          {membershipError ? <Alert color="red">{membershipError}</Alert> : null}
          {membershipStatus ? <Alert color="green">{membershipStatus}</Alert> : null}
          <Group align="flex-end" wrap="wrap">
            <Select
              label="User"
              data={userOptions}
              value={effectiveRoleUserId}
              onChange={(v) => setRoleUserId(v ? asUserId(v) : null)}
              searchable
              style={{ width: '100%', maxWidth: 420 }}
            />
            <Select
              label="Company role"
              data={[
                { value: 'member', label: 'member' },
                { value: 'management', label: 'management' },
                { value: 'executive', label: 'executive' },
                { value: 'admin', label: 'admin' },
              ]}
              value={membershipCompanyRole}
              onChange={(v) => setMembershipCompanyRole(toCompanyRole(v))}
              style={{ width: '100%', maxWidth: 220 }}
            />
            <Button
              disabled={!effectiveRoleUserId || !membershipCompanyRole || wouldDemoteLastAdmin}
              onClick={async () => {
                if (!effectiveRoleUserId || !membershipCompanyRole) return;
                setMembershipError(null);
                setMembershipStatus(null);
                try {
                  await upsertCompanyMembership.mutateAsync({
                    userId: effectiveRoleUserId,
                    role: membershipCompanyRole,
                  });
                  setMembershipStatus('Company role updated.');
                } catch (err) {
                  setMembershipError(
                    err instanceof Error ? err.message : 'Could not update company role.'
                  );
                }
              }}
            >
              Set
            </Button>
          </Group>
          {wouldDemoteLastAdmin ? (
            <Alert color="yellow">
              This company must retain at least one admin. Assign another admin before changing this role.
            </Alert>
          ) : null}
          <Divider />
          <Text size="sm" c="dimmed">
            Update a teammate’s company role or remove them from the company entirely.
          </Text>
          <MantineReactTable
            columns={membershipColumns}
            data={membershipRows}
            getRowId={(row) => row.key}
            mantineTableContainerProps={{ className: 'financeTable' }}
            mantineTableProps={{ highlightOnHover: true, striped: 'odd', withTableBorder: true }}
            enableColumnActions={false}
            enableColumnFilters={false}
            enableSorting
            enableTopToolbar={false}
            enableDensityToggle={false}
            enableFullScreenToggle={false}
            initialState={{ density: 'xs', pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 8 } }}
          />
        </Stack>
      </Paper>

      <CompanyDefaultTaxonomyModal
        opened={defaultsModalOpen}
        onClose={() => setDefaultsModalOpen(false)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
    </Stack>
  );
}
