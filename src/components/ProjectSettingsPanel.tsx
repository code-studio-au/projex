import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from '@tanstack/react-router';

import type { CompanyId, ProjectId, ProjectRole, UserId } from '../types';
import { asUserId } from '../types';

import { useProjectQuery, useUsersQuery } from '../queries/reference';
import { useUpdateProjectMutation } from '../queries/admin';
import {
  useCompanyMembershipsQuery,
  useProjectMembershipsQuery,
  useUpsertProjectMembershipMutation,
  useDeleteProjectMembershipMutation,
} from '../queries/memberships';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { getCompanyUsers } from '../store/access';
import { companyRoute } from '../router';

export default function ProjectSettingsPanel(props: {
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const { companyId, projectId } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const router = useRouter();

  const project = useProjectQuery(projectId);
  const usersQ = useUsersQuery();
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);
  const projectMembershipsQ = useProjectMembershipsQuery(projectId);

  const access = useCompanyAccess(companyId);
  const updateProject = useUpdateProjectMutation(companyId);

  const canEditProject = access.can('project:edit', projectId);

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
  const [pendingSuperadminAccess, setPendingSuperadminAccess] = useState<
    boolean | null
  >(null);

  const upsert = useUpsertProjectMembershipMutation(projectId);
  const del = useDeleteProjectMembershipMutation(projectId);

  const members = useMemo(
    () => projectMembershipsQ.data ?? [],
    [projectMembershipsQ.data]
  );
  const memberRows = useMemo(
    () =>
      members
        .filter((m) => companyUsers.some((cu) => cu.id === m.userId))
        .map((m, idx) => {
          const user = (usersQ.data ?? []).find((x) => x.id === m.userId);
          return {
            key: `${m.projectId}:${m.userId}:${m.role}:${idx}`,
            userId: m.userId,
            role: m.role,
            name: user?.name ?? String(m.userId),
            email: user?.email ?? '',
          };
        }),
    [members, companyUsers, usersQ.data]
  );

  const memberColumns = useMemo<MRT_ColumnDef<(typeof memberRows)[number]>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'User',
        Cell: ({ row }) => (
          <Stack gap={2}>
            <Text fw={600}>{row.original.name}</Text>
            {row.original.email ? (
              <Text size="xs" c="dimmed">
                {row.original.email}
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
        Cell: ({ row }) => (
          <Button
            size="xs"
            color="red"
            variant="light"
            className="tableActionButton"
            disabled={!canEditProject}
            onClick={() =>
              del.mutate({
                userId: row.original.userId,
                role: row.original.role,
              })
            }
          >
            Remove
          </Button>
        ),
      },
    ],
    [canEditProject, del]
  );

  if (!project.data) {
    return (
      <Paper withBorder radius="lg" p="lg">
        <Stack>
          <Title order={4}>No project selected</Title>
          <Text c="dimmed">Select a project from the dashboard.</Text>
        </Stack>
      </Paper>
    );
  }

  const nextSuperadminAccess =
    pendingSuperadminAccess ?? project.data.allowSuperadminAccess;
  const toggleLabel = nextSuperadminAccess
    ? 'Enable superadmin access'
    : 'Disable superadmin access';
  const toggleDescription = nextSuperadminAccess
    ? 'Warning: this will allow the global superadmin to view this project, its budget, transactions, and settings for support and troubleshooting. Are you sure you want to enable this access?'
    : 'Superadmin will no longer be able to see this project, its budget, transactions, or settings unless access is re-enabled later. Are you sure you want to disable this access?';

  return (
    <Stack gap="lg">
      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Title order={5}>Project settings</Title>
            <Badge variant="light" color={canEditProject ? 'gray' : 'red'}>
              {canEditProject ? 'Can edit project' : 'Read-only'}
            </Badge>
          </Group>
          <Stack gap="sm" style={{ width: '100%', maxWidth: 460 }}>
            <Select
              label="Currency"
              description="Controls how money is formatted throughout this project workspace."
              value={project.data.currency}
              onChange={(v) => {
                if (!v) return;
                updateProject.mutate({
                  id: projectId,
                  currency: v as 'AUD' | 'USD' | 'EUR' | 'GBP',
                });
              }}
              data={[
                { value: 'AUD', label: 'AUD' },
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
                { value: 'GBP', label: 'GBP' },
              ]}
              disabled={!canEditProject}
            />
            <Select
              label="Visibility"
              description="Controls whether non-members can see this project in the company project list. Opening still requires membership unless you are Admin/Exec/Superadmin."
              value={project.data.visibility}
              onChange={(v) => {
                if (!v) return;
                updateProject.mutate({
                  id: projectId,
                  visibility: v as 'private' | 'company',
                });
              }}
              data={[
                { value: 'private', label: 'Private (members only)' },
                {
                  value: 'company',
                  label: 'Company-wide (visible to all company users)',
                },
              ]}
              disabled={!canEditProject}
            />
            <Switch
              label="Allow superadmin access"
              description="Controls whether the global superadmin can open this project for support and troubleshooting. This is on by default for now."
              checked={project.data.allowSuperadminAccess}
              onChange={(event) =>
                setPendingSuperadminAccess(event.currentTarget.checked)
              }
              disabled={!canEditProject || updateProject.isPending}
            />
          </Stack>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Title order={5}>Assign team members</Title>
          <Group align="flex-end" wrap="wrap">
            <Select
              label="User (this company)"
              data={userOptions}
              value={memberUserId}
              onChange={(v) => setMemberUserId(v ? asUserId(v) : null)}
              searchable
              style={{ width: '100%', maxWidth: 420 }}
            />
            <Select
              label="Role"
              data={[
                { value: 'owner', label: 'owner' },
                { value: 'lead', label: 'lead' },
                { value: 'member', label: 'member' },
                { value: 'viewer', label: 'viewer' },
              ]}
              value={memberRole}
              onChange={(v) => setMemberRole((v as ProjectRole | null) ?? null)}
              style={{ width: '100%', maxWidth: 220 }}
            />
            <Button
              size="sm"
              disabled={!canEditProject || !memberUserId || !memberRole}
              onClick={async () => {
                if (!memberUserId || !memberRole) return;
                await upsert.mutateAsync({
                  userId: memberUserId,
                  role: memberRole,
                });
              }}
            >
              Add to project
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Manage membership per project. Company settings manages
            company-level roles only.
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Title order={5}>Current members</Title>
          <MantineReactTable
            columns={memberColumns}
            data={memberRows}
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
        </Stack>
      </Paper>

      <Modal
        opened={pendingSuperadminAccess !== null}
        onClose={() => setPendingSuperadminAccess(null)}
        title={toggleLabel}
        fullScreen={isMobile}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {toggleDescription}
          </Text>
          <Group justify="flex-end" wrap="wrap">
            <Button
              variant="light"
              onClick={() => setPendingSuperadminAccess(null)}
              fullWidth={isMobile}
            >
              Cancel
            </Button>
            <Button
              color={nextSuperadminAccess ? 'orange' : 'red'}
              fullWidth={isMobile}
              loading={updateProject.isPending}
              onClick={async () => {
                if (pendingSuperadminAccess === null) return;
                await updateProject.mutateAsync({
                  id: projectId,
                  allowSuperadminAccess: pendingSuperadminAccess,
                });
                const disablingWhileSuperadmin =
                  access.isSuperadmin && pendingSuperadminAccess === false;
                setPendingSuperadminAccess(null);
                if (disablingWhileSuperadmin) {
                  router.navigate({
                    to: companyRoute.to,
                    params: { companyId },
                  });
                }
              }}
            >
              {toggleLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
