import { useMemo, useReducer } from 'react';
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

function toCompanyRole(value: string | null): CompanyRole | null {
  if (
    value === 'member' ||
    value === 'management' ||
    value === 'executive' ||
    value === 'admin'
  ) {
    return value;
  }
  return null;
}

type InviteState = {
  name: string;
  email: string;
  role: CompanyRole | null;
  sendOnboardingEmail: boolean;
  status: string | null;
  error: string | null;
};

type InviteAction =
  | { type: 'setName'; value: string }
  | { type: 'setEmail'; value: string }
  | { type: 'setRole'; value: CompanyRole | null }
  | { type: 'setSendOnboardingEmail'; value: boolean }
  | { type: 'start' }
  | { type: 'success'; message: string; resetForm?: boolean }
  | { type: 'fail'; message: string };

const initialInviteState: InviteState = {
  name: '',
  email: '',
  role: 'member',
  sendOnboardingEmail: false,
  status: null,
  error: null,
};

function inviteReducer(state: InviteState, action: InviteAction): InviteState {
  if (action.type === 'setName') return { ...state, name: action.value };
  if (action.type === 'setEmail') return { ...state, email: action.value };
  if (action.type === 'setRole') return { ...state, role: action.value };
  if (action.type === 'setSendOnboardingEmail') {
    return { ...state, sendOnboardingEmail: action.value };
  }
  if (action.type === 'start') {
    return { ...state, status: null, error: null };
  }
  if (action.type === 'success') {
    return {
      ...(action.resetForm ? initialInviteState : state),
      status: action.message,
      error: null,
    };
  }
  return { ...state, status: null, error: action.message };
}

type MembershipEditorState = {
  error: string | null;
  status: string | null;
  userId: UserId | null;
  role: CompanyRole | null;
};

type MembershipEditorAction =
  | { type: 'selectUser'; userId: UserId | null }
  | { type: 'selectRole'; role: CompanyRole | null }
  | { type: 'start' }
  | { type: 'success'; message: string }
  | { type: 'fail'; message: string };

const initialMembershipEditorState: MembershipEditorState = {
  error: null,
  status: null,
  userId: null,
  role: 'member',
};

function membershipEditorReducer(
  state: MembershipEditorState,
  action: MembershipEditorAction
): MembershipEditorState {
  if (action.type === 'selectUser') {
    return { ...state, userId: action.userId };
  }
  if (action.type === 'selectRole') return { ...state, role: action.role };
  if (action.type === 'start') {
    return { ...state, status: null, error: null };
  }
  if (action.type === 'success') {
    return { ...state, status: action.message, error: null };
  }
  return { ...state, status: null, error: action.message };
}

type CompanySettingsModal =
  | 'defaults'
  | 'mappings'
  | 'importRules'
  | 'ruleSuggestions'
  | null;

