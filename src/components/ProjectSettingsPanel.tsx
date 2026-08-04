import { useMemo, useState } from 'react';
import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from '@tanstack/react-router';

import type { CompanyId, ProjectId, ProjectRole, UserId } from '../types';
import { useIsHydrated } from '../hooks/useIsHydrated';

import {
  useProjectQuery,
  useProjectsQuery,
  useUsersQuery,
} from '../queries/reference';
import { useUpdateProjectMutation } from '../queries/admin';
import { useApplyCompanyStandardsMutation } from '../queries/taxonomy';
import { useBudgets } from '../hooks/useBudgets';
import {
  useCompanyMembershipsQuery,
  useProjectMembershipsQuery,
  useUpsertProjectMembershipMutation,
  useDeleteProjectMembershipMutation,
} from '../queries/memberships';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { getCompanyUsers } from '../store/access';
import { companyRoute } from '../router';
import { Route as projectWorkspaceRoute } from '../routes/_authed.c.$companyId.p.$projectId';
import ProjectAutoCodingRulesModal from './ProjectAutoCodingRulesModal';
import ProjectImportRulesModal from './ProjectImportRulesModal';
import ProjectSettingControls from './settings/ProjectSettingControls';
import TaxonomyManagerModal from './TaxonomyManagerModal';
import classes from '../styles/ui.module.css';
import { showAppToast } from '../utils/toast';
import ProjectMembershipRoleEditor from './projectSettings/ProjectMembershipRoleEditor';
import AccessRemovalButton from './access/AccessRemovalButton';
import { getProjectRoleDefinition } from '../access/roleDefinitions';

