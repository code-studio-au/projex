import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';

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

export default function CompanyDashboardPage() {
  const { companyId: rawCompanyId } = companyRoute.useParams();
  const companyId: CompanyId = asCompanyId(rawCompanyId);

  const companyQ = useCompanyQuery(companyId);
  const projectsQ = useProjectsQuery(companyId);

  const access = useCompanyAccess(companyId);
  const canEditCompany = access.can('company:edit');

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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<
    | { kind: 'deactivate_project'; projectId: ProjectId; projectName: string }
    | { kind: 'reactivate_project'; projectId: ProjectId; projectName: string }
    | { kind: 'delete_project'; projectId: ProjectId; projectName: string }
    | null
  >(null);

  const openConfirm = (target: NonNullable<typeof confirmTarget>) => {
    setConfirmTarget(target);
    setConfirmText('');
    setConfirmOpen(true);
  };

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

  const renderProjectCard = (p: (typeof rows)[number]) => (
    <Card key={p.id} withBorder radius="lg" p="md">
      <Stack gap={6}>
        <Group justify="space-between" align="center">
          <Text fw={700}>{p.name}</Text>
          <Group gap={6}>
            {p.status === 'archived' ? (
              <Badge variant="light" color="gray">
                Deactivated
              </Badge>
            ) : null}
            {p.visibility === 'private' ? (
              <Badge variant="light">Private</Badge>
            ) : !access.can('project:view', p.id) ? (
              <Badge variant="light">Company</Badge>
            ) : null}
          </Group>
        </Group>
        <Text size="sm" c="dimmed" lineClamp={2}>
          {p.description || p.id}
        </Text>
        <Group justify="space-between" mt="sm">
          {p.status === 'active' && access.can('project:view', p.id) ? (
            <Link to={projectRoute.to} params={{ companyId, projectId: p.id }}>
              <Button component="span" variant="light">
                Open workspace
              </Button>
            </Link>
          ) : (
            <Button disabled variant="light">
              Open workspace
            </Button>
          )}

          {canManageProjects && (
            <Group gap="xs">
              {p.status === 'active' ? (
                <Button
                  variant="light"
                  color="orange"
                  onClick={() => openConfirm({ kind: 'deactivate_project', projectId: p.id, projectName: p.name })}
                >
                  Deactivate
                </Button>
              ) : (
                <>
                  <Button
                    variant="light"
                    color="green"
                    onClick={() => openConfirm({ kind: 'reactivate_project', projectId: p.id, projectName: p.name })}
                  >
                    Reactivate
                  </Button>
                  <Button
                    variant="filled"
                    color="red"
                    onClick={() => openConfirm({ kind: 'delete_project', projectId: p.id, projectName: p.name })}
                  >
                    Delete
                  </Button>
                </>
              )}
            </Group>
          )}
        </Group>
      </Stack>
    </Card>
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={2}>{companyQ.data?.name ?? 'Company'}</Title>
          <Text c="dimmed">Projects and settings</Text>
        </Stack>
        <Group gap="sm">
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

          <Link to={landingRoute.to}>
            <Button component="span" variant="light">
              Switch company
            </Button>
          </Link>
        </Group>
      </Group>

      <Tabs defaultValue="projects" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="projects">Projects</Tabs.Tab>
          <Tabs.Tab value="settings" disabled={!canEditCompany}>
            Settings
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="projects" pt="md">
          {activeProjects.length > 0 && (
            <>
              <Text size="sm" c="dimmed">
                Active
              </Text>
              <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                {activeProjects.map(renderProjectCard)}
              </SimpleGrid>
            </>
          )}

          {canManageProjects && (
            <>
              <Text size="sm" c="dimmed" mt="md">
                Deactivated
              </Text>
              <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                {archivedProjects.map(renderProjectCard)}
              </SimpleGrid>
              {archivedProjects.length === 0 && (
                <Card withBorder radius="lg" p="md" mt="md">
                  <Text c="dimmed">No deactivated projects.</Text>
                </Card>
              )}
            </>
          )}

          {rows.length === 0 && (
            <Card withBorder radius="lg" p="md" mt="md">
              <Text c="dimmed">No projects found for this company.</Text>
            </Card>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="settings" pt="md">
          <CompanySettingsPanel companyId={companyId} />
        </Tabs.Panel>
      </Tabs>

      <Modal opened={confirmOpen} onClose={closeConfirm} title={confirmLabel}>
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

          <Group justify="flex-end">
            <Button variant="light" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
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