function companySettingsModalReducer(
  _state: CompanySettingsModal,
  next: CompanySettingsModal
) {
  return next;
}

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

  const [inviteState, dispatchInvite] = useReducer(
    inviteReducer,
    initialInviteState
  );
  const {
    name: newUserName,
    email: newUserEmail,
    role: newUserRole,
    sendOnboardingEmail,
    status: inviteStatus,
    error: inviteError,
  } = inviteState;
  const [membershipState, dispatchMembership] = useReducer(
    membershipEditorReducer,
    initialMembershipEditorState
  );
  const {
    error: membershipError,
    status: membershipStatus,
    userId: roleUserId,
    role: membershipCompanyRole,
  } = membershipState;
  const [activeModal, setActiveModal] = useReducer(
    companySettingsModalReducer,
    initialReview === 'rule-suggestions' ? 'ruleSuggestions' : null
  );

  // Derive a sensible default selection without synchronously setting state in an effect.
  // This avoids cascading renders and keeps `react-hooks/set-state-in-effect` happy.
  const effectiveRoleUserId: UserId | null =
    roleUserId ??
    (isHydrated && userOptions[0]?.value
      ? asUserId(userOptions[0].value)
      : null);

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
                dispatchInvite({ type: 'start' });
                try {
                  const result = await sendInviteEmail.mutateAsync(
                    row.original.userId
                  );
                  dispatchInvite({
                    type: 'success',
                    message:
                      result.onboardingDelivery === 'email'
                        ? `Password setup email sent to ${result.user.email}. Ask them to check spam or junk if it does not arrive soon, and to use the newest email if more than one was sent.`
                        : `Password setup email requested for ${result.user.email}. Email delivery is not configured, so the newest setup link was logged on the server instead.`,
                  });
                } catch (err) {
                  dispatchInvite({
                    type: 'fail',
                    message:
                      err instanceof Error
                        ? err.message
                        : 'Could not send password setup email.',
                  });
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
                dispatchMembership({ type: 'start' });
                try {
                  await removeCompanyMember.mutateAsync(row.original.userId);
                  dispatchMembership({
                    type: 'success',
                    message: `${row.original.userName} was removed from the company.`,
                  });
                } catch (err) {
                  dispatchMembership({
                    type: 'fail',
                    message:
                      err instanceof Error
                        ? err.message
                        : 'Could not remove company member.',
                  });
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
              onClick={() => setActiveModal('defaults')}
            >
              Manage Categories
            </Button>
            <Button
              variant="default"
              disabled={!canEditCompanyDefaults}
              onClick={() => setActiveModal('mappings')}
            >
              Manage Auto-Coding Rules
            </Button>
            <Button
              variant="default"
              disabled={!canEditCompanyDefaults}
              onClick={() => setActiveModal('importRules')}
            >
              Manage Import Rules
            </Button>
            <Button
              variant="default"
              disabled={!canEditCompanyDefaults}
              onClick={() => setActiveModal('ruleSuggestions')}
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
              onChange={(e) =>
                dispatchInvite({
                  type: 'setName',
                  value: e.currentTarget.value,
                })
              }
            />
            <TextInput
              label="Email"
              value={newUserEmail}
              onChange={(e) =>
                dispatchInvite({
                  type: 'setEmail',
                  value: e.currentTarget.value,
                })
              }
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
              onChange={(v) =>
                dispatchInvite({ type: 'setRole', value: toCompanyRole(v) })
              }
            />
            <Checkbox
              label="Send password setup email now"
              description="Brand-new users will still receive their setup email automatically. Turn this on when you also want to send the newest setup email to an existing account."
              checked={sendOnboardingEmail}
              onChange={(e) =>
                dispatchInvite({
                  type: 'setSendOnboardingEmail',
                  value: e.currentTarget.checked,
                })
              }
            />
            <Group>
              <Button
                variant="default"
                disabled={!canAddCompanyUsers || createUser.isPending}
                onClick={async () => {
                  const name = newUserName.trim();
                  const email = newUserEmail.trim();
                  if (!name || !email) return;
                  dispatchInvite({ type: 'start' });
                  try {
                    const result = await createUser.mutateAsync({
                      name,
                      email,
                      role: newUserRole ?? 'member',
                      sendOnboardingEmail,
                    });
                    if (result.onboardingEmailSent) {
                      dispatchInvite({
                        type: 'success',
                        resetForm: true,
                        message: result.createdAuthUser
                          ? result.onboardingDelivery === 'email'
                            ? `${result.user.email} was added as a new company member and sent a password setup email. Ask them to check spam or junk if it does not arrive soon.`
                            : `${result.user.email} was added as a new company member. Email delivery is not configured, so the newest password setup link was logged on the server instead.`
                          : result.onboardingDelivery === 'email'
                            ? `${result.user.email} was added to the company and sent the newest password setup email. Ask them to check spam or junk if it does not arrive soon.`
                            : `${result.user.email} was added to the company. Email delivery is not configured, so the newest password setup link was logged on the server instead.`,
                      });
                      return;
                    }
                    dispatchInvite({
                      type: 'success',
                      resetForm: true,
                      message: result.membershipCreated
                        ? `${result.user.email} was added to the company. No email was sent. You can resend their password setup email later from the member list if they need it.`
                        : `${result.user.email} was already in the company. Their role was updated and no email was sent.`,
                    });
                  } catch (err) {
                    dispatchInvite({
                      type: 'fail',
                      message:
                        err instanceof Error
                          ? err.message
                          : 'Could not invite user.',
                    });
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
                onChange={(v) =>
                  dispatchMembership({
                    type: 'selectUser',
                    userId: v ? asUserId(v) : null,
                  })
                }
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
                onChange={(v) =>
                  dispatchMembership({
                    type: 'selectRole',
                    role: toCompanyRole(v),
                  })
                }
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
                  dispatchMembership({ type: 'start' });
                  try {
                    await upsertCompanyMembership.mutateAsync({
                      userId: effectiveRoleUserId,
                      role: membershipCompanyRole,
                    });
                    dispatchMembership({
                      type: 'success',
                      message: 'Company role updated.',
                    });
                  } catch (err) {
                    dispatchMembership({
                      type: 'fail',
                      message:
                        err instanceof Error
                          ? err.message
                          : 'Could not update company role.',
                    });
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
        opened={activeModal === 'defaults'}
        onClose={() => setActiveModal(null)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
      <CompanyDefaultMappingsModal
        opened={activeModal === 'mappings'}
        onClose={() => setActiveModal(null)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
      <CompanyImportRulesModal
        opened={activeModal === 'importRules'}
        onClose={() => setActiveModal(null)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
      <RuleSuggestionsModal
        opened={activeModal === 'ruleSuggestions'}
        onClose={() => setActiveModal(null)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
    </Stack>
  );
}
