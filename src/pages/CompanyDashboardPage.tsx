import { useCallback, useMemo, useState } from 'react';
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
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyId, Project, ProjectId } from '../types';
import { asCompanyId } from '../types';
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
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useAllCompanyMembershipsQuery } from '../queries/memberships';

type CompanyDashboardTab = 'summary' | 'projects' | 'settings';

function toCompanyDashboardTab(value: string | null): CompanyDashboardTab {
  if (value === 'summary' || value === 'projects' || value === 'settings') {
    return value;
  }
  return 'projects';
}

export default function CompanyDashboardPage() {
  const { companyId: rawCompanyId } = companyRoute.useParams();
  const companyId: CompanyId = asCompanyId(rawCompanyId);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const router = useRouter();

  const companyQ = useCompanyQuery(companyId);
  const projectsQ = useProjectsQuery(companyId);

  const access = useCompanyAccess(companyId);
  const canUpdateCompanyDetails = access.can('company:update_details');
  const canManageCompanyMembers = access.can('company:manage_members');
  const canManageCompanyDefaults = access.can('company:manage_defaults');
  const membershipsQ = useAllCompanyMembershipsQuery();
  const usersQ = useUsersQuery();

  const createProject = useCreateProjectMutation(companyId);
  const canAddProjects = access.can('project:create');

  const deactivateProject = useDeactivateProjectMutation(companyId);
  const reactivateProject = useReactivateProjectMutation(companyId);
  const deleteProject = useDeleteProjectMutation(companyId);
  const canAccessSettings =
    canUpdateCompanyDetails ||
    canManageCompanyMembers ||
    canManageCompanyDefaults;

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] =
    useState<Project['projectType']>('project');
  const [newProjectCurrency, setNewProjectCurrency] =
    useState<Project['currency']>('AUD');
  const [newProjectParentId, setNewProjectParentId] =
    useState<ProjectId | null>(null);
  const [activeTab, setActiveTab] = useState<CompanyDashboardTab>('summary');

  const rows = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const sortedProjects = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.status !== b.status) return a.status.localeCompare(b.status);
        if (a.projectType !== b.projectType) {
          return a.projectType === 'programme' ? -1 : 1;
        }
        if (a.parentProjectId !== b.parentProjectId) {
          return (a.parentProjectId ?? '').localeCompare(
            b.parentProjectId ?? ''
          );
        }
        return a.name.localeCompare(b.name);
      }),
    [rows]
  );
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
  const userCompanyCount = useMemo(() => {
    const ids = new Set(
      memberships
        .filter((m) => m.userId === access.userId)
        .map((m) => m.companyId)
    );
    return ids.size;
  }, [memberships, access.userId]);
  const isGlobalSuperadmin = useMemo(
    () =>
      (usersQ.data ?? []).find((user) => user.id === access.userId)
        ?.isGlobalSuperadmin === true,
    [access.userId, usersQ.data]
  );
  const canViewCompanySummary =
    access.isAdmin ||
    access.isExecutive ||
    (isGlobalSuperadmin && sortedProjects.length > 0);
  const showSwitchCompany = isGlobalSuperadmin || userCompanyCount > 1;

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
    canViewCompanySummary
      ? activeTab === 'settings'
        ? 'settings'
        : activeTab === 'projects'
          ? 'projects'
          : 'summary'
      : activeTab === 'summary'
        ? 'projects'
        : activeTab;

  const projectColumns: MRT_ColumnDef<(typeof rows)[number]>[] = [
    {
      accessorKey: 'name',
      header: 'Project / programme',
      Cell: ({ row }) => (
        <Stack gap={2}>
          <Group gap="xs" wrap="wrap">
            <Text fw={600}>{row.original.name}</Text>
            {row.original.projectType === 'programme' ? (
              <Badge variant="light" color="blue">
                Programme
              </Badge>
            ) : null}
          </Group>
          {row.original.parentProjectId ? (
            <Text size="xs" c="dimmed">
              Sub-project of{' '}
              {programmeNameById.get(row.original.parentProjectId) ??
                'programme'}
            </Text>
          ) : null}
        </Stack>
      ),
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
          <Badge variant="light">Private</Badge>
        ) : (
          <Badge variant="light" color="blue">
            Company
          </Badge>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      size: 320,
      minSize: 320,
      Cell: ({ row }) => {
        const project = row.original;
        const canOpen =
          project.status === 'active' &&
          (isGlobalSuperadmin
            ? project.allowSuperadminAccess
            : access.can('project:view', project.id));

        return (
          <Group gap="xs" wrap="nowrap">
            {canOpen ? (
              <Button
                size="xs"
                variant="filled"
                onClick={() =>
                  router.navigate({
                    to: projectRoute.to,
                    params: { companyId, projectId: project.id },
                  })
                }
              >
                Open
              </Button>
            ) : (
              <Button size="xs" variant="light" disabled>
                Open
              </Button>
            )}

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
    <Stack gap="lg">
      <Group justify="space-between" align="center" wrap="wrap">
        {companyQ.isLoading ? (
          <LoadingLine width={220} height={34} radius="md" />
        ) : (
          <Title order={2}>{companyQ.data?.name}</Title>
        )}
        <Group gap="sm" wrap="wrap">
          {canAddProjects && (
            <>
              <Button variant="filled" onClick={() => setNewProjectOpen(true)}>
                New project or programme
              </Button>
              <Modal
                opened={newProjectOpen}
                onClose={() => setNewProjectOpen(false)}
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
                  <Group justify="flex-end">
                    <Button
                      variant="light"
                      onClick={() => setNewProjectOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={
                        !newProjectName.trim() || createProject.isPending
                      }
                      onClick={async () => {
                        const name = newProjectName.trim();
                        if (!name) return;
                        await createProject.mutateAsync({
                          name,
                          projectType: newProjectType,
                          currency: newProjectCurrency,
                          parentProjectId:
                            newProjectType === 'project'
                              ? (newProjectParentId ?? undefined)
                              : undefined,
                        });
                        setNewProjectName('');
                        setNewProjectType('project');
                        setNewProjectCurrency('AUD');
                        setNewProjectParentId(null);
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
              <Button component="span" variant="light">
                Switch company
              </Button>
            </Link>
          )}
        </Group>
      </Group>

      <Tabs
        value={resolvedActiveTab}
        onChange={(value) => setActiveTab(toCompanyDashboardTab(value))}
        keepMounted={false}
      >
        <Tabs.List style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {canViewCompanySummary ? (
            <Tabs.Tab value="summary">Summary</Tabs.Tab>
          ) : null}
          <Tabs.Tab value="projects">Projects & programmes</Tabs.Tab>
          <Tabs.Tab value="settings" disabled={!canAccessSettings}>
            Settings
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="projects" pt="md">
          {rows.length > 0 ? (
            <Stack gap="md">
              <MantineReactTable
                columns={projectColumns}
                data={sortedProjects}
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
            </Stack>
          ) : (
            <Paper withBorder radius="lg" p="lg">
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
          <CompanySettingsPanel companyId={companyId} />
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
