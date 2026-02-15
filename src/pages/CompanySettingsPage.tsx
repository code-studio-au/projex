import React, { useMemo, useState } from "react";
import { Badge, Button, Container, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useAppStore } from "../context/AppStore";
import { can } from "../utils/auth";

export default function CompanySettingsPage(props: { onBack: () => void; onOpenProjectSettings: () => void }) {
  const { onBack, onOpenProjectSettings } = props;
  const store = useAppStore();

  const company = store.companies.find((c) => c.id === store.activeCompanyId);

  const canManageProjects = can({
    userId: store.currentUser.id,
    companyId: store.activeCompanyId,
    action: "project:edit",
    companyMemberships: store.companyMemberships,
    projectMemberships: store.projectMemberships,
  });

  const projects = useMemo(() => store.projects.filter((p) => p.companyId === store.activeCompanyId), [store.projects, store.activeCompanyId]);

  const [newProjectName, setNewProjectName] = useState("");

  // assign lead
  const userOptions = useMemo(() => store.users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })), [store.users]);
  const [leadProjectId, setLeadProjectId] = useState<string | null>(store.activeProjectId);
  const [leadUserId, setLeadUserId] = useState<string | null>(store.currentUser.id);

  return (
    <Container size="xl" py={24}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={3}>Company settings</Title>
            <Text c="dimmed" size="sm">
              {company?.name ?? store.activeCompanyId} • create projects and assign project leads
            </Text>
          </Stack>
          <Group gap="sm">
            <Button variant="light" onClick={onBack}>
              Back
            </Button>
          </Group>
        </Group>

        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>Create project</Title>
              <Badge variant="light" color={canManageProjects ? "gray" : "red"}>
                {canManageProjects ? "Allowed" : "Not allowed"}
              </Badge>
            </Group>
            <TextInput
              label="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.currentTarget.value)}
              placeholder="e.g. Website Refresh"
            />
            <Button
              disabled={!canManageProjects}
              onClick={() => {
                const name = newProjectName.trim();
                if (!name) return;
                const id = store.addProject(store.activeCompanyId, name);
                store.setActiveProjectId(id);
                setNewProjectName("");
              }}
            >
              Create project
            </Button>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Title order={5}>Assign project lead</Title>
            <Group align="flex-end" wrap="wrap">
              <Select
                label="Project"
                data={projects.map((p) => ({ value: p.id, label: p.name }))}
                value={leadProjectId}
                onChange={setLeadProjectId}
                searchable
                style={{ minWidth: 240 }}
              />
              <Select
                label="User"
                data={userOptions}
                value={leadUserId}
                onChange={setLeadUserId}
                searchable
                style={{ minWidth: 280 }}
              />
              <Button
                disabled={!canManageProjects || !leadProjectId || !leadUserId}
                onClick={() => {
                  if (!leadProjectId || !leadUserId) return;
                  store.upsertProjectMembership(leadProjectId, leadUserId, "lead");
                }}
              >
                Make lead
              </Button>
              <Button variant="light" onClick={onOpenProjectSettings} disabled={!store.activeProjectId}>
                Project settings →
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              Leads can assign team members on the project settings page.
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Title order={5}>Projects</Title>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Project</Table.Th>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Leads</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projects.map((p) => {
                  const leads = store.projectMemberships
                    .filter((m) => m.projectId === p.id && (m.role === "lead" || m.role === "owner"))
                    .map((m) => store.users.find((u) => u.id === m.userId)?.name ?? m.userId)
                    .join(", ");
                  return (
                    <Table.Tr key={p.id}>
                      <Table.Td>{p.name}</Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {p.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>{leads || <Text c="dimmed">—</Text>}</Table.Td>
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
