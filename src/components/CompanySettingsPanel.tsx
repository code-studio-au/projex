import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Paper,
  Select,
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
import { useUsersQuery } from '../queries/reference';
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
  useCompanyDefaultMappingRulesQuery,
  useCompanyDefaultSubCategoriesQuery,
} from '../queries/taxonomy';
import CompanyDefaultTaxonomyModal from './CompanyDefaultTaxonomyModal';
import CompanyDefaultMappingsModal from './CompanyDefaultMappingsModal';

export default function CompanySettingsPanel(props: { companyId: CompanyId }) {
  const { companyId } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');

  const access = useCompanyAccess(companyId);
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
  const defaultMappingRulesQ = useCompanyDefaultMappingRulesQuery(companyId);

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
  const [sendOnboardingEmail, setSendOnboardingEmail] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [roleUserId, setRoleUserId] = useState<UserId | null>(null);
  const [defaultsModalOpen, setDefaultsModalOpen] = useState(false);
  const [mappingsModalOpen, setMappingsModalOpen] = useState(false);

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
          <Group gap="xs" wrap="wrap" className="tableActionGroup">
            {isServerAuthMode ? (
              <Button
                size="xs"
                variant="light"
                className="tableActionButton"
                disabled={!canAddCompanyUsers || sendInviteEmail.isPending}
                onClick={async () => {
                  setInviteError(null);
                  setInviteStatus(null);
                  try {
                    const result = await sendInviteEmail.mutateAsync(row.original.userId);
                    setInviteStatus(
                      result.onboardingDelivery === 'email'
                        ? `Password setup email sent to ${result.user.email}. Ask them to check spam or junk if it does not arrive soon, and to use the newest email if more than one was sent.`
                        : `Password setup email requested for ${result.user.email}. Email delivery is not configured, so the newest setup link was logged on the server instead.`
                    );
                  } catch (err) {
                    setInviteError(
                      err instanceof Error ? err.message : 'Could not send password setup email.'
                    );
                  }
                }}
              >
                Resend invite
              </Button>
            ) : null}
            <Button
              size="xs"
              color="red"
              variant="light"
              className="tableActionButton"
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
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={4}>Company settings</Title>
        {highestRoleBadge}
      </Group>

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

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={5}>Company default mappings</Title>
            <Badge variant="light" color={canEditCompanyDefaults ? 'gray' : 'red'}>
              {canEditCompanyDefaults ? 'Ready' : 'Not allowed'}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Match imported transaction text to company default taxonomy so uncoded imports can be auto-coded in projects that already contain those defaults.
          </Text>
          <Group gap="sm" wrap="wrap">
            <Badge variant="light">{(defaultMappingRulesQ.data ?? []).length} mapping rules</Badge>
          </Group>
          <Button
            variant="light"
            disabled={!canEditCompanyDefaults}
            onClick={() => setMappingsModalOpen(true)}
          >
            Manage default mappings
          </Button>
          <Text size="xs" c="dimmed">
            The first matching rule wins. Rules search transaction item and description text, support simple singular/plural matches, and mark auto-coded rows for approval in the transaction list.
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={5}>{isServerAuthMode ? 'Add member' : 'Add user (company)'}</Title>
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
          {isServerAuthMode ? (
            <Checkbox
              label="Send password setup email now"
              description="Brand-new users will still receive their setup email automatically. Turn this on when you also want to send the newest setup email to an existing account."
              checked={sendOnboardingEmail}
              onChange={(e) => setSendOnboardingEmail(e.currentTarget.checked)}
            />
          ) : null}
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
                  sendOnboardingEmail,
                });
                setNewUserName('');
                setNewUserEmail('');
                setNewUserRole('member');
                setSendOnboardingEmail(false);
                if (!isServerAuthMode) {
                  setInviteStatus(
                    result.membershipCreated
                      ? `${result.user.name} was added to the company.`
                      : `${result.user.name} is already in the company, and their role was updated.`
                  );
                  return;
                }
                if (result.onboardingEmailSent) {
                  setInviteStatus(
                    result.createdAuthUser
                      ? result.onboardingDelivery === 'email'
                        ? `${result.user.email} was added as a new company member and sent a password setup email. Ask them to check spam or junk if it does not arrive soon.`
                        : `${result.user.email} was added as a new company member. Email delivery is not configured, so the newest password setup link was logged on the server instead.`
                      : result.onboardingDelivery === 'email'
                        ? `${result.user.email} was added to the company and sent the newest password setup email. Ask them to check spam or junk if it does not arrive soon.`
                        : `${result.user.email} was added to the company. Email delivery is not configured, so the newest password setup link was logged on the server instead.`
                  );
                  return;
                }
                setInviteStatus(
                  result.membershipCreated
                    ? `${result.user.email} was added to the company. No email was sent. You can resend their password setup email later from the member list if they need it.`
                    : `${result.user.email} was already in the company. Their role was updated and no email was sent.`
                );
              } catch (err) {
                setInviteError(err instanceof Error ? err.message : 'Could not invite user.');
              }
            }}
          >
            {isServerAuthMode ? 'Add member' : 'Create user'}
          </Button>
          <Text size="xs" c="dimmed">
            {isServerAuthMode
              ? 'Adding someone to the company and emailing them are now separate choices. New BetterAuth accounts still get their setup email automatically, while existing users can be added quietly and emailed later if needed.'
              : 'Users created here belong only to this company.'}
          </Text>
        </Stack>
      </Paper>

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
              size="sm"
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
            mantineTableBodyCellProps={{
              style: { verticalAlign: 'middle' },
            }}
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
      <CompanyDefaultMappingsModal
        opened={mappingsModalOpen}
        onClose={() => setMappingsModalOpen(false)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
    </Stack>
  );
}