function useProjectSettingsPanelController(props: {
  companyId: CompanyId;
  projectId: ProjectId;
  onSettingsAccessLost: () => void;
}) {
  const { companyId, onSettingsAccessLost, projectId } = props;
  const loaderData = projectWorkspaceRoute.useLoaderData();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useIsHydrated();
  const router = useRouter();

  const project = useProjectQuery(projectId);
  const projects = useProjectsQuery(companyId);
  const usersQ = useUsersQuery();
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);
  const projectMembershipsQ = useProjectMembershipsQuery(projectId);
  const reapplyCompanyStandards = useApplyCompanyStandardsMutation(
    projectId,
    companyId
  );

  const access = useCompanyAccess(companyId);
  const updateProjectStructure = useUpdateProjectMutation(companyId, {
    projectId,
    setting: 'structure',
  });
  const updateProjectCurrency = useUpdateProjectMutation(companyId, {
    projectId,
    setting: 'currency',
  });
  const updateProjectVisibility = useUpdateProjectMutation(companyId, {
    projectId,
    setting: 'visibility',
  });
  const updateSuperadminAccess = useUpdateProjectMutation(companyId, {
    projectId,
    setting: 'superadmin-access',
  });
  const updateCompanyStandardsSync = useUpdateProjectMutation(companyId, {
    projectId,
    setting: 'company-standards-sync',
  });
  const updateTransactionTransfers = useUpdateProjectMutation(companyId, {
    projectId,
    setting: 'transaction-transfers',
  });
  const effectiveProject = useMemo(
    () => ({
      id: projectId,
      projectType:
        (isHydrated ? project.data?.projectType : undefined) ??
        loaderData?.projectType ??
        'project',
      currency:
        (isHydrated ? project.data?.currency : undefined) ??
        loaderData?.currencyCode ??
        'AUD',
      visibility:
        (isHydrated ? project.data?.visibility : undefined) ??
        loaderData?.projectVisibility ??
        'private',
      parentProjectId:
        (isHydrated ? project.data?.parentProjectId : undefined) ??
        loaderData?.parentProjectId ??
        null,
      allowSuperadminAccess:
        (isHydrated ? project.data?.allowSuperadminAccess : undefined) ??
        loaderData?.allowSuperadminAccess ??
        false,
      syncCompanyDefaults:
        (isHydrated ? project.data?.syncCompanyDefaults : undefined) ?? false,
      allowTxnTransfers:
        (isHydrated ? project.data?.allowTxnTransfers : undefined) ??
        loaderData?.allowTxnTransfers ??
        false,
    }),
    [
      isHydrated,
      loaderData?.allowSuperadminAccess,
      loaderData?.allowTxnTransfers,
      loaderData?.currencyCode,
      loaderData?.parentProjectId,
      loaderData?.projectType,
      loaderData?.projectVisibility,
      project.data?.allowSuperadminAccess,
      project.data?.allowTxnTransfers,
      project.data?.currency,
      project.data?.parentProjectId,
      project.data?.projectType,
      project.data?.syncCompanyDefaults,
      project.data?.visibility,
      projectId,
    ]
  );

  const canEditProject = isHydrated
    ? access.can('project:edit', projectId)
    : (loaderData?.canProjectEdit ?? false);
  const canEditCompanyStructure = isHydrated
    ? access.can('project:configure', projectId)
    : (loaderData?.canEditCompanyStructure ?? false);
  const effectiveIsSuperadmin = isHydrated
    ? access.isSuperadmin
    : (loaderData?.isGlobalSuperadmin ?? false);
  const canManageTransferCapability =
    canEditCompanyStructure &&
    (!effectiveIsSuperadmin || effectiveProject.allowSuperadminAccess);
  const canEditBudgets =
    effectiveProject.projectType === 'project' &&
    (isHydrated ? access.can('budget:edit', projectId) : false);
  const canEditTaxonomy =
    effectiveProject.projectType === 'project' &&
    (isHydrated ? access.can('taxonomy:edit', projectId) : false);
  const settingsBudgets = useBudgets({
    companyId,
    projectId,
    enabled: effectiveProject.projectType === 'project',
  });
  const settingsTaxonomy = useTaxonomy({
    companyId,
    projectId,
    budgets: settingsBudgets,
    canEditBudgets,
    enabled: effectiveProject.projectType === 'project',
  });
  const programmeOptions = useMemo(
    () =>
      (projects.data ?? [])
        .filter(
          (candidate) =>
            candidate.id !== projectId &&
            candidate.status === 'active' &&
            candidate.projectType === 'programme' &&
            candidate.currency === effectiveProject.currency
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((candidate) => ({ value: candidate.id, label: candidate.name })),
    [effectiveProject.currency, projectId, projects.data]
  );

  const companyUsers = useMemo(
    () =>
      getCompanyUsers(
        companyId,
        usersQ.data ?? [],
        companyMembershipsQ.data ?? []
      ),
    [companyId, usersQ.data, companyMembershipsQ.data]
  );

  const userOptions = useMemo(
    () =>
      companyUsers.map((u) => ({
        value: u.id,
        label: `${u.name} (${u.email})`,
      })),
    [companyUsers]
  );

  const [memberUserId, setMemberUserId] = useState<UserId | null>(null);
  const [memberRole, setMemberRole] = useState<ProjectRole | null>('member');
  const [taxonomyModalOpen, setTaxonomyModalOpen] = useState(false);
  const [projectRulesModalOpen, setProjectRulesModalOpen] = useState(false);
  const [projectImportRulesModalOpen, setProjectImportRulesModalOpen] =
    useState(false);

  const upsert = useUpsertProjectMembershipMutation(projectId);
  const del = useDeleteProjectMembershipMutation(projectId);
  const members = useMemo(
    () => projectMembershipsQ.data ?? [],
    [projectMembershipsQ.data]
  );
  const memberRows = useMemo(
    () =>
      members.reduce<
        Array<{
          key: string;
          userId: UserId;
          role: ProjectRole;
          name: string;
          email: string;
        }>
      >((rows, membership) => {
        if (!companyUsers.some((user) => user.id === membership.userId)) {
          return rows;
        }
        const user = (usersQ.data ?? []).find(
          (candidate) => candidate.id === membership.userId
        );
        rows.push({
          key: `${membership.projectId}:${membership.userId}:${membership.role}:${rows.length}`,
          userId: membership.userId,
          role: membership.role,
          name: user?.name ?? String(membership.userId),
          email: user?.email ?? '',
        });
        return rows;
      }, []),
    [members, companyUsers, usersQ.data]
  );
  const selectedMember = useMemo(
    () =>
      memberRows.find((membership) => membership.userId === memberUserId) ??
      null,
    [memberRows, memberUserId]
  );
  const ownerCount = useMemo(
    () => memberRows.filter((membership) => membership.role === 'owner').length,
    [memberRows]
  );
  const selectedMemberIsSelf = memberUserId === access.userId;
  const wouldRemoveLastOwner =
    selectedMember?.role === 'owner' &&
    ownerCount <= 1 &&
    memberRole !== 'owner';
  const wouldLoseSettingsAccess =
    selectedMemberIsSelf &&
    (selectedMember?.role === 'owner' || selectedMember?.role === 'lead') &&
    (memberRole === 'member' || memberRole === 'viewer') &&
    !access.isAdmin &&
    !access.isExecutive &&
    !access.isSuperadmin;

  const memberColumns = useMemo<MRT_ColumnDef<(typeof memberRows)[number]>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'User',
        Cell: ({ row }) => (
          <Stack gap={2}>
            <Text className="table-body-left-bold">{row.original.name}</Text>
            {row.original.email ? (
              <Text className="table-body-left" c="dimmed">
                {row.original.email}
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
            {getProjectRoleDefinition(row.original.role).label}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        Cell: ({ row }) => {
          const isOnlyOwner = row.original.role === 'owner' && ownerCount <= 1;
          const wouldRemoveOwnProjectAccess =
            row.original.userId === access.userId &&
            !access.isAdmin &&
            !access.isExecutive &&
            !access.isSuperadmin;
          return (
            <AccessRemovalButton
              userLabel={row.original.name}
              scopeLabel="this project"
              consequence={`${row.original.name} will lose their explicit project role. A company Admin or Executive may still retain company-level access.`}
              disabledReason={
                !canEditProject
                  ? 'You cannot administer this project.'
                  : isOnlyOwner
                    ? 'Assign another project Owner before removing the only Owner.'
                    : undefined
              }
              isPending={del.isPending}
              onConfirm={async () => {
                await del.mutateAsync({
                  userId: row.original.userId,
                  role: row.original.role,
                });
                if (wouldRemoveOwnProjectAccess) {
                  try {
                    await router.navigate({
                      to: companyRoute.to,
                      params: { companyId },
                    });
                  } catch (error) {
                    showAppToast({
                      tone: 'error',
                      title: 'Project access removed',
                      message:
                        error instanceof Error
                          ? `Access was removed, but navigation failed: ${error.message}`
                          : 'Access was removed, but navigation failed. Return to the company page before continuing.',
                    });
                  }
                }
              }}
            />
          );
        },
      },
    ],
    [access, canEditProject, companyId, del, ownerCount, router]
  );

  return {
    access,
    canEditCompanyStructure,
    canEditProject,
    canEditTaxonomy,
    canManageTransferCapability,
    companyId,
    effectiveProject,
    isHydrated,
    isMobile,
    memberColumns,
    memberRole,
    memberRows,
    memberUserId,
    ownerCount,
    onSettingsAccessLost,
    programmeOptions,
    projectId,
    projectImportRulesModalOpen,
    projectRulesModalOpen,
    reapplyCompanyStandards,
    router,
    setMemberRole,
    setMemberUserId,
    setProjectImportRulesModalOpen,
    setProjectRulesModalOpen,
    setTaxonomyModalOpen,
    selectedMember,
    selectedMemberIsSelf,
    settingsTaxonomy,
    taxonomyModalOpen,
    updateCompanyStandardsSync,
    updateProjectCurrency,
    updateProjectStructure,
    updateProjectVisibility,
    updateSuperadminAccess,
    updateTransactionTransfers,
    upsert,
    userOptions,
    wouldLoseSettingsAccess,
    wouldRemoveLastOwner,
  };
}

