import { useMemo, useReducer } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
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
import { useRouter } from '@tanstack/react-router';

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
import { Route as companyDashboardIndexRoute } from '../routes/_authed.c.$companyId.index';
import CompanyDefaultTaxonomyModal from './CompanyDefaultTaxonomyModal';
import CompanyDefaultMappingsModal from './CompanyDefaultMappingsModal';
import CompanyImportRulesModal from './CompanyImportRulesModal';
import RuleSuggestionsModal from './RuleSuggestionsModal';
import CompanyExportPanel from './companySettings/CompanyExportPanel';
import CompanyMembershipRoleEditor from './companySettings/CompanyMembershipRoleEditor';
import AccessRemovalButton from './access/AccessRemovalButton';
import RolePermissionSummary from './access/RolePermissionSummary';
import {
  companyRoleOptions,
  getCompanyRoleDefinition,
} from '../access/roleDefinitions';
import { showAppToast } from '../utils/toast';
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
  | {
      type: 'selectUser';
      userId: UserId | null;
      currentRole: CompanyRole | null;
    }
  | { type: 'selectRole'; role: CompanyRole | null }
  | { type: 'start' }
  | { type: 'success'; message: string }
  | { type: 'fail'; message: string };

const initialMembershipEditorState: MembershipEditorState = {
  error: null,
  status: null,
  userId: null,
  role: null,
};

function membershipEditorReducer(
  state: MembershipEditorState,
  action: MembershipEditorAction
): MembershipEditorState {
  if (action.type === 'selectUser') {
    return {
      ...state,
      error: null,
      status: null,
      userId: action.userId,
      role: action.currentRole,
    };
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
  'invite' | 'defaults' | 'mappings' | 'importRules' | 'ruleSuggestions' | null;

function companySettingsModalReducer(
  _state: CompanySettingsModal,
  next: CompanySettingsModal
) {
  return next;
}

function useCompanySettingsPanelController(props: {
  companyId: CompanyId;
  initialExportJobId?: string | null;
  initialReview?: 'rule-suggestions' | null;
}) {
  const { companyId, initialExportJobId = null, initialReview = null } = props;
  const loaderData = companyLayoutRoute.useLoaderData();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useIsHydrated();
  const router = useRouter();

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
  const effectiveMembershipCompanyRole =
    membershipCompanyRole ?? selectedMembership?.role ?? null;
  const wouldDemoteLastAdmin =
    !!selectedMembership &&
    selectedMembership.role === 'admin' &&
    selectedMembership.isOnlyAdmin &&
    effectiveMembershipCompanyRole !== 'admin';
  const selectedMembershipIsSelf = selectedMembership?.userId === access.userId;
  const wouldLoseCompanySettingsAccess =
    selectedMembershipIsSelf && effectiveMembershipCompanyRole === 'member';

  async function submitCompanyInvite() {
    const name = newUserName.trim();
    const email = newUserEmail.trim();
    if (!name || !email || !newUserRole) return;

    dispatchInvite({ type: 'start' });
    try {
      const result = await createUser.mutateAsync({
        name,
        email,
        role: newUserRole,
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
          : `${result.user.email} was already in the company with this role. No access was changed and no email was sent.`,
      });
    } catch (err) {
      dispatchInvite({
        type: 'fail',
        message:
          err instanceof Error ? err.message : 'Could not add company member.',
      });
      throw err;
    }
  }

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
        Cell: ({ row }) => (
          <Badge variant="light">
            {getCompanyRoleDefinition(row.original.role).label}
          </Badge>
        ),
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
            <AccessRemovalButton
              userLabel={row.original.userName}
              scopeLabel="the company"
              consequence={`${row.original.userName} will lose company access and every explicit project assignment in this company.`}
              disabledReason={
                !canAddCompanyUsers
                  ? 'Only company Admins can remove company members.'
                  : row.original.isSelf
                    ? 'You cannot remove your own company membership.'
                    : row.original.isOnlyAdmin
                      ? 'Assign another company Admin before removing the only Admin.'
                      : undefined
              }
              isPending={removeCompanyMember.isPending}
              onConfirm={async () => {
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
                  throw err;
                }
              }}
            />
          </Group>
        ),
      },
    ],
    [canAddCompanyUsers, removeCompanyMember, sendInviteEmail]
  );

  return {
    activeModal,
    canAddCompanyUsers,
    canEditCompanyDefaults,
    canExportCompany,
    companyDefaultsLoading,
    companyId,
    companyImportRulesQ,
    createUser,
    dispatchInvite,
    dispatchMembership,
    effectiveDefaults,
    effectiveRoleUserId,
    highestRoleBadge,
    initialExportJobId,
    inviteError,
    inviteStatus,
    isHydrated,
    isMobile,
    membershipColumns,
    effectiveMembershipCompanyRole,
    membershipError,
    membershipRows,
    membershipStatus,
    newUserEmail,
    newUserName,
    newUserRole,
    ruleSuggestionsQ,
    router,
    sendOnboardingEmail,
    submitCompanyInvite,
    selectedMembership,
    selectedMembershipIsSelf,
    setActiveModal,
    upsertCompanyMembership,
    userOptions,
    wouldDemoteLastAdmin,
    wouldLoseCompanySettingsAccess,
  };
}

