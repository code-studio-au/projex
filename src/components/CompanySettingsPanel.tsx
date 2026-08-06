import { useCallback, useMemo, useReducer } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
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

import type { CompanyId, CompanyRole } from '../types';
import { useIsHydrated } from '../hooks/useIsHydrated';

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
import { validateNewCompanyUserEmail } from './companySettings/companyUserValidation';
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
  emailError: string | null;
};

type InviteAction =
  | { type: 'setName'; value: string }
  | { type: 'setEmail'; value: string }
  | { type: 'setRole'; value: CompanyRole | null }
  | { type: 'setSendOnboardingEmail'; value: boolean }
  | { type: 'start' }
  | { type: 'success'; message: string; resetForm?: boolean }
  | { type: 'failEmail'; message: string }
  | { type: 'fail'; message: string };

const initialInviteState: InviteState = {
  name: '',
  email: '',
  role: 'member',
  sendOnboardingEmail: true,
  status: null,
  error: null,
  emailError: null,
};

function inviteReducer(state: InviteState, action: InviteAction): InviteState {
  if (action.type === 'setName') return { ...state, name: action.value };
  if (action.type === 'setEmail') {
    return {
      ...state,
      email: action.value,
      emailError: null,
      status: null,
    };
  }
  if (action.type === 'setRole') return { ...state, role: action.value };
  if (action.type === 'setSendOnboardingEmail') {
    return { ...state, sendOnboardingEmail: action.value };
  }
  if (action.type === 'start') {
    return { ...state, status: null, error: null, emailError: null };
  }
  if (action.type === 'success') {
    return {
      ...(action.resetForm ? initialInviteState : state),
      status: action.message,
      error: null,
      emailError: null,
    };
  }
  if (action.type === 'failEmail') {
    return { ...state, status: null, error: null, emailError: action.message };
  }
  return { ...state, status: null, error: action.message };
}

type MembershipEditorState = {
  error: string | null;
  status: string | null;
};

type MembershipEditorAction =
  | { type: 'start' }
  | { type: 'success'; message: string }
  | { type: 'fail'; message: string };

const initialMembershipEditorState: MembershipEditorState = {
  error: null,
  status: null,
};

function membershipEditorReducer(
  state: MembershipEditorState,
  action: MembershipEditorAction
): MembershipEditorState {
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
  const companyUsersLoading =
    (usersQ.isPending && !usersQ.data) ||
    (companyMembershipsQ.isPending && !companyMembershipsQ.data);

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
    emailError: inviteEmailError,
  } = inviteState;
  const [membershipState, dispatchMembership] = useReducer(
    membershipEditorReducer,
    initialMembershipEditorState
  );
  const { error: membershipError, status: membershipStatus } = membershipState;
  const [activeModal, setActiveModal] = useReducer(
    companySettingsModalReducer,
    initialReview === 'rule-suggestions' ? 'ruleSuggestions' : null
  );

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

  function reviewCompanyInvite() {
    const emailError = validateNewCompanyUserEmail(newUserEmail, companyUsers);
    if (emailError) {
      dispatchInvite({
        type: 'failEmail',
        message: emailError,
      });
      return;
    }

    dispatchInvite({ type: 'start' });
    setActiveModal('invite');
  }

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
          message:
            result.onboardingDelivery === 'email'
              ? `${result.user.email} was added to the company and sent an invite email. Ask them to check spam or junk if it does not arrive soon.`
              : `${result.user.email} was added to the company. Email delivery is not configured, so the invite link was logged on the server instead.`,
        });
        return;
      }
      dispatchInvite({
        type: 'success',
        resetForm: true,
        message: `${result.user.email} was added to the company. No invite email was sent. You can use Resend invite from the Users table later if needed.`,
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

  const updateCompanyMemberRole = useCallback(
    async (
      row: (typeof membershipRows)[number],
      role: CompanyRole
    ): Promise<void> => {
      const shouldLeaveSettings = row.isSelf && role === 'member';
      dispatchMembership({ type: 'start' });
      try {
        await upsertCompanyMembership.mutateAsync({
          userId: row.userId,
          role,
        });
        dispatchMembership({
          type: 'success',
          message: `${row.userName}'s company role was updated.`,
        });
        if (shouldLeaveSettings) {
          try {
            await router.navigate({
              to: companyDashboardIndexRoute.to,
              params: { companyId },
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
        dispatchMembership({
          type: 'fail',
          message:
            err instanceof Error
              ? err.message
              : 'Could not update company role.',
        });
        throw err;
      }
    },
    [companyId, router, upsertCompanyMembership]
  );

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
        size: 360,
        minSize: 360,
        Cell: ({ row }) => (
          <Group gap="xs" wrap="wrap" className="tableActionGroup">
            <CompanyMembershipRoleEditor
              userLabel={row.original.userName}
              currentRole={row.original.role}
              isSelf={row.original.isSelf}
              isOnlyAdmin={row.original.isOnlyAdmin}
              canEdit={canAddCompanyUsers}
              isPending={upsertCompanyMembership.isPending}
              onSubmit={(role) => updateCompanyMemberRole(row.original, role)}
            />
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
              disabled={row.original.isOnlyAdmin}
              disabledReason={
                !canAddCompanyUsers
                  ? 'Only company Admins can remove company members.'
                  : row.original.isSelf
                    ? 'You cannot remove your own company membership.'
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
    [
      canAddCompanyUsers,
      removeCompanyMember,
      sendInviteEmail,
      updateCompanyMemberRole,
      upsertCompanyMembership.isPending,
    ]
  );

  return {
    activeModal,
    canAddCompanyUsers,
    canEditCompanyDefaults,
    canExportCompany,
    companyDefaultsLoading,
    companyId,
    companyImportRulesQ,
    companyUsersLoading,
    createUser,
    dispatchInvite,
    effectiveDefaults,
    highestRoleBadge,
    initialExportJobId,
    inviteEmailError,
    inviteError,
    inviteStatus,
    isHydrated,
    isMobile,
    membershipColumns,
    membershipError,
    membershipRows,
    membershipStatus,
    newUserEmail,
    newUserName,
    newUserRole,
    reviewCompanyInvite,
    ruleSuggestionsQ,
    sendOnboardingEmail,
    submitCompanyInvite,
    setActiveModal,
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
        <Title order={5}>Add company user</Title>
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
            error={model.inviteEmailError}
            classNames={{ error: classes.formValidationError }}
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
            label="Send invite email"
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
                model.companyUsersLoading ||
                model.createUser.isPending ||
                !model.newUserName.trim() ||
                !model.newUserEmail.trim() ||
                !model.newUserRole
              }
              onClick={model.reviewCompanyInvite}
            >
              Add Company User
            </Button>
          </Group>
        </Stack>
        <Modal
          opened={model.activeModal === 'invite'}
          onClose={() => model.setActiveModal(null)}
          title="Review company user access"
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
                Confirm and add user
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Paper>
  );
}

function CompanyUsersSettingsCard({
  model,
}: {
  model: CompanySettingsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Users</Title>
        <Text size="sm" c="dimmed">
          Change company roles, resend invites, or remove users from the
          company.
        </Text>
        {model.membershipError ? (
          <Alert color="red">{model.membershipError}</Alert>
        ) : null}
        {model.membershipStatus ? (
          <Alert color="green">{model.membershipStatus}</Alert>
        ) : null}
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

      <CompanyUsersSettingsCard model={model} />

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
