import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Link, useRouter } from '@tanstack/react-router';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyId, ProjectId } from '../types';
import { asCompanyId } from '../types';
import { useCompanyQuery, useProjectsQuery } from '../queries/reference';
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

export default function CompanyDashboardPage() {
  const { companyId: rawCompanyId } = companyRoute.useParams();
  const companyId: CompanyId = asCompanyId(rawCompanyId);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const router = useRouter();

  const companyQ = useCompanyQuery(companyId);
  const projectsQ = useProjectsQuery(companyId);

  const access = useCompanyAccess(companyId);
  const canEditCompany = access.can('company:edit');
  const membershipsQ = useAllCompanyMembershipsQuery();

  const createProject = useCreateProjectMutation(companyId);
  const canAddProjects = canEditCompany;

  const canManageProjects = canEditCompany; // exec/admin/superadmin
  const deactivateProject = useDeactivateProjectMutation(companyId);
  const reactivateProject = useReactivateProjectMutation(companyId);
  const deleteProject = useDeleteProjectMutation(companyId);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const rows = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const sortedProjects = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.status !== b.status) return a.status.localeCompare(b.status);
        return a.name.localeCompare(b.name);
      }),
    [rows]
  );
  const memberships = useMemo(() => membershipsQ.data ?? [], [membershipsQ.data]);
  const userCompanyCount = useMemo(() => {
    const ids = new Set(
      memberships.filter((m) => m.userId === access.userId).map((m) => m.companyId)
    );
    return ids.size;
  }, [memberships, access.userId]);
  const isGlobalSuperadmin = useMemo(
    () => memberships.some((m) => m.userId === access.userId && m.role === 'superadmin'),
    [memberships, access.userId]
  );
  const canViewCompanySummary =
    access.isAdmin || access.isExecutive || (isGlobalSuperadmin && sortedProjects.length > 0);
  const showSwitchCompany = isGlobalSuperadmin || userCompanyCount > 1;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<
    | { kind: 'deactivate_project'; projectId: ProjectId; projectName: string }
    | { kind: 'reactivate_project'; projectId: ProjectId; projectName: string }
    | { kind: 'delete_project'; projectId: ProjectId; projectName: string }
    | null
  >(null);

  const openConfirm = useCallback((target: NonNullable<typeof confirmTarget>) => {
    setConfirmTarget(target);
    setConfirmText('');
    setConfirmOpen(true);
  }, []);

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmTarget(null);
    setConfirmText('');
  };

  const confirmLabel = useMemo(() => {
    if (!confirmTarget) return '';
    if (confirmTarget.kind === 'deactivate_project') return 'Deactivate project';
    if (confirmTarget.kind === 'reactivate_project') return 'Reactivate project';
    return 'Delete project';
  }, [confirmTarget]);

  const confirmDescription = useMemo(() => {
    if (!confirmTarget) return '';
    if (confirmTarget.kind === 'deactivate_project') {
      return 'This will archive the project. Archived projects cannot be opened by regular members.';
    }
    if (confirmTarget.kind === 'reactivate_project') {
      return 'This will reactivate the project so it becomes active again.';
    }
    return 'This permanently deletes the project and all related budgets, transactions, and taxonomy. This cannot be undone.';
  }, [confirmTarget]);

  const isConfirmMatch = useMemo(() => {
    if (!confirmTarget) return false;
    return confirmText.trim() === confirmTarget.projectName;
  }, [confirmText, confirmTarget]);

  const projectColumns = useMemo<MRT_ColumnDef<(typeof rows)[number]>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Project',
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

              {canManageProjects &&
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
    ],
    [access, canManageProjects, companyId, isGlobalSuperadmin, openConfirm]
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={2}>
          {companyQ.isLoading ? (
            <LoadingLine width={220} height={34} radius="md" />
          ) : (
            <Title order={2}>{companyQ.data?.name}</Title>
          )}
          <Text c="dimmed">Projects, access, and company settings.</Text>
        </Stack>
        <Group gap="sm" wrap="wrap">
          {canAddProjects && (
            <>
              <Button variant="filled" onClick={() => setNewProjectOpen(true)}>
                New project
              </Button>
              <Modal opened={newProjectOpen} onClose={() => setNewProjectOpen(false)} title="Create project">
                <Stack>
                  <TextInput
                    label="Project name"
                    placeholder="e.g. Website Refresh"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.currentTarget.value)}
                    autoFocus
                  />
                  <Text size="sm" c="dimmed">
                    New projects start with superadmin support access enabled. Company admins can change this later in Project settings.
                  </Text>
                  <Group justify="flex-end">
                    <Button variant="light" onClick={() => setNewProjectOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={!newProjectName.trim() || createProject.isPending}
                      onClick={async () => {
                        const name = newProjectName.trim();
                        if (!name) return;
                        await createProject.mutateAsync({ name });
                        setNewProjectName('');
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

      <Tabs defaultValue="projects" keepMounted={false}>
        <Tabs.List style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          <Tabs.Tab value="projects">Projects</Tabs.Tab>
          {canViewCompanySummary ? <Tabs.Tab value="summary">Summary</Tabs.Tab> : null}
          <Tabs.Tab value="settings" disabled={!canEditCompany}>
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
                mantineTableProps={{ highlightOnHover: true, striped: 'odd', withTableBorder: true }}
              />
            </Stack>
          ) : (
            <Paper withBorder radius="lg" p="lg">
              <Text c="dimmed">No projects found for this company yet.</Text>
            </Paper>
          )}
        </Tabs.Panel>

        {canViewCompanySummary ? (
          <Tabs.Panel value="summary" pt="md">
            <CompanySummaryPanel projects={sortedProjects} isMobile={isMobile} />
          </Tabs.Panel>
        ) : null}

        <Tabs.Panel value="settings" pt="md">
          <CompanySettingsPanel companyId={companyId} />
        </Tabs.Panel>
      </Tabs>

      <Modal opened={confirmOpen} onClose={closeConfirm} title={confirmLabel} fullScreen={isMobile}>
        <Stack>
          <Text size="sm" c="dimmed">
            {confirmDescription}
          </Text>

          <Text size="sm">
            Type <b>{confirmTarget?.projectName ?? ''}</b> to confirm.
          </Text>

          <TextInput
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            placeholder="Project name"
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
                  await deleteProject.mutateAsync(confirmTarget.projectId);
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
