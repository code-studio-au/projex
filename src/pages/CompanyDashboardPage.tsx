import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Link, useRouter } from '@tanstack/react-router';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';
import 'mantine-react-table-open/styles.css';
import { useMediaQuery } from '@mantine/hooks';

import { useIsHydrated } from '../hooks/useIsHydrated';
import type { CompanyId, Project, ProjectId } from '../types';
import { asCompanyId, asUserId } from '../types';
import {
  useCompanyQuery,
  useCompanyWorkQueueQuery,
  useProjectsQuery,
  useUsersQuery,
} from '../queries/reference';
import {
  useCreateProjectMutation,
  useDeactivateProjectMutation,
  useDeleteProjectMutation,
  useReactivateProjectMutation,
} from '../queries/admin';
import { LoadingLine } from '../components/LoadingValue';
import { companyRoute, landingRoute, projectRoute } from '../router';
import { Route as companyDashboardIndexRoute } from '../routes/_authed.c.$companyId.index';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useAllCompanyMembershipsQuery } from '../queries/memberships';
import classes from '../styles/ui.module.css';

const CompanySummaryPanel = lazy(
  () => import('../components/CompanySummaryPanel')
);
const CompanySettingsPanel = lazy(
  () => import('../components/CompanySettingsPanel')
);

type CompanyDashboardTab = 'summary' | 'projects' | 'settings';

function toCompanyDashboardTab(value: string | null): CompanyDashboardTab {
  if (value === 'summary' || value === 'projects' || value === 'settings') {
    return value;
  }
  return 'projects';
}