type ProjectSettingsPanelController = ReturnType<
  typeof useProjectSettingsPanelController
>;

function ProjectStructureSettingsCard({
  model,
}: {
  model: ProjectSettingsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Title order={5}>Project settings</Title>
          <Badge variant="light" color={model.canEditProject ? 'teal' : 'red'}>
            {model.canEditProject ? 'Can edit project' : 'Read-only'}
          </Badge>
        </Group>
        <ProjectSettingControls
          projectType={model.effectiveProject.projectType}
          parentProjectId={model.effectiveProject.parentProjectId}
          currency={model.effectiveProject.currency}
          visibility={model.effectiveProject.visibility}
          allowSuperadminAccess={model.effectiveProject.allowSuperadminAccess}
          syncCompanyDefaults={model.effectiveProject.syncCompanyDefaults}
          allowTxnTransfers={model.effectiveProject.allowTxnTransfers}
          programmeOptions={model.programmeOptions}
          canEditProject={model.canEditProject}
          canEditCompanyStructure={model.canEditCompanyStructure}
          canManageTransferCapability={model.canManageTransferCapability}
          isMobile={model.isMobile}
          onSaveStructure={async (value) => {
            await model.updateProjectStructure.mutateAsync({
              id: model.projectId,
              projectType: value.projectType,
              parentProjectId: value.parentProjectId,
            });
          }}
          onSaveCurrency={async (value) => {
            await model.updateProjectCurrency.mutateAsync({
              id: model.projectId,
              currency: value,
            });
          }}
          onSaveVisibility={async (value) => {
            await model.updateProjectVisibility.mutateAsync({
              id: model.projectId,
              visibility: value,
            });
          }}
          onSaveSuperadminAccess={async (value) => {
            await model.updateSuperadminAccess.mutateAsync({
              id: model.projectId,
              allowSuperadminAccess: value,
            });
          }}
          onSuperadminAccessSaved={(value) => {
            if (!model.access.isSuperadmin || value) return;
            void model.router
              .navigate({
                to: companyRoute.to,
                params: { companyId: model.companyId },
              })
              .catch((error: unknown) => {
                showAppToast({
                  tone: 'error',
                  title: 'Project access updated',
                  message:
                    error instanceof Error
                      ? `Access was updated, but navigation failed: ${error.message}`
                      : 'Access was updated, but navigation failed. Return to the company page before continuing.',
                });
              });
          }}
          onSaveSyncCompanyDefaults={async (value) => {
            const updatedProject =
              await model.updateCompanyStandardsSync.mutateAsync({
                id: model.projectId,
                syncCompanyDefaults: value,
              });
            return updatedProject.syncCompanyDefaults;
          }}
          onSaveAllowTxnTransfers={async (value) => {
            const updatedProject =
              await model.updateTransactionTransfers.mutateAsync({
                id: model.projectId,
                allowTxnTransfers: value,
              });
            return updatedProject.allowTxnTransfers;
          }}
        />
      </Stack>
    </Paper>
  );
}

