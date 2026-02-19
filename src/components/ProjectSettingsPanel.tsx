import React, { useMemo, useState } from 'react';
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
import { useAppStore } from '../context/AppStore';
import { can } from '../utils/auth';

export default function ProjectSettingsPanel() {
  const store = useAppStore();

  const projectId = store.activeProjectId;
  const project = store.projects.find((p) => p.id === projectId);
  const companyId = project.companyId;
  const company = store.companies.find((c) => c.id === companyId);

  if (!projectId || !project) {
    return (
      <Paper withBorder radius="lg" p="lg">
        <Stack>
          <Title order={4}>No project selected</Title>
          <Text c="dimmed">Select a project from the dashboard.</Text>
        </Stack>
      </Paper>
    );
  }

  const canManageMembers =
    can({
      userId: store.currentUser.id,
      companyId,
      projectId,
      action: 'project:edit',
      companyMemberships: store.companyMemberships,
      projectMemberships: store.projectMemberships,
    }) ||
    can({
      userId: store.currentUser.id,
      companyId,
      projectId,
      action: 'txns:edit',
      companyMemberships: store.companyMemberships,
      projectMemberships: store.projectMemberships,
    });

  const companyUsers = useMemo(
    () => store.getCompanyUsers(companyId),
    [store, companyId]
  );
  const userOptions = useMemo(
    () =>
      companyUsers.map((u) => ({
        value: u.id,
        label: `${u.name} (${u.email})`,
      })),
    [companyUsers]
  );

  const [memberUserId, setMemberUserId] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<ProjectRole | null>('member');

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={4}>Project settings</Title>
          <Text c="dimmed" size="sm">
            {company?.name ?? companyId} • {project.name}
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
              onChange={setMemberUserId}
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
              onClick={() => {
                if (!memberUserId || !memberRole) return;
                store.upsertProjectMembership(
                  projectId,
                  memberUserId,
                  memberRole ?? 'member'
                );
              }}
            >
              Add to project
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Users can hold multiple roles across different projects (e.g. lead
            on Alpha, member on Beta).
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
              {store.projectMemberships
                .filter((m) => m.projectId === projectId)
                .map((m, idx) => {
                  const u = store.users.find((x) => x.id === m.userId);
                  // hide users outside company hard
                  if (!companyUsers.some((cu) => cu.id === m.userId))
                    return null;
                  return (
                    <Table.Tr
                      key={`${m.projectId}:${m.userId}:${m.role}:${idx}`}
                    >
                      <Table.Td>
                        <Stack gap={4}>
                          <Text fw={600}>{u ? u.name : m.userId}</Text>
                          <Group gap={6}>
                            {store
                              .getUserProjectRoles(projectId, m.userId)
                              .map((r) => (
                                <Badge key={r} variant="light" size="sm">
                                  {r}
                                </Badge>
                              ))}
                          </Group>
                          {u && (
                            <Text size="xs" c="dimmed">
                              {u.email}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>{m.role}</Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          disabled={!canManageMembers}
                          onClick={() =>
                            store.removeProjectMembership(
                              m.projectId,
                              m.userId,
                              m.role
                            )
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