function useCompanyDashboardPageController() {
  const { companyId: rawCompanyId } = companyRoute.useParams();
  const loaderData = companyRoute.useLoaderData();
  const dashboardSearch = companyDashboardIndexRoute.useSearch();
  const companyId: CompanyId = asCompanyId(rawCompanyId);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const router = useRouter();
  const isHydrated = useIsHydrated();

  const companyQ = useCompanyQuery(companyId);
  const projectsQ = useProjectsQuery(companyId);

  const access = useCompanyAccess(companyId);
  const canUpdateCompanyDetails = access.can('company:update_details');
  const canManageCompanyMembers = access.can('company:manage_members');
  const canManageCompanyDefaults = access.can('company:manage_defaults');
  const membershipsQ = useAllCompanyMembershipsQuery();
  const usersQ = useUsersQuery();

  const createProject = useCreateProjectMutation(companyId);

  const deactivateProject = useDeactivateProjectMutation(companyId);
  const reactivateProject = useReactivateProjectMutation(companyId);
  const deleteProject = useDeleteProjectMutation(companyId);
  const canAccessSettings = isHydrated
    ? canUpdateCompanyDetails ||
      canManageCompanyMembers ||
      canManageCompanyDefaults
    : (loaderData?.canAccessSettings ?? false);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] =
    useState<Project['projectType']>('project');
  const [newProjectCurrency, setNewProjectCurrency] =
    useState<Project['currency']>('AUD');
  const [newProjectParentId, setNewProjectParentId] =
    useState<ProjectId | null>(null);
  const [newProjectApplyCompanyStandards, setNewProjectApplyCompanyStandards] =
    useState(true);
  const [newProjectOwnerId, setNewProjectOwnerId] = useState<string | null>(
    null
  );

  const rows = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const groupedProjects = useMemo(() => {
    const projectsById = new Map(rows.map((project) => [project.id, project]));
    const childProjectsByParent = new Map<ProjectId, Project[]>();
    const topLevelProjects: Project[] = [];

    for (const project of rows) {
      if (
        project.parentProjectId &&
        projectsById.get(project.parentProjectId)?.projectType ===
          'programme' &&
        projectsById.get(project.parentProjectId)?.status === 'active'
      ) {
        const current =
          childProjectsByParent.get(project.parentProjectId) ?? [];
        current.push(project);
        childProjectsByParent.set(project.parentProjectId, current);
      } else {
        topLevelProjects.push(project);
      }
    }

    return topLevelProjects.flatMap((project) => [
      { ...project, isChild: false },
      ...(project.projectType === 'programme'
        ? [...(childProjectsByParent.get(project.id) ?? [])]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((childProject) => ({
              ...childProject,
              isChild: true,
            }))
        : []),
    ]);
  }, [rows]);
  const programmeOptions = useMemo(
    () =>
      rows
        .filter(
          (project) =>
            project.status === 'active' &&
            project.projectType === 'programme' &&
            project.currency === newProjectCurrency
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((project) => ({ value: project.id, label: project.name })),
    [newProjectCurrency, rows]
  );
  const programmeNameById = useMemo(
    () =>
      new Map(
        rows.flatMap((project) =>
          project.projectType === 'programme'
            ? [[project.id, project.name] as const]
            : []
        )
      ),
    [rows]
  );
  const memberships = useMemo(
    () => membershipsQ.data ?? [],
    [membershipsQ.data]
  );
  const eligibleInitialOwnerOptions = useMemo(() => {
    const companyMemberIds = new Set(
      memberships.flatMap((membership) =>
        membership.companyId === companyId ? [membership.userId] : []
      )
    );
    return (usersQ.data ?? [])
      .filter(
        (user) => companyMemberIds.has(user.id) && !user.isGlobalSuperadmin
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => ({
        value: user.id,
        label: `${user.name} (${user.email})`,
      }));
  }, [companyId, memberships, usersQ.data]);
  const effectiveNewProjectOwnerId =
    newProjectOwnerId ?? eligibleInitialOwnerOptions[0]?.value ?? null;
  const hasEligibleInitialOwners = eligibleInitialOwnerOptions.length > 0;
  const userCompanyCount = useMemo(() => {
    const ids = new Set(
      memberships.flatMap((membership) =>
        membership.userId === access.userId ? [membership.companyId] : []
      )
    );
    return ids.size;
  }, [memberships, access.userId]);
  const isGlobalSuperadmin = isHydrated
    ? ((usersQ.data ?? []).find((user) => user.id === access.userId)
        ?.isGlobalSuperadmin ?? access.isSuperadmin)
    : (loaderData?.isGlobalSuperadmin ?? false);
  const superadminNeedsInitialOwner = isGlobalSuperadmin;
  const canViewCompanySummary = isHydrated
    ? access.isAdmin ||
      access.isExecutive ||
      (isGlobalSuperadmin && rows.length > 0)
    : (loaderData?.canViewCompanySummary ?? false);
  const companyWorkQueueQ = useCompanyWorkQueueQuery(companyId, {
    enabled: canViewCompanySummary,
  });
  const ruleSuggestionCount = companyWorkQueueQ.data?.ruleSuggestionCount ?? 0;
  const showSwitchCompany = isHydrated
    ? isGlobalSuperadmin || userCompanyCount > 1
    : (loaderData?.isGlobalSuperadmin ?? false) ||
      (loaderData?.userCompanyCount ?? 0) > 1;
  const canAddProjects = isHydrated
    ? access.can('project:create')
    : (loaderData?.canCreateProjects ?? false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<
    | {
        kind: 'deactivate_project';
        projectId: ProjectId;
        projectName: string;
        projectType: Project['projectType'];
      }
    | {
        kind: 'reactivate_project';
        projectId: ProjectId;
        projectName: string;
        projectType: Project['projectType'];
      }
    | {
        kind: 'delete_project';
        projectId: ProjectId;
        projectName: string;
        projectType: Project['projectType'];
      }
    | null
  >(null);

  const openConfirm = useCallback(
    (target: NonNullable<typeof confirmTarget>) => {
      setConfirmTarget(target);
      setConfirmText('');
      setConfirmOpen(true);
    },
    []
  );

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmTarget(null);
    setConfirmText('');
  };

  const confirmLabel = useMemo(() => {
    if (!confirmTarget) return '';
    const label =
      confirmTarget.projectType === 'programme' ? 'programme' : 'project';
    if (confirmTarget.kind === 'deactivate_project')
      return `Deactivate ${label}`;
    if (confirmTarget.kind === 'reactivate_project')
      return `Reactivate ${label}`;
    return `Delete ${label}`;
  }, [confirmTarget]);

  const confirmDescription = useMemo(() => {
    if (!confirmTarget) return '';
    const label =
      confirmTarget.projectType === 'programme' ? 'programme' : 'project';
    if (confirmTarget.kind === 'deactivate_project') {
      return `This will archive the ${label}. Archived ${label}s cannot be opened by regular members.`;
    }
    if (confirmTarget.kind === 'reactivate_project') {
      return `This will reactivate the ${label} so it becomes active again.`;
    }
    if (confirmTarget.projectType === 'programme') {
      return 'This permanently deletes the programme. Programme rollups are derived from sub-project data, so operational project records are not deleted by deleting an empty programme. This cannot be undone.';
    }
    return 'This permanently deletes the project and all related budgets, transactions, and taxonomy. This cannot be undone. Type the exact destructive confirmation below.';
  }, [confirmTarget]);

  const requiredConfirmText = useMemo(() => {
    if (!confirmTarget) return '';
    if (confirmTarget.kind === 'delete_project') {
      return `DELETE ${confirmTarget.projectName}`;
    }
    return confirmTarget.projectName;
  }, [confirmTarget]);

  const isConfirmMatch = useMemo(() => {
    if (!confirmTarget) return false;
    return confirmText.trim() === requiredConfirmText;
  }, [confirmText, confirmTarget, requiredConfirmText]);

  const resolvedActiveTab: 'summary' | 'projects' | 'settings' = (
    dashboardSearch.tab
      ? toCompanyDashboardTab(dashboardSearch.tab)
      : loaderData?.canViewCompanySummary
        ? 'summary'
        : 'projects'
  ) as CompanyDashboardTab;
  const safeActiveTab: 'summary' | 'projects' | 'settings' =
    resolvedActiveTab === 'settings' && !canAccessSettings
      ? canViewCompanySummary
        ? 'summary'
        : 'projects'
      : resolvedActiveTab === 'summary' && !canViewCompanySummary
        ? 'projects'
        : resolvedActiveTab;

  const projectColumns: MRT_ColumnDef<(typeof groupedProjects)[number]>[] = [
    {
      accessorKey: 'name',
      header: 'Project / programme',
      Cell: ({ row }) => {
        const project = row.original;
        const canOpen =
          project.status === 'active' &&
          (isGlobalSuperadmin
            ? project.allowSuperadminAccess
            : access.can('project:view', project.id));

        const nameContent = canOpen ? (
          <Link
            to={projectRoute.to}
            params={{ companyId, projectId: project.id }}
            className={classes.plainLink}
          >
            <Text
              component="span"
              className="table-body-left-bold table-link-text"
            >
              {project.isChild ? `- ${project.name}` : project.name}
            </Text>
          </Link>
        ) : (
          <Text className="table-body-left-bold">
            {project.isChild ? `- ${project.name}` : project.name}
          </Text>
        );

        return (
          <Stack gap={2} pl={project.isChild ? 'md' : 0}>
            <Group gap="xs" wrap="wrap">
              {nameContent}
              {project.projectType === 'programme' ? (
                <Badge variant="light" color="blue">
                  Programme
                </Badge>
              ) : null}
            </Group>
            {project.parentProjectId ? (
              <Text className="table-body-left" c="dimmed">
                Sub-project of{' '}
                {programmeNameById.get(project.parentProjectId) ?? 'programme'}
              </Text>
            ) : null}
          </Stack>
        );
      },
    },
    {
      accessorKey: 'projectType',
      header: 'Type',
      Cell: ({ row }) =>
        row.original.projectType === 'programme' ? (
          <Badge variant="light" color="blue">
            Programme
          </Badge>
        ) : (
          <Badge variant="light" color="gray">
            Project
          </Badge>
        ),
    },
    {
      accessorKey: 'visibility',
      header: 'Visibility',
      Cell: ({ row }) =>
        row.original.visibility === 'private' ? (
          <Badge variant="light" color="orange" className={classes.warningTone}>
            Private
          </Badge>
        ) : (
          <Badge variant="light" color="teal">
            Company
          </Badge>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      size: 240,
      minSize: 240,
      Cell: ({ row }) => {
        const project = row.original;

        return (
          <Group gap="xs" wrap="nowrap">
            {access.can('project:lifecycle', project.id) &&
              (project.status === 'active' ? (
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  className={classes.warningTone}
                  onClick={() =>
                    openConfirm({
                      kind: 'deactivate_project',
                      projectId: project.id,
                      projectName: project.name,
                      projectType: project.projectType,
                    })
                  }
                >
                  Deactivate
                </Button>
              ) : (
                <>
                  <Button
                    size="xs"
                    variant="light"
                    color="green"
                    onClick={() =>
                      openConfirm({
                        kind: 'reactivate_project',
                        projectId: project.id,
                        projectName: project.name,
                        projectType: project.projectType,
                      })
                    }
                  >
                    Reactivate
                  </Button>
                  <Button
                    size="xs"
                    variant="filled"
                    color="red"
                    onClick={() =>
                      openConfirm({
                        kind: 'delete_project',
                        projectId: project.id,
                        projectName: project.name,
                        projectType: project.projectType,
                      })
                    }
                  >
                    Delete
                  </Button>
                </>
              ))}
          </Group>
        );
      },
    },
  ];

  return {
    canAccessSettings,
    canAddProjects,
    canViewCompanySummary,
    closeConfirm,
    companyId,
    companyQ,
    confirmDescription,
    confirmLabel,
    confirmOpen,
    confirmTarget,
    confirmText,
    createProject,
    dashboardSearch,
    deactivateProject,
    deleteProject,
    effectiveNewProjectOwnerId,
    eligibleInitialOwnerOptions,
    groupedProjects,
    hasEligibleInitialOwners,
    isConfirmMatch,
    isHydrated,
    isMobile,
    loaderData,
    newProjectApplyCompanyStandards,
    newProjectCurrency,
    newProjectName,
    newProjectOpen,
    newProjectParentId,
    newProjectType,
    programmeOptions,
    projectColumns,
    reactivateProject,
    requiredConfirmText,
    router,
    rows,
    ruleSuggestionCount,
    safeActiveTab,
    setConfirmText,
    setNewProjectApplyCompanyStandards,
    setNewProjectCurrency,
    setNewProjectName,
    setNewProjectOpen,
    setNewProjectOwnerId,
    setNewProjectParentId,
    setNewProjectType,
    showSwitchCompany,
    superadminNeedsInitialOwner,
  };
}

type CompanyDashboardPageController = ReturnType<
  typeof useCompanyDashboardPageController
>;

function CompanyDashboardHeader({
  model,
}: {
  model: CompanyDashboardPageController;
}) {
  return (
    <Paper className={classes.pageHero} radius="xl">
      <div className={classes.sectionHeader}>
        <div>
          <Text className={classes.sectionEyebrow}>Company workspace</Text>
          {model.companyQ.isLoading ? (
            model.loaderData?.companyName ? (
              <Title order={2} className={classes.pageHeroTitle} mt={4}>
                {model.loaderData.companyName}
              </Title>
            ) : (
              <LoadingLine width={220} height={34} radius="md" />
            )
          ) : (
            <Title order={2} className={classes.pageHeroTitle} mt={4}>
              {model.companyQ.data?.name}
            </Title>
          )}
          <Text className={classes.pageHeroCopy} mt="xs">
            Review projects and programmes, switch into company settings, and
            keep company-level reporting streamlined.
          </Text>
        </div>
        <div className={classes.pageHeroActions}>
          {model.canAddProjects && (
            <>
              <Button
                variant="filled"
                onClick={() => model.setNewProjectOpen(true)}
              >
                New project or programme
              </Button>
              <Modal
                opened={model.newProjectOpen}
                onClose={() => {
                  model.setNewProjectOpen(false);
                  model.setNewProjectApplyCompanyStandards(true);
                  model.setNewProjectOwnerId(null);
                }}
                title="Create project or programme"
              >
                <Stack>
                  <TextInput
                    label={
                      model.newProjectType === 'programme'
                        ? 'Programme name'
                        : 'Project name'
                    }
                    placeholder="e.g. Website Refresh"
                    value={model.newProjectName}
                    onChange={(e) =>
                      model.setNewProjectName(e.currentTarget.value)
                    }
                    autoFocus
                  />
                  <Select
                    label="Type"
                    value={model.newProjectType}
                    data={[
                      { value: 'project', label: 'Project' },
                      {
                        value: 'programme',
                        label: 'Programme (reporting only)',
                      },
                    ]}
                    onChange={(value) => {
                      const next =
                        value === 'programme' ? 'programme' : 'project';
                      model.setNewProjectType(next);
                      if (next === 'programme')
                        model.setNewProjectParentId(null);
                    }}
                  />
                  <Select
                    label="Currency"
                    value={model.newProjectCurrency}
                    data={[
                      { value: 'AUD', label: 'AUD' },
                      { value: 'USD', label: 'USD' },
                      { value: 'EUR', label: 'EUR' },
                      { value: 'GBP', label: 'GBP' },
                    ]}
                    onChange={(value) => {
                      const next =
                        value === 'USD' || value === 'EUR' || value === 'GBP'
                          ? value
                          : 'AUD';
                      model.setNewProjectCurrency(next);
                      model.setNewProjectParentId(null);
                    }}
                  />
                  {model.superadminNeedsInitialOwner ? (
                    <Select
                      label="Initial project owner"
                      description={
                        model.hasEligibleInitialOwners
                          ? 'Required when global superadmin creates a project or programme.'
                          : 'Add a non-superadmin company member before creating a project or programme.'
                      }
                      placeholder={
                        model.hasEligibleInitialOwners
                          ? 'Select project owner'
                          : 'No eligible company members'
                      }
                      value={model.effectiveNewProjectOwnerId}
                      data={model.eligibleInitialOwnerOptions}
                      disabled={!model.hasEligibleInitialOwners}
                      searchable
                      clearable={false}
                      onChange={(value) => model.setNewProjectOwnerId(value)}
                    />
                  ) : null}
                  <Select
                    label="Programme"
                    description="Optional. Assigns this project into a reporting programme."
                    placeholder="No programme"
                    value={model.newProjectParentId}
                    data={model.programmeOptions}
                    clearable
                    disabled={model.newProjectType === 'programme'}
                    onChange={(value) =>
                      model.setNewProjectParentId(
                        value ? (value as ProjectId) : null
                      )
                    }
                  />
                  <Checkbox
                    label="Apply company standards"
                    description="Recommended. New operational projects start with the current company categories, import rules, and auto-coding already synced in."
                    checked={model.newProjectApplyCompanyStandards}
                    disabled={model.newProjectType === 'programme'}
                    onChange={(event) =>
                      model.setNewProjectApplyCompanyStandards(
                        event.currentTarget.checked
                      )
                    }
                  />
                  <Text size="sm" c="dimmed">
                    Programmes are reporting-only. Projects hold budgets,
                    imports, transactions, and coding. New records start with
                    superadmin support access enabled.
                  </Text>
                  {model.superadminNeedsInitialOwner &&
                  !model.hasEligibleInitialOwners ? (
                    <Text size="sm" c="red">
                      This company has no non-superadmin members yet. Add a
                      company member before creating a project or programme.
                    </Text>
                  ) : null}
                  <Group justify="flex-end">
                    <Button
                      variant="default"
                      onClick={() => {
                        model.setNewProjectOpen(false);
                        model.setNewProjectOwnerId(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={
                        !model.newProjectName.trim() ||
                        model.createProject.isPending ||
                        (model.superadminNeedsInitialOwner &&
                          (!model.hasEligibleInitialOwners ||
                            !model.effectiveNewProjectOwnerId))
                      }
                      onClick={async () => {
                        const name = model.newProjectName.trim();
                        if (!name) return;
                        await model.createProject.mutateAsync({
                          name,
                          projectType: model.newProjectType,
                          currency: model.newProjectCurrency,
                          applyCompanyStandards:
                            model.newProjectType === 'project'
                              ? model.newProjectApplyCompanyStandards
                              : false,
                          ...(model.superadminNeedsInitialOwner &&
                          model.effectiveNewProjectOwnerId
                            ? {
                                initialOwnerUserId: asUserId(
                                  model.effectiveNewProjectOwnerId
                                ),
                              }
                            : {}),
                          ...(model.newProjectType === 'project' &&
                          model.newProjectParentId
                            ? { parentProjectId: model.newProjectParentId }
                            : {}),
                        });
                        model.setNewProjectName('');
                        model.setNewProjectType('project');
                        model.setNewProjectCurrency('AUD');
                        model.setNewProjectParentId(null);
                        model.setNewProjectApplyCompanyStandards(true);
                        model.setNewProjectOwnerId(null);
                        model.setNewProjectOpen(false);
                      }}
                    >
                      Create
                    </Button>
                  </Group>
                </Stack>
              </Modal>
            </>
          )}

          {model.showSwitchCompany && (
            <Link to={landingRoute.to}>
              <Button component="span" variant="default">
                Switch company
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Paper>
  );
}

function CompanyDashboardTabs({
  model,
}: {
  model: CompanyDashboardPageController;
}) {
  return (
    <Tabs
      value={model.safeActiveTab}
      onChange={(value) => {
        const nextTab = toCompanyDashboardTab(value);
        void model.router.navigate({
          to: companyDashboardIndexRoute.to,
          params: { companyId: model.companyId },
          search: (prev) => ({
            ...prev,
            tab: nextTab,
          }),
          replace: true,
        });
      }}
      keepMounted={false}
      className={classes.softTabs}
    >
      <Tabs.List>
        {model.canViewCompanySummary ? (
          <Tabs.Tab value="summary">Summary</Tabs.Tab>
        ) : null}
        <Tabs.Tab value="projects">Projects & programmes</Tabs.Tab>
        <Tabs.Tab value="settings" disabled={!model.canAccessSettings}>
          <Group gap={6} wrap="nowrap">
            Settings
            {model.ruleSuggestionCount > 0 ? (
              <Badge
                size="sm"
                variant="light"
                color="orange"
                title={`${model.ruleSuggestionCount} rule ${
                  model.ruleSuggestionCount === 1 ? 'suggestion' : 'suggestions'
                } need review`}
              >
                {model.ruleSuggestionCount}
              </Badge>
            ) : null}
          </Group>
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="projects" pt="md">
        {!model.isHydrated ? (
          <Paper className={classes.surfaceCard} radius="xl" p="lg">
            <Text c="dimmed">Loading projects and programmes...</Text>
          </Paper>
        ) : model.rows.length > 0 ? (
          <div className={classes.tableWrap}>
            <MantineReactTable
              columns={model.projectColumns}
              data={model.groupedProjects}
              mantineTableContainerProps={{ className: 'financeTable' }}
              enableColumnActions={false}
              enableColumnFilters={false}
              enableDensityToggle={false}
              enableFullScreenToggle={false}
              enableTopToolbar={false}
              enablePagination
              enableSorting
              initialState={{
                density: 'xs',
                pagination: {
                  pageIndex: 0,
                  pageSize: model.isMobile ? 5 : 8,
                },
              }}
              mantineTableProps={{
                highlightOnHover: true,
                striped: 'odd',
                withTableBorder: true,
              }}
            />
          </div>
        ) : (
          <Paper className={classes.surfaceCard} radius="xl" p="lg">
            <Text c="dimmed">
              No projects or programmes found for this company yet.
            </Text>
          </Paper>
        )}
      </Tabs.Panel>

      {model.canViewCompanySummary ? (
        <Tabs.Panel value="summary" pt="md">
          <Suspense fallback={<LoadingLine height={180} radius="md" />}>
            <CompanySummaryPanel
              companyId={model.companyId}
              isMobile={model.isMobile}
            />
          </Suspense>
        </Tabs.Panel>
      ) : null}

      <Tabs.Panel value="settings" pt="md">
        {!model.isHydrated ? (
          <Paper className={classes.surfaceCard} radius="xl" p="lg">
            <Text c="dimmed">Loading company settings...</Text>
          </Paper>
        ) : (
          <Suspense fallback={<LoadingLine height={180} radius="md" />}>
            <CompanySettingsPanel
              companyId={model.companyId}
              initialExportJobId={model.dashboardSearch.exportJob ?? null}
              initialReview={model.dashboardSearch.review ?? null}
            />
          </Suspense>
        )}
      </Tabs.Panel>
    </Tabs>
  );
}

function ProjectLifecycleConfirmModal({
  model,
}: {
  model: CompanyDashboardPageController;
}) {
  return (
    <Modal
      opened={model.confirmOpen}
      onClose={model.closeConfirm}
      title={model.confirmLabel}
      fullScreen={model.isMobile}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {model.confirmDescription}
        </Text>

        <Text size="sm">
          Type <b>{model.requiredConfirmText}</b> to confirm.
        </Text>

        <TextInput
          value={model.confirmText}
          onChange={(e) => model.setConfirmText(e.currentTarget.value)}
          placeholder={
            model.confirmTarget?.kind === 'delete_project'
              ? 'DELETE project or programme name'
              : 'Project or programme name'
          }
          autoFocus
        />

        <Group justify="flex-end" wrap="wrap">
          <Button
            variant="default"
            onClick={model.closeConfirm}
            fullWidth={model.isMobile}
          >
            Cancel
          </Button>
          <Button
            fullWidth={model.isMobile}
            color={
              model.confirmTarget?.kind === 'delete_project'
                ? 'red'
                : model.confirmTarget?.kind === 'reactivate_project'
                  ? 'green'
                  : 'orange'
            }
            disabled={
              !model.isConfirmMatch ||
              model.deactivateProject.isPending ||
              model.reactivateProject.isPending ||
              model.deleteProject.isPending
            }
            onClick={async () => {
              if (!model.confirmTarget) return;
              if (model.confirmTarget.kind === 'deactivate_project') {
                await model.deactivateProject.mutateAsync(
                  model.confirmTarget.projectId
                );
              } else if (model.confirmTarget.kind === 'reactivate_project') {
                await model.reactivateProject.mutateAsync(
                  model.confirmTarget.projectId
                );
              } else {
                await model.deleteProject.mutateAsync({
                  projectId: model.confirmTarget.projectId,
                  confirmation: model.confirmText,
                });
              }
              model.closeConfirm();
            }}
          >
            {model.confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function CompanyDashboardPageView({
  model,
}: {
  model: CompanyDashboardPageController;
}) {
  return (
    <Stack gap="lg" className={classes.pageStack}>
      <CompanyDashboardHeader model={model} />

      <CompanyDashboardTabs model={model} />

      <ProjectLifecycleConfirmModal model={model} />
    </Stack>
  );
}

export default function CompanyDashboardPage() {
  const model = useCompanyDashboardPageController();
  return <CompanyDashboardPageView model={model} />;
}
