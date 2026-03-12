import { useMemo, useState } from 'react';
import { Badge, Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useMediaQuery } from '@mantine/hooks';

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

export default function ProjectSettingsPanel(props: {
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const { companyId, projectId } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');

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

  const upsert = useUpsertProjectMembershipMutation(projectId);
  const del = useDeleteProjectMembershipMutation(projectId);

  const members = useMemo(() => projectMembershipsQ.data ?? [], [projectMembershipsQ.data]);
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
            disabled={!canEditProject}
            onClick={() => del.mutate({ userId: row.original.userId, role: row.original.role })}
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
                updateProject.mutate({ id: projectId, currency: v as 'AUD' | 'USD' | 'EUR' | 'GBP' });
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
                updateProject.mutate({ id: projectId, visibility: v as 'private' | 'company' });
              }}
              data={[
                { value: 'private', label: 'Private (members only)' },
                { value: 'company', label: 'Company-wide (visible to all company users)' },
              ]}
              disabled={!canEditProject}
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
              disabled={!canEditProject || !memberUserId || !memberRole}
              onClick={async () => {
                if (!memberUserId || !memberRole) return;
                await upsert.mutateAsync({ userId: memberUserId, role: memberRole });
              }}
            >
              Add to project
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Manage membership per project. Company settings manages company-level roles only.
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
            mantineTableProps={{ highlightOnHover: true, striped: 'odd', withTableBorder: true }}
            enableColumnActions={false}
            enableColumnFilters={false}
            enableSorting
            enableTopToolbar={false}
            enableDensityToggle={false}
            enableFullScreenToggle={false}
            initialState={{ density: 'xs', pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 8 } }}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}
