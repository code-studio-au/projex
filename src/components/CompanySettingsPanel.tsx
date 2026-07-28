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
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyId, CompanyRole, UserId } from '../types';
import { useIsHydrated } from '../hooks/useIsHydrated';
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
import { useCompanyDefaultsQuery } from '../queries/taxonomy';
import { useRuleSuggestionsQuery } from '../queries/ruleSuggestions';
import { useImportRulesQuery } from '../queries/importRules';
import { Route as companyLayoutRoute } from '../routes/_authed.c.$companyId';
import CompanyDefaultTaxonomyModal from './CompanyDefaultTaxonomyModal';
import CompanyDefaultMappingsModal from './CompanyDefaultMappingsModal';
import CompanyImportRulesModal from './CompanyImportRulesModal';
import RuleSuggestionsModal from './RuleSuggestionsModal';
import CompanyExportPanel from './companySettings/CompanyExportPanel';
import classes from '../styles/ui.module.css';

export default function CompanySettingsPanel(props: {
  companyId: CompanyId;
  initialExportJobId?: string | null;
  initialReview?: 'rule-suggestions' | null;
}) {
  const { companyId, initialExportJobId = null, initialReview = null } = props;
  const loaderData = companyLayoutRoute.useLoaderData();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useIsHydrated();

  const access = useCompanyAccess(companyId);
  const usersQ = useUsersQuery();
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);

  const createUser = useCreateUserInCompanyMutation(companyId);
  const sendInviteEmail = useSendCompanyUserInviteEmailMutation(companyId);
  const removeCompanyMember = useDeleteCompanyMembershipMutation(companyId);
  const upsertCompanyMembership = useUpsertCompanyMembershipMutation(companyId);
  // Permissions are evaluated via `access.can(...)` so that global superadmin
  // works across companies even without explicit membership.
  const currentCompanyRole =
    (isHydrated ? access.companyRole : undefined) ??
    loaderData?.companyRole ??
    'none';
  const effectiveIsSuperadmin =
    (isHydrated ? access.isSuperadmin : undefined) ??
    loaderData?.isGlobalSuperadmin ??
    false;
  const canAddCompanyUsers =
    (isHydrated ? access.can('company:manage_members') : undefined) ??
    loaderData?.canManageCompanyMembers ??
    false;
  const canEditCompanyDefaults =
    (isHydrated ? access.can('company:manage_defaults') : undefined) ??
    loaderData?.canManageCompanyDefaults ??
    false;
  const canExportCompany =
    (isHydrated ? access.can('company:export') : undefined) ??
    loaderData?.canExportCompany ??
    false;
  const companyDefaultsQ = useCompanyDefaultsQuery(companyId);
  const companyImportRulesQ = useImportRulesQuery(companyId);
  const ruleSuggestionsQ = useRuleSuggestionsQuery(companyId);
  const effectiveDefaults = isHydrated
    ? companyDefaultsQ.data
    : {
        categories: Array.from({
          length: loaderData?.companyDefaultsCategoryCount ?? 0,
        }),
        subCategories: Array.from({
          length: loaderData?.companyDefaultsSubCategoryCount ?? 0,
        }),
        mappingRules: Array.from({
          length: loaderData?.companyDefaultsMappingRuleCount ?? 0,
        }),
      };
  const companyDefaultsLoading = isHydrated
    ? companyDefaultsQ.isPending && !companyDefaultsQ.data
    : false;

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
  const [importRulesModalOpen, setImportRulesModalOpen] = useState(false);
  const [ruleSuggestionsModalOpen, setRuleSuggestionsModalOpen] = useState(
    initialReview === 'rule-suggestions'
  );

  // Derive a sensible default selection without synchronously setting state in an effect.
  // This avoids cascading renders and keeps `react-hooks/set-state-in-effect` happy.
  const effectiveRoleUserId: UserId | null =
    roleUserId ??
    (isHydrated && userOptions[0]?.value
      ? asUserId(userOptions[0].value)
      : null);

  const [membershipCompanyRole, setMembershipCompanyRole] =
    useState<CompanyRole | null>('member');

  const toCompanyRole = (v: string | null): CompanyRole | null => {
    if (!v) return null;
    if (
      v === 'member' ||
      v === 'management' ||
      v === 'executive' ||
      v === 'admin'
    ) {
      return v;
    }
    return null;
  };

  const highestRoleBadge = (
    <Badge variant="light">
      Your company role: {currentCompanyRole}
      {effectiveIsSuperadmin ? ' (global superadmin)' : ''}
    </Badge>
  );

  const membershipRows = useMemo(() => {
    const adminCount = (companyMembershipsQ.data ?? []).filter(
      (m) => m.role === 'admin'
    ).length;
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
  }, [access.userId, companyMembershipsQ.data, usersQ.data]);

  const selectedMembership = useMemo(
    () =>
      membershipRows.find((row) => row.userId === effectiveRoleUserId) ?? null,
    [effectiveRoleUserId, membershipRows]
  );
  const wouldDemoteLastAdmin =
    !!selectedMembership &&
    selectedMembership.role === 'admin' &&
    selectedMembership.isOnlyAdmin &&
    membershipCompanyRole !== 'admin';

  const membershipColumns = useMemo<
    MRT_ColumnDef<(typeof membershipRows)[number]>[]
  >(
    () => [
      {
        accessorKey: 'userName',
        header: 'User',
        Cell: ({ row }) => (
          <Stack gap={2}>
            <Text className="table-body-left-bold">
              {row.original.userName}
            </Text>
            {row.original.userEmail ? (
              <Text className="table-body-left" c="dimmed">
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
            <Button
              size="xs"
              variant="light"
              className="tableActionButton"
              disabled={!canAddCompanyUsers || sendInviteEmail.isPending}
              onClick={async () => {
                setInviteError(null);
                setInviteStatus(null);
                try {
                  const result = await sendInviteEmail.mutateAsync(
                    row.original.userId
                  );
                  setInviteStatus(
                    result.onboardingDelivery === 'email'
                      ? `Password setup email sent to ${result.user.email}. Ask them to check spam or junk if it does not arrive soon, and to use the newest email if more than one was sent.`
                      : `Password setup email requested for ${result.user.email}. Email delivery is not configured, so the newest setup link was logged on the server instead.`
                  );
                } catch (err) {
                  setInviteError(
                    err instanceof Error
                      ? err.message
                      : 'Could not send password setup email.'
                  );
                }
              }}
            >
              Resend invite
            </Button>
            <Button
              size="xs"
              color="red"
              variant="light"
              className="tableActionButton"
              disabled={
                !canAddCompanyUsers ||
                row.original.isSelf ||
                row.original.isOnlyAdmin
              }
              onClick={async () => {
                setMembershipError(null);
                setMembershipStatus(null);
                try {
                  await removeCompanyMember.mutateAsync(row.original.userId);
                  setMembershipStatus(
                    `${row.original.userName} was removed from the company.`
                  );
                } catch (err) {
                  setMembershipError(
                    err instanceof Error
                      ? err.message
                      : 'Could not remove company member.'
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
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Title order={5}>Company settings</Title>
            {highestRoleBadge}
          </Group>
          <Text size="sm" c="dimmed">
            Manage company-wide standards, access, exports, and member roles.
            Project-specific settings remain in each project workspace.
          </Text>
        </Stack>
      </Paper>

      <CompanyExportPanel
        companyId={companyId}
        initialExportJobId={initialExportJobId}
        canExportCompany={canExportCompany}
        isHydrated={isHydrated}
      />

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Company Standards Alignment</Title>
          <Text size="sm" c="dimmed">
            Define the shared categories, import rules, and auto-coding used by
            projects that sync with company standards.
          </Text>
          {companyDefaultsLoading ||
          (companyImportRulesQ.isPending && !companyImportRulesQ.data) ||
          (ruleSuggestionsQ.isPending && !ruleSuggestionsQ.data) ? (
            <Text size="sm" c="dimmed">
              Loading company standards...
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              {effectiveDefaults?.categories.length ?? 0} categories,{' '}
              {effectiveDefaults?.subCategories.length ?? 0} subcategories,{' '}
              {companyImportRulesQ.data?.length ?? 0} import rules, and{' '}
              {effectiveDefaults?.mappingRules.length ?? 0} auto-coding rules.
            </Text>
          )}
          <Group gap="sm" wrap="wrap">
            <Badge variant="light" color="teal">
              Synced projects inherit these
            </Badge>
            {(ruleSuggestionsQ.data?.length ?? 0) > 0 ? (
              <Badge variant="light" color="orange">
                {ruleSuggestionsQ.data?.length ?? 0} rule suggestions
              </Badge>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed">
            Project-specific overrides stay local. Repeated manual coding can
            also be reviewed here and promoted into reusable company rules.
          </Text>
          <Group gap="sm" wrap="wrap">
            <Button
              variant="default"
              disabled={!canEditCompanyDefaults}
              onClick={() => setDefaultsModalOpen(true)}
            >
              Manage Categories
            </Button>
            <Button
              variant="default"
              disabled={!canEditCompanyDefaults}
              onClick={() => setMappingsModalOpen(true)}
            >
              Manage Auto-Coding Rules
            </Button>
            <Button
              variant="default"
              disabled={!canEditCompanyDefaults}
              onClick={() => setImportRulesModalOpen(true)}
            >
              Manage Import Rules
            </Button>
            <Button
              variant="default"
              disabled={!canEditCompanyDefaults}
              onClick={() => setRuleSuggestionsModalOpen(true)}
            >
              Review Rule Suggestions
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Add member</Title>
          {inviteError ? <Alert color="red">{inviteError}</Alert> : null}
          {inviteStatus ? <Alert color="green">{inviteStatus}</Alert> : null}
          <Text size="sm" c="dimmed">
            Add someone to the company and choose their initial access level.
          </Text>
          <Stack gap="sm" style={{ width: '100%', maxWidth: 460 }}>
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
              onChange={(v) => setNewUserRole(toCompanyRole(v))}
            />
            <Checkbox
              label="Send password setup email now"
              description="Brand-new users will still receive their setup email automatically. Turn this on when you also want to send the newest setup email to an existing account."
              checked={sendOnboardingEmail}
              onChange={(e) => setSendOnboardingEmail(e.currentTarget.checked)}
            />
            <Group>
              <Button
                variant="default"
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
                    setInviteError(
                      err instanceof Error
                        ? err.message
                        : 'Could not invite user.'
                    );
                  }
                }}
              >
                Add member
              </Button>
            </Group>
          </Stack>
          <Text size="xs" c="dimmed">
            Adding someone to the company and emailing them are now separate
            choices. New BetterAuth accounts still get their setup email
            automatically, while existing users can be added quietly and emailed
            later if needed.
          </Text>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Current members</Title>
          <Text size="sm" c="dimmed">
            Update a teammate's company role or remove them from the company
            entirely.
          </Text>
          {membershipError ? (
            <Alert color="red">{membershipError}</Alert>
          ) : null}
          {membershipStatus ? (
            <Alert color="green">{membershipStatus}</Alert>
          ) : null}
          {isHydrated ? (
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
                variant="default"
                disabled={
                  !effectiveRoleUserId ||
                  !membershipCompanyRole ||
                  wouldDemoteLastAdmin
                }
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
                      err instanceof Error
                        ? err.message
                        : 'Could not update company role.'
                    );
                  }
                }}
              >
                Set
              </Button>
            </Group>
          ) : (
            <Paper className={classes.surfaceMuted} radius="xl" p="md">
              <Text size="sm" c="dimmed">
                Loading role controls...
              </Text>
            </Paper>
          )}
          {wouldDemoteLastAdmin ? (
            <Alert color="yellow">
              This company must retain at least one admin. Assign another admin
              before changing this role.
            </Alert>
          ) : null}
          <Divider />
          <div className={classes.tableWrap}>
            {isHydrated ? (
              <MantineReactTable
                columns={membershipColumns}
                data={membershipRows}
                getRowId={(row) => row.key}
                mantineTableContainerProps={{ className: 'financeTable' }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                }}
                mantineTableBodyCellProps={{
                  style: { verticalAlign: 'middle' },
                }}
                enableColumnActions={false}
                enableColumnFilters={false}
                enableSorting
                enableTopToolbar={false}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
                initialState={{
                  density: 'xs',
                  pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 8 },
                }}
              />
            ) : (
              <Paper className={classes.surfaceMuted} radius="xl" p="md">
                <Text size="sm" c="dimmed">
                  Loading company members...
                </Text>
              </Paper>
            )}
          </div>
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
      <CompanyImportRulesModal
        opened={importRulesModalOpen}
        onClose={() => setImportRulesModalOpen(false)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
      <RuleSuggestionsModal
        opened={ruleSuggestionsModalOpen}
        onClose={() => setRuleSuggestionsModalOpen(false)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
    </Stack>
  );
}
