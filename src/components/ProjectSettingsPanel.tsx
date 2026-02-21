import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';

import type { CompanyId, ProjectId, ProjectRole, UserId } from '../types';
import { asUserId } from '../types';

import { useCompanyQuery, useProjectQuery, useUsersQuery } from '../queries/reference';
import { useUpdateProjectMutation } from '../queries/admin';
import { useCompanyMembershipsQuery, useProjectMembershipsQuery, useUpsertProjectMembershipMutation, useDeleteProjectMembershipMutation } from '../queries/memberships';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { getCompanyUsers } from '../store/access';

export default function ProjectSettingsPanel(props: {
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const { companyId, projectId } = props;

  const company = useCompanyQuery(companyId);
  const project = useProjectQuery(projectId);
  const usersQ = useUsersQuery();
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);
  const projectMembershipsQ = useProjectMembershipsQuery(projectId);

  const access = useCompanyAccess(companyId);
  const updateProject = useUpdateProjectMutation(companyId);

  const canManageMembers =
    access.can('project:edit', projectId) || access.can('txns:edit', projectId);

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


<Paper withBorder radius="lg" p="lg">
  <Stack gap="sm">
    <Title order={4}>Project</Title>
    <Group justify="space-between" align="flex-end">
      <Stack gap={2}>
        <Text size="sm" c="dimmed">Name</Text>
        <Text fw={700}>{project.data.name}</Text>
      </Stack>
      <Select
        label="Visibility"
        description="Controls whether non-members can see this project in the company project list."
        value={project.data.visibility}
        onChange={(v) => {
          if (!v) return;
          updateProject.mutate({ id: projectId, visibility: v as 'private' | 'company' });
        }}
        data={[
          { value: 'private', label: 'Private (members only)' },
          { value: 'company', label: 'Company-wide (visible to all company users)' },
        ]}
        disabled={!access.can('project:edit', projectId)}
      />
    </Group>
  </Stack>
</Paper>

  const members = projectMembershipsQ.data ?? [];

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={4}>Project settings</Title>
          <Text c="dimmed" size="sm">
            {company.data?.name ?? companyId} • {project.data.name}
          </Text>
        </Stack>
        <Badge variant="light" color={canManageMembers ? 'gray' : 'red'}>
          {canManageMembers ? 'Can manage members' : 'Read-only'}
        </Badge>
      </Group>

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
              style={{ minWidth: 320 }}
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
              style={{ minWidth: 200 }}
            />
            <Button
              disabled={!canManageMembers || !memberUserId || !memberRole}
              onClick={async () => {
                if (!memberUserId || !memberRole) return;
                await upsert.mutateAsync({ userId: memberUserId, role: memberRole });
              }}
            >
              Add to project
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Users can hold multiple roles across different projects.
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Title order={5}>Current members</Title>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {members.map((m, idx) => {
                const u = (usersQ.data ?? []).find((x) => x.id === m.userId);
                if (!companyUsers.some((cu) => cu.id === m.userId)) return null;
                return (
                  <Table.Tr key={`${m.projectId}:${m.userId}:${m.role}:${idx}`}>
                    <Table.Td>
                      <Stack gap={4}>
                        <Text fw={600}>{u ? u.name : m.userId}</Text>
                        {u && (
                          <Text size="xs" c="dimmed">
                            {u.email}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">{m.role}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        disabled={!canManageMembers}
                        onClick={() =>
                          del.mutate({ userId: m.userId, role: m.role })
                        }
                      >
                        Remove
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>
    </Stack>
  );
}
