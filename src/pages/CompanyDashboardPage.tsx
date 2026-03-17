import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
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
import CompanySettingsPanel from '../components/CompanySettingsPanel';
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
  const activeProjects = useMemo(() => rows.filter((p) => p.status === 'active'), [rows]);
  const archivedProjects = useMemo(() => rows.filter((p) => p.status === 'archived'), [rows]);
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
        accessorKey: 'description',
        header: 'Description',
        Cell: ({ row }) => (
          <Text size="sm" c="dimmed">
            {row.original.description || row.original.id}
          </Text>
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
        accessorKey: 'status',
        header: 'Status',
        Cell: ({ row }) =>
          row.original.status === 'active' ? (
            <Badge variant="light">Active</Badge>
          ) : (
            <Badge variant="light" color="gray">
              Deactivated
            </Badge>
          ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        Cell: ({ row }) => {
          const project = row.original;
          const canOpen = project.status === 'active' && access.can('project:view', project.id);

          return (
            <Group gap="xs" wrap="wrap">
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
    [access, canManageProjects, companyId, openConfirm]
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={2}>
          <Title order={2}>{companyQ.data?.name ?? 'Company'}</Title>
          <Text c="dimmed">Projects and settings</Text>
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
          <Tabs.Tab value="settings" disabled={!canEditCompany}>
            Settings
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="projects" pt="md">
          {rows.length > 0 ? (
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                  Active projects
                </Text>
                <Badge variant="light">{activeProjects.length}</Badge>
              </Group>

              <MantineReactTable
                columns={projectColumns}
                data={activeProjects}
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
                  sorting: [{ id: 'name', desc: false }],
                }}
                mantineTableProps={{ highlightOnHover: true, striped: 'odd', withTableBorder: true }}
              />

              {canManageProjects && (
                <>
                  <Group justify="space-between" align="center">
                    <Text size="sm" c="dimmed">
                      Deactivated projects
                    </Text>
                    <Badge variant="light" color="gray">
                      {archivedProjects.length}
                    </Badge>
                  </Group>
                  <MantineReactTable
                    columns={projectColumns}
                    data={archivedProjects}
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
                      pagination: { pageIndex: 0, pageSize: isMobile ? 4 : 6 },
                      sorting: [{ id: 'name', desc: false }],
                    }}
                    mantineTableProps={{ highlightOnHover: true, striped: 'odd', withTableBorder: true }}
                  />
                </>
              )}
            </Stack>
          ) : (
            <Text c="dimmed">No projects found for this company.</Text>
          )}
        </Tabs.Panel>

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
