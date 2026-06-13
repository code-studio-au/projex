import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Badge,
  Button,
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
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyId, Project, ProjectId } from '../types';
import { asCompanyId, asUserId } from '../types';
import {
  useCompanyQuery,
  useProjectsQuery,
  useUsersQuery,
} from '../queries/reference';
import {
  useCreateProjectMutation,
  useDeactivateProjectMutation,
  useDeleteProjectMutation,
  useReactivateProjectMutation,
} from '../queries/admin';
import CompanySummaryPanel from '../components/CompanySummaryPanel';
import CompanySettingsPanel from '../components/CompanySettingsPanel';
import { LoadingLine } from '../components/LoadingValue';
import { companyRoute, landingRoute, projectRoute } from '../router';
import { Route as companyDashboardIndexRoute } from '../routes/_authed.c.$companyId.index';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useAllCompanyMembershipsQuery } from '../queries/memberships';
import classes from '../styles/ui.module.css';

type CompanyDashboardTab = 'summary' | 'projects' | 'settings';

const hydrateSubscription = () => () => {};
const getClientHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

function toCompanyDashboardTab(value: string | null): CompanyDashboardTab {
  if (value === 'summary' || value === 'projects' || value === 'settings') {
    return value;
  }
  return 'projects';
}

export default function CompanyDashboardPage() {
  const { companyId: rawCompanyId } = companyRoute.useParams();
  const loaderData = companyRoute.useLoaderData();
  const dashboardSearch = companyDashboardIndexRoute.useSearch();
  const companyId: CompanyId = asCompanyId(rawCompanyId);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const router = useRouter();
  const isHydrated = useSyncExternalStore(
    hydrateSubscription,
    getClientHydratedSnapshot,
    getServerHydratedSnapshot
  );

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
  const canAccessSettings =
    loaderData?.canAccessSettings ??
    (canUpdateCompanyDetails ||
      canManageCompanyMembers ||
      canManageCompanyDefaults);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] =
    useState<Project['projectType']>('project');
  const [newProjectCurrency, setNewProjectCurrency] =
    useState<Project['currency']>('AUD');
  const [newProjectParentId, setNewProjectParentId] =
    useState<ProjectId | null>(null);
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
        projectsById.get(project.parentProjectId)?.projectType === 'programme' &&
        projectsById.get(project.parentProjectId)?.status === 'active'
      ) {
        const current = childProjectsByParent.get(project.parentProjectId) ?? [];
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
        rows
          .filter((project) => project.projectType === 'programme')
          .map((project) => [project.id, project.name])
      ),
    [rows]
  );
  const memberships = useMemo(
    () => membershipsQ.data ?? [],
    [membershipsQ.data]
  );
  const eligibleInitialOwnerOptions = useMemo(() => {
    const companyMemberIds = new Set(
      memberships
        .filter((membership) => membership.companyId === companyId)
        .map((membership) => membership.userId)
    );
    return (usersQ.data ?? [])
      .filter((user) => companyMemberIds.has(user.id) && !user.isGlobalSuperadmin)
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
      memberships
        .filter((m) => m.userId === access.userId)
        .map((m) => m.companyId)
    );
    return ids.size;
  }, [memberships, access.userId]);
  const isGlobalSuperadmin =
    (usersQ.data ?? []).find((user) => user.id === access.userId)
      ?.isGlobalSuperadmin ??
    loaderData?.isGlobalSuperadmin ??
    false;
  const superadminNeedsInitialOwner = isGlobalSuperadmin;
  const canViewCompanySummary =
    loaderData?.canViewCompanySummary ??
    (access.isAdmin ||
      access.isExecutive ||
      (isGlobalSuperadmin && rows.length > 0));
  const showSwitchCompany =
    (loaderData?.isGlobalSuperadmin ?? isGlobalSuperadmin) ||
    (loaderData?.userCompanyCount ?? userCompanyCount) > 1;
  const canAddProjects =
    loaderData?.canCreateProjects ?? access.can('project:create');

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

  const resolvedActiveTab: 'summary' | 'projects' | 'settings' =
    (dashboardSearch.tab
      ? toCompanyDashboardTab(dashboardSearch.tab)
      : loaderData?.canViewCompanySummary
        ? 'summary'
        : 'projects') as CompanyDashboardTab;
  const safeActiveTab: 'summary' | 'projects' | 'settings' =
    canViewCompanySummary
      ? resolvedActiveTab === 'settings'
        ? 'settings'
        : resolvedActiveTab === 'projects'
          ? 'projects'
          : 'summary'
      : resolvedActiveTab === 'summary'
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
                <Badge variant="light">Programme</Badge>
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
          <Badge variant="light">
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
          <Badge variant="light">Private</Badge>
        ) : (
          <Badge variant="light">
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

  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.pageHero} radius="xl">
        <div className={classes.sectionHeader}>
          <div>
            <Text className={classes.sectionEyebrow}>Company workspace</Text>
            {companyQ.isLoading ? (
              loaderData?.companyName ? (
                <Title order={2} className={classes.pageHeroTitle} mt={4}>
                  {loaderData.companyName}
                </Title>
              ) : (
                <LoadingLine width={220} height={34} radius="md" />
              )
            ) : (
              <Title order={2} className={classes.pageHeroTitle} mt={4}>
                {companyQ.data?.name}
              </Title>
            )}
            <Text className={classes.pageHeroCopy} mt="xs">
              Review projects and programmes, switch into company settings, and
              keep company-level reporting streamlined.
            </Text>
          </div>
          <div className={classes.pageHeroActions}>
          {canAddProjects && (
            <>
              <Button variant="filled" onClick={() => setNewProjectOpen(true)}>
                New project or programme
              </Button>
              <Modal
                opened={newProjectOpen}
                onClose={() => {
                  setNewProjectOpen(false);
                  setNewProjectOwnerId(null);
                }}
                title="Create project or programme"
              >
                <Stack>
                  <TextInput
                    label={
                      newProjectType === 'programme'
                        ? 'Programme name'
                        : 'Project name'
                    }
                    placeholder="e.g. Website Refresh"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.currentTarget.value)}
                    autoFocus
                  />
                  <Select
                    label="Type"
                    value={newProjectType}
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
                      setNewProjectType(next);
                      if (next === 'programme') setNewProjectParentId(null);
                    }}
                  />
                  <Select
                    label="Currency"
                    value={newProjectCurrency}
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
                      setNewProjectCurrency(next);
                      setNewProjectParentId(null);
                    }}
                  />
                  {superadminNeedsInitialOwner ? (
                    <Select
                      label="Initial project owner"
                      description={
                        hasEligibleInitialOwners
                          ? 'Required when global superadmin creates a project or programme.'
                          : 'Add a non-superadmin company member before creating a project or programme.'
                      }
                      placeholder={
                        hasEligibleInitialOwners
                          ? 'Select project owner'
                          : 'No eligible company members'
                      }
                      value={effectiveNewProjectOwnerId}
                      data={eligibleInitialOwnerOptions}
                      disabled={!hasEligibleInitialOwners}
                      searchable
                      clearable={false}
                      onChange={(value) => setNewProjectOwnerId(value)}
                    />
                  ) : null}
                  <Select
                    label="Programme"
                    description="Optional. Assigns this project into a reporting programme."
                    placeholder="No programme"
                    value={newProjectParentId}
                    data={programmeOptions}
                    clearable
                    disabled={newProjectType === 'programme'}
                    onChange={(value) =>
                      setNewProjectParentId(value ? (value as ProjectId) : null)
                    }
                  />
                  <Text size="sm" c="dimmed">
                    Programmes are reporting-only. Projects hold budgets,
                    imports, transactions, and coding. New records start with
                    superadmin support access enabled.
                  </Text>
                  {superadminNeedsInitialOwner && !hasEligibleInitialOwners ? (
                    <Text size="sm" c="red">
                      This company has no non-superadmin members yet. Add a
                      company member before creating a project or programme.
                    </Text>
                  ) : null}
                  <Group justify="flex-end">
                    <Button
                      variant="light"
                      onClick={() => {
                        setNewProjectOpen(false);
                        setNewProjectOwnerId(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={
                        !newProjectName.trim() ||
                        createProject.isPending ||
                        (superadminNeedsInitialOwner &&
                          (!hasEligibleInitialOwners ||
                            !effectiveNewProjectOwnerId))
                      }
                      onClick={async () => {
                        const name = newProjectName.trim();
                        if (!name) return;
                        await createProject.mutateAsync({
                          name,
                          projectType: newProjectType,
                          currency: newProjectCurrency,
                          initialOwnerUserId:
                            superadminNeedsInitialOwner &&
                            effectiveNewProjectOwnerId
                              ? asUserId(effectiveNewProjectOwnerId)
                              : undefined,
                          parentProjectId:
                            newProjectType === 'project'
                              ? (newProjectParentId ?? undefined)
                              : undefined,
                        });
                        setNewProjectName('');
                        setNewProjectType('project');
                        setNewProjectCurrency('AUD');
                        setNewProjectParentId(null);
                        setNewProjectOwnerId(null);
                        setNewProjectOpen(false);
                      }}
                    >
                      Create
                    </Button>
                  </Group>
                </Stack>
              </Modal>
            </>
          )}

          {showSwitchCompany && (
            <Link to={landingRoute.to}>
              <Button component="span" variant="default">
                Switch company
              </Button>
            </Link>
          )}
          </div>
        </div>
      </Paper>

      <Tabs
        value={safeActiveTab}
        onChange={(value) => {
          const nextTab = toCompanyDashboardTab(value);
          router.navigate({
            to: companyDashboardIndexRoute.to,
            params: { companyId },
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
          {canViewCompanySummary ? (
            <Tabs.Tab value="summary">Summary</Tabs.Tab>
          ) : null}
          <Tabs.Tab value="projects">Projects & programmes</Tabs.Tab>
          <Tabs.Tab value="settings" disabled={!canAccessSettings}>
            Settings
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="projects" pt="md">
          {!isHydrated ? (
            <Paper className={classes.surfaceCard} radius="xl" p="lg">
              <Text c="dimmed">Loading projects and programmes...</Text>
            </Paper>
          ) : rows.length > 0 ? (
            <div className={classes.tableWrap}>
              <MantineReactTable
                columns={projectColumns}
                data={groupedProjects}
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
                  pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 8 },
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

        {canViewCompanySummary ? (
          <Tabs.Panel value="summary" pt="md">
            <CompanySummaryPanel companyId={companyId} isMobile={isMobile} />
          </Tabs.Panel>
        ) : null}

        <Tabs.Panel value="settings" pt="md">
          <CompanySettingsPanel
            companyId={companyId}
            initialExportJobId={dashboardSearch.exportJob ?? null}
          />
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={confirmOpen}
        onClose={closeConfirm}
        title={confirmLabel}
        fullScreen={isMobile}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {confirmDescription}
          </Text>

          <Text size="sm">
            Type <b>{requiredConfirmText}</b> to confirm.
          </Text>

          <TextInput
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            placeholder={
              confirmTarget?.kind === 'delete_project'
                ? 'DELETE project or programme name'
                : 'Project or programme name'
            }
            autoFocus
          />

          <Group justify="flex-end" wrap="wrap">
            <Button variant="light" onClick={closeConfirm} fullWidth={isMobile}>
              Cancel
            </Button>
            <Button
              fullWidth={isMobile}
              color={
                confirmTarget?.kind === 'delete_project'
                  ? 'red'
                  : confirmTarget?.kind === 'reactivate_project'
                    ? 'green'
                    : 'orange'
              }
              disabled={
                !isConfirmMatch ||
                deactivateProject.isPending ||
                reactivateProject.isPending ||
                deleteProject.isPending
              }
              onClick={async () => {
                if (!confirmTarget) return;
                if (confirmTarget.kind === 'deactivate_project') {
                  await deactivateProject.mutateAsync(confirmTarget.projectId);
                } else if (confirmTarget.kind === 'reactivate_project') {
                  await reactivateProject.mutateAsync(confirmTarget.projectId);
                } else {
                  await deleteProject.mutateAsync({
                    projectId: confirmTarget.projectId,
                    confirmation: confirmText,
                  });
                }
                closeConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