function ProjectMembershipSettingsCard({
  model,
}: {
  model: ProjectSettingsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Project Standards Alignment</Title>
        <Text size="sm" c="dimmed">
          Synced projects can inherit company categories, import rules, and
          auto-coding while still keeping justified project-only exceptions.
        </Text>
        <Group gap="sm" wrap="wrap">
          <Badge
            variant="light"
            color={model.effectiveProject.syncCompanyDefaults ? 'teal' : 'gray'}
          >
            {model.effectiveProject.syncCompanyDefaults
              ? 'Company standards sync on'
              : 'Company standards sync off'}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          Use the category, auto-coding, and import-rule managers here to review
          inherited, overridden, and detached standards. Stable project patterns
          can be promoted up to the company standards set.
        </Text>
        <Group gap="sm" wrap="wrap">
          <Button
            variant="default"
            disabled={
              model.effectiveProject.projectType !== 'project' ||
              !model.canEditTaxonomy
            }
            loading={model.reapplyCompanyStandards.isPending}
            onClick={async () => {
              try {
                const result =
                  await model.reapplyCompanyStandards.mutateAsync();
                if (!result.companyDefaultsConfigured) {
                  showAppToast({
                    tone: 'success',
                    title: 'Company standards reapplied',
                    message:
                      'Company import and auto-coding rules were resynced. No company categories are configured yet, so no categories or subcategories were added.',
                  });
                  return;
                }
                showAppToast({
                  tone: 'success',
                  title: 'Company standards reapplied',
                  message:
                    result.categoriesAdded === 0 &&
                    result.subCategoriesAdded === 0
                      ? 'Project categories were refreshed and company import and auto-coding rules were resynced.'
                      : `Added ${result.categoriesAdded} categories and ${result.subCategoriesAdded} subcategories, then resynced company import and auto-coding rules.`,
                  autoClose: 9000,
                });
              } catch (error) {
                showAppToast({
                  tone: 'error',
                  title: 'Could not reapply company standards',
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Please try again.',
                });
              }
            }}
          >
            Reapply Company Standards
          </Button>
          <Button
            variant="default"
            disabled={
              model.effectiveProject.projectType !== 'project' ||
              !model.canEditTaxonomy
            }
            onClick={() => model.setTaxonomyModalOpen(true)}
          >
            Manage Project Categories
          </Button>
          <Button
            variant="default"
            disabled={!model.canEditProject}
            onClick={() => model.setProjectRulesModalOpen(true)}
          >
            Manage Auto-Coding Rules
          </Button>
          <Button
            variant="default"
            disabled={!model.canEditProject}
            onClick={() => model.setProjectImportRulesModalOpen(true)}
          >
            Manage Import Rules
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function ProjectBudgetSettingsCard({
  model,
}: {
  model: ProjectSettingsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Assign team members</Title>
        <ProjectMembershipRoleEditor
          userOptions={model.userOptions}
          selectedUserId={model.memberUserId}
          currentRole={model.selectedMember?.role ?? null}
          selectedRole={model.memberRole}
          selectedUserIsSelf={model.selectedMemberIsSelf}
          wouldRemoveLastOwner={model.wouldRemoveLastOwner}
          wouldLoseSettingsAccess={model.wouldLoseSettingsAccess}
          canEdit={model.canEditProject}
          isPending={model.upsert.isPending}
          onUserChange={(userId) => {
            model.setMemberUserId(userId);
            model.setMemberRole(
              model.memberRows.find(
                (membership) => membership.userId === userId
              )?.role ?? 'member'
            );
          }}
          onRoleChange={model.setMemberRole}
          onSubmit={async () => {
            if (!model.memberUserId || !model.memberRole) return;
            const shouldLeaveSettings = model.wouldLoseSettingsAccess;
            await model.upsert.mutateAsync({
              userId: model.memberUserId,
              role: model.memberRole,
            });
            if (shouldLeaveSettings) {
              model.onSettingsAccessLost();
            }
          }}
        />
        <Text size="sm" c="dimmed">
          New assignments and changes to existing roles use the same database
          membership row. Every change is reviewed before it is saved. Company
          settings manages company-level roles separately.
        </Text>
      </Stack>
    </Paper>
  );
}

function ProjectTaxonomySettingsCard({
  model,
}: {
  model: ProjectSettingsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Current members</Title>
        <div className={classes.tableWrap}>
          {model.isHydrated ? (
            <MantineReactTable
              columns={model.memberColumns}
              data={model.memberRows}
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
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  Loading project members...
                </Text>
              </Stack>
            </Paper>
          )}
        </div>
      </Stack>
    </Paper>
  );
}

function ProjectSettingsPanelView({
  model,
}: {
  model: ProjectSettingsPanelController;
}) {
  return (
    <Stack gap="lg" className={classes.pageStack}>
      <ProjectStructureSettingsCard model={model} />

      <ProjectMembershipSettingsCard model={model} />

      <ProjectBudgetSettingsCard model={model} />

      <ProjectTaxonomySettingsCard model={model} />

      <ProjectAutoCodingRulesModal
        opened={model.projectRulesModalOpen}
        onClose={() => model.setProjectRulesModalOpen(false)}
        companyId={model.companyId}
        projectId={model.projectId}
        readOnly={!model.canEditProject}
      />
      <ProjectImportRulesModal
        opened={model.projectImportRulesModalOpen}
        onClose={() => model.setProjectImportRulesModalOpen(false)}
        companyId={model.companyId}
        projectId={model.projectId}
        readOnly={!model.canEditProject}
      />

      <TaxonomyManagerModal
        opened={model.taxonomyModalOpen}
        onClose={() => model.setTaxonomyModalOpen(false)}
        taxonomy={model.settingsTaxonomy}
        readOnly={!model.canEditTaxonomy}
      />
    </Stack>
  );
}

export default function ProjectSettingsPanel(
  props: Parameters<typeof useProjectSettingsPanelController>[0]
) {
  const model = useProjectSettingsPanelController(props);
  return <ProjectSettingsPanelView model={model} />;
}