type CompanySettingsPanelController = ReturnType<
  typeof useCompanySettingsPanelController
>;

function CompanyDetailsSettingsCard({
  model,
}: {
  model: CompanySettingsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Company Standards Alignment</Title>
        <Text size="sm" c="dimmed">
          Define the shared categories, import rules, and auto-coding used by
          projects that sync with company standards.
        </Text>
        {model.companyDefaultsLoading ||
        (model.companyImportRulesQ.isPending &&
          !model.companyImportRulesQ.data) ||
        (model.ruleSuggestionsQ.isPending && !model.ruleSuggestionsQ.data) ? (
          <Text size="sm" c="dimmed">
            Loading company standards...
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            {model.effectiveDefaults?.categories.length ?? 0} categories,{' '}
            {model.effectiveDefaults?.subCategories.length ?? 0} subcategories,{' '}
            {model.companyImportRulesQ.data?.length ?? 0} import rules, and{' '}
            {model.effectiveDefaults?.mappingRules.length ?? 0} auto-coding
            rules.
          </Text>
        )}
        <Group gap="sm" wrap="wrap">
          <Badge variant="light" color="teal">
            Synced projects inherit these
          </Badge>
          {(model.ruleSuggestionsQ.data?.length ?? 0) > 0 ? (
            <Badge variant="light" color="orange">
              {model.ruleSuggestionsQ.data?.length ?? 0} rule suggestions
            </Badge>
          ) : null}
        </Group>
        <Text size="xs" c="dimmed">
          Project-specific overrides stay local. Repeated manual coding can also
          be reviewed here and promoted into reusable company rules.
        </Text>
        <Group gap="sm" wrap="wrap">
          <Button
            variant="default"
            disabled={!model.canEditCompanyDefaults}
            onClick={() => model.setActiveModal('defaults')}
          >
            Manage Categories
          </Button>
          <Button
            variant="default"
            disabled={!model.canEditCompanyDefaults}
            onClick={() => model.setActiveModal('mappings')}
          >
            Manage Auto-Coding Rules
          </Button>
          <Button
            variant="default"
            disabled={!model.canEditCompanyDefaults}
            onClick={() => model.setActiveModal('importRules')}
          >
            Manage Import Rules
          </Button>
          <Button
            variant="default"
            disabled={!model.canEditCompanyDefaults}
            onClick={() => model.setActiveModal('ruleSuggestions')}
          >
            Review Rule Suggestions
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function CompanyMembershipSettingsCard({
  model,
}: {
  model: CompanySettingsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Add member</Title>
        {model.inviteError ? (
          <Alert color="red">{model.inviteError}</Alert>
        ) : null}
        {model.inviteStatus ? (
          <Alert color="green">{model.inviteStatus}</Alert>
        ) : null}
        <Text size="sm" c="dimmed">
          Add someone to the company and choose their initial access level.
        </Text>
        <Stack gap="sm" style={{ width: '100%', maxWidth: 460 }}>
          <TextInput
            label="Name"
            value={model.newUserName}
            onChange={(e) =>
              model.dispatchInvite({
                type: 'setName',
                value: e.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Email"
            value={model.newUserEmail}
            onChange={(e) =>
              model.dispatchInvite({
                type: 'setEmail',
                value: e.currentTarget.value,
              })
            }
          />
          <Select
            label="Initial company role"
            data={companyRoleOptions}
            value={model.newUserRole}
            onChange={(v) =>
              model.dispatchInvite({
                type: 'setRole',
                value: toCompanyRole(v),
              })
            }
          />
          <Checkbox
            label="Send password setup email now"
            description="Brand-new users will still receive their setup email automatically. Turn this on when you also want to send the newest setup email to an existing account."
            checked={model.sendOnboardingEmail}
            onChange={(e) =>
              model.dispatchInvite({
                type: 'setSendOnboardingEmail',
                value: e.currentTarget.checked,
              })
            }
          />
          <Group>
            <Button
              variant="default"
              disabled={
                !model.canAddCompanyUsers ||
                model.createUser.isPending ||
                !model.newUserName.trim() ||
                !model.newUserEmail.trim() ||
                !model.newUserRole
              }
              onClick={() => model.setActiveModal('invite')}
            >
              Review member access
            </Button>
          </Group>
        </Stack>
        <Text size="xs" c="dimmed">
          Adding someone to the company and emailing them are now separate
          choices. New BetterAuth accounts still get their setup email
          automatically, while existing users can be added quietly and emailed
          later if needed.
        </Text>
        {model.newUserRole ? (
          <RolePermissionSummary
            definition={getCompanyRoleDefinition(model.newUserRole)}
          />
        ) : null}
        <Modal
          opened={model.activeModal === 'invite'}
          onClose={() => model.setActiveModal(null)}
          title="Confirm company access"
          centered
          closeOnClickOutside={!model.createUser.isPending}
          closeOnEscape={!model.createUser.isPending}
          withCloseButton={!model.createUser.isPending}
        >
          <Stack gap="md">
            <Text size="sm">
              Add <strong>{model.newUserName.trim()}</strong> (
              {model.newUserEmail.trim()}) as{' '}
              <strong>
                {model.newUserRole
                  ? getCompanyRoleDefinition(model.newUserRole).label
                  : ''}
              </strong>
              ?
            </Text>
            <Alert color="blue" title="Existing accounts">
              If this email already belongs to a company member, no role will be
              changed here. Use Current members to review and confirm an
              existing member's role change.
            </Alert>
            {model.newUserRole ? (
              <RolePermissionSummary
                definition={getCompanyRoleDefinition(model.newUserRole)}
              />
            ) : null}
            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={model.createUser.isPending}
                onClick={() => model.setActiveModal(null)}
              >
                Cancel
              </Button>
              <Button
                loading={model.createUser.isPending}
                onClick={async () => {
                  try {
                    await model.submitCompanyInvite();
                    model.setActiveModal(null);
                  } catch {
                    // The controller owns the visible mutation error. Keep the
                    // confirmation open so the administrator can safely retry.
                  }
                }}
              >
                Confirm member access
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Paper>
  );
}

function CompanyOperationsSettingsCard({
  model,
}: {
  model: CompanySettingsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Current members</Title>
        <Text size="sm" c="dimmed">
          Update a teammate's company role or remove them from the company
          entirely.
        </Text>
        {model.membershipError ? (
          <Alert color="red">{model.membershipError}</Alert>
        ) : null}
        {model.membershipStatus ? (
          <Alert color="green">{model.membershipStatus}</Alert>
        ) : null}
        {model.isHydrated ? (
          <CompanyMembershipRoleEditor
            userOptions={model.userOptions}
            selectedUserId={model.effectiveRoleUserId}
            currentRole={model.selectedMembership?.role ?? null}
            selectedRole={model.effectiveMembershipCompanyRole}
            selectedUserIsSelf={model.selectedMembershipIsSelf}
            wouldDemoteLastAdmin={model.wouldDemoteLastAdmin}
            isPending={model.upsertCompanyMembership.isPending}
            onUserChange={(userId) =>
              model.dispatchMembership({
                type: 'selectUser',
                userId,
                currentRole:
                  model.membershipRows.find((row) => row.userId === userId)
                    ?.role ?? null,
              })
            }
            onRoleChange={(role) =>
              model.dispatchMembership({
                type: 'selectRole',
                role,
              })
            }
            onSubmit={async () => {
              if (
                !model.effectiveRoleUserId ||
                !model.effectiveMembershipCompanyRole
              )
                return;
              const userId = model.effectiveRoleUserId;
              const role = model.effectiveMembershipCompanyRole;
              const shouldLeaveSettings = model.wouldLoseCompanySettingsAccess;
              model.dispatchMembership({ type: 'start' });
              try {
                await model.upsertCompanyMembership.mutateAsync({
                  userId,
                  role,
                });
                model.dispatchMembership({
                  type: 'success',
                  message: 'Company role updated.',
                });
                if (shouldLeaveSettings) {
                  try {
                    await model.router.navigate({
                      to: companyDashboardIndexRoute.to,
                      params: { companyId: model.companyId },
                      search: (previous) => ({
                        ...previous,
                        tab: 'projects',
                      }),
                      replace: true,
                    });
                  } catch (error) {
                    showAppToast({
                      tone: 'error',
                      title: 'Company role updated',
                      message:
                        error instanceof Error
                          ? `Access was updated, but navigation failed: ${error.message}`
                          : 'Access was updated, but navigation failed. Return to the company projects tab before continuing.',
                    });
                  }
                }
              } catch (err) {
                model.dispatchMembership({
                  type: 'fail',
                  message:
                    err instanceof Error
                      ? err.message
                      : 'Could not update company role.',
                });
                throw err;
              }
            }}
          />
        ) : (
          <Paper className={classes.surfaceMuted} radius="xl" p="md">
            <Text size="sm" c="dimmed">
              Loading role controls...
            </Text>
          </Paper>
        )}
        <Divider />
        <div className={classes.tableWrap}>
          {model.isHydrated ? (
            <MantineReactTable
              columns={model.membershipColumns}
              data={model.membershipRows}
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
                pagination: {
                  pageIndex: 0,
                  pageSize: model.isMobile ? 5 : 8,
                },
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
  );
}

function CompanySettingsPanelView({
  model,
}: {
  model: CompanySettingsPanelController;
}) {
  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Title order={5}>Company settings</Title>
            {model.highestRoleBadge}
          </Group>
          <Text size="sm" c="dimmed">
            Manage company-wide standards, access, exports, and member roles.
            Project-specific settings remain in each project workspace.
          </Text>
        </Stack>
      </Paper>

      <CompanyExportPanel
        companyId={model.companyId}
        initialExportJobId={model.initialExportJobId}
        canExportCompany={model.canExportCompany}
        isHydrated={model.isHydrated}
      />

      <CompanyDetailsSettingsCard model={model} />

      <CompanyMembershipSettingsCard model={model} />

      <CompanyOperationsSettingsCard model={model} />

      <CompanyDefaultTaxonomyModal
        opened={model.activeModal === 'defaults'}
        onClose={() => model.setActiveModal(null)}
        companyId={model.companyId}
        readOnly={!model.canEditCompanyDefaults}
      />
      <CompanyDefaultMappingsModal
        opened={model.activeModal === 'mappings'}
        onClose={() => model.setActiveModal(null)}
        companyId={model.companyId}
        readOnly={!model.canEditCompanyDefaults}
      />
      <CompanyImportRulesModal
        opened={model.activeModal === 'importRules'}
        onClose={() => model.setActiveModal(null)}
        companyId={model.companyId}
        readOnly={!model.canEditCompanyDefaults}
      />
      <RuleSuggestionsModal
        opened={model.activeModal === 'ruleSuggestions'}
        onClose={() => model.setActiveModal(null)}
        companyId={model.companyId}
        readOnly={!model.canEditCompanyDefaults}
      />
    </Stack>
  );
}

export default function CompanySettingsPanel(
  props: Parameters<typeof useCompanySettingsPanelController>[0]
) {
  const model = useCompanySettingsPanelController(props);
  return <CompanySettingsPanelView model={model} />;
}
