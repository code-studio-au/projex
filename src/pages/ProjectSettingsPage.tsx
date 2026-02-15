import React, { useMemo, useState } from "react";
import { Badge, Button, Container, Group, Paper, Select, Stack, Table, Text, Title } from "@mantine/core";
import { useAppStore } from "../context/AppStore";
import { can } from "../utils/auth";

export default function ProjectSettingsPage(props: { onBack: () => void }) {
  const { onBack } = props;
  const store = useAppStore();

  const projectId = store.activeProjectId;
  const project = store.projects.find((p) => p.id === projectId);
  const company = store.companies.find((c) => c.id === store.activeCompanyId);

  if (!projectId || !project) {
    return (
      <Container size="md" py={48}>
        <Paper withBorder radius="lg" p="lg">
          <Stack>
            <Title order={3}>No project selected</Title>
            <Text c="dimmed">Select a project to manage members.</Text>
            <Button onClick={onBack}>Back</Button>
          </Stack>
        </Paper>
      </Container>
    );
  }

  const canManageMembers = can({
    userId: store.currentUser.id,
    companyId: store.activeCompanyId,
    projectId,
    action: "project:edit",
    companyMemberships: store.companyMemberships,
    projectMemberships: store.projectMemberships,
  }) || can({
    userId: store.currentUser.id,
    companyId: store.activeCompanyId,
    projectId,
    action: "txns:edit",
    companyMemberships: store.companyMemberships,
    projectMemberships: store.projectMemberships,
  });

  // Restrict this page to leads/owners (or company exec/management via can(project:edit) already)
  const userOptions = useMemo(() => store.users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })), [store.users]);

  const [memberUserId, setMemberUserId] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>("member");

  return (
    <Container size="xl" py={24}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={3}>Project settings</Title>
            <Text c="dimmed" size="sm">
              {company?.name ?? store.activeCompanyId} • {project.name}
            </Text>
          </Stack>
          <Button variant="light" onClick={onBack}>
            Back
          </Button>
        </Group>

        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>Assign team members</Title>
              <Badge variant="light" color={canManageMembers ? "gray" : "red"}>
                {canManageMembers ? "Allowed" : "Not allowed"}
              </Badge>
            </Group>

            <Group align="flex-end" wrap="wrap">
              <Select
                label="User"
                data={userOptions}
                value={memberUserId}
                onChange={setMemberUserId}
                searchable
                style={{ minWidth: 320 }}
              />
              <Select
                label="Role"
                data={[
                  { value: "member", label: "member" },
                  { value: "viewer", label: "viewer" },
                ]}
                value={memberRole}
                onChange={setMemberRole}
                style={{ minWidth: 200 }}
              />
              <Button
                disabled={!canManageMembers || !memberUserId || !memberRole}
                onClick={() => {
                  if (!memberUserId || !memberRole) return;
                  store.upsertProjectMembership(projectId, memberUserId, memberRole as any);
                }}
              >
                Add to project
              </Button>
            </Group>

            <Text size="sm" c="dimmed">
              Project leads can add members/viewers. Owners can still do everything leads can.
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
                    return (
                      <Table.Tr key={`${m.projectId}:${m.userId}:${m.role}:${idx}`}>
                        <Table.Td>{u ? `${u.name} (${u.email})` : m.userId}</Table.Td>
                        <Table.Td>{m.role}</Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            disabled={!canManageMembers}
                            onClick={() => store.removeProjectMembership(m.projectId, m.userId, m.role)}
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
    </Container>
  );
}
