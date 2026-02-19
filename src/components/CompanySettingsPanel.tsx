import React, { useMemo, useState } from "react";
import { Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useAppStore } from "../context/AppStore";
import { can } from "../utils/auth";
import type { CompanyId, CompanyRole, ProjectId, ProjectRole, UserId } from "../types";
import { asProjectId, asUserId } from "../types";

const companyRoleRank: Record<CompanyRole, number> = {
  superadmin: 5,
  admin: 4,
  executive: 3,
  management: 2,
  member: 1,
};

export default function CompanySettingsPanel(props: { companyId: CompanyId }) {
  const { companyId } = props;
  const store = useAppStore();

  const company = store.companies.find((c) => c.id === companyId);

  const currentCompanyRole = store.getUserCompanyRole(store.currentUser.id) ?? "member";

  // Permissions requested:
  // - Execs can access company settings and add company users
  // - Execs + Managers can add projects
  const canAddProjects =
    currentCompanyRole === "superadmin" ||
    currentCompanyRole === "admin" ||
    currentCompanyRole === "executive" ||
    currentCompanyRole === "management";

  const canAddCompanyUsers =
    currentCompanyRole === "superadmin" || currentCompanyRole === "admin" || currentCompanyRole === "executive";

  const canAssignProjectRoles = canAddProjects; // keep simple for now

  // Only show members of THIS company (hard rule)
  const companyUsers = useMemo(() => store.getCompanyUsers(companyId), [store, companyId]);
  const userOptions = useMemo(
    () => companyUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
    [companyUsers]
  );

  const projects = useMemo(() => store.projects.filter((p) => p.companyId === companyId), [store.projects, companyId]);

  const [newProjectName, setNewProjectName] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<CompanyRole | null>("member");

  // Assign project role
  const [roleProjectId, setRoleProjectId] = useState<ProjectId | null>((projects[0]?.id ?? null) as ProjectId | null);
  const [roleUserId, setRoleUserId] = useState<UserId | null>((userOptions[0]?.value ?? null) as UserId | null);
  const [roleValue, setRoleValue] = useState<ProjectRole | null>("member");
  const [membershipCompanyRole, setMembershipCompanyRole] = useState<CompanyRole | null>("member");
  const highestRoleBadge = (
    <Badge variant="light">Your company role: {currentCompanyRole} (rank {companyRoleRank[currentCompanyRole]})</Badge>
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={4}>Company settings</Title>
          <Text size="sm" c="dimmed">
            {company?.name ?? companyId} • Manage projects, users, and project roles
          </Text>
        </Stack>
        {highestRoleBadge}
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>Create project</Title>
              <Badge variant="light" color={canAddCompanyUsers ? "gray" : "red"}>
                {canAddCompanyUsers ? "Allowed" : "Not allowed"}
              </Badge>
            </Group>
            <TextInput
              label="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.currentTarget.value)}
              placeholder="e.g. Website Refresh"
            />
            <Button
              disabled={!canAddCompanyUsers}
              onClick={() => {
                const name = newProjectName.trim();
                if (!name) return;
                const id = store.addProject(companyId, name);
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
            <Group justify="space-between">
              <Title order={5}>Add user (company)</Title>
              <Badge variant="light" color={canAddProjects ? "gray" : "red"}>
                {canAddProjects ? "Allowed" : "Not allowed"}
              </Badge>
            </Group>
            <TextInput label="Name" value={newUserName} onChange={(e) => setNewUserName(e.currentTarget.value)} />
            <TextInput label="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.currentTarget.value)} />
            <Select
              label="Initial company role"
              data={[
                { value: "member", label: "member" },
                { value: "management", label: "management" },
                { value: "executive", label: "executive" },
                { value: "admin", label: "admin" },
              ]}
              value={newUserRole}
              onChange={(v) => setNewUserRole((v as CompanyRole | null) ?? null)}
            />
            <Button
              disabled={!canAddProjects}
              onClick={() => {
                const name = newUserName.trim();
                const email = newUserEmail.trim();
                if (!name || !email) return;
                store.addUserToCompany(companyId, name, email, newUserRole ?? "member");
                setNewUserName("");
                setNewUserEmail("");
                setNewUserRole("member");
              }}
            >
              Create user
            </Button>
            <Text size="xs" c="dimmed">
              Users created here belong only to this company.
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Title order={5}>Assign users to projects</Title>
          <Group align="flex-end" wrap="wrap">
            <Select
              label="Project"
              data={projects.map((p) => ({ value: p.id, label: p.name }))}
              value={roleProjectId}
              onChange={(v) => setRoleProjectId(v ? asProjectId(v) : null)}
              searchable
              style={{ minWidth: 220 }}
            />
            <Select
              label="User (this company)"
              data={userOptions}
              value={roleUserId}
              onChange={(v) => setRoleUserId(v ? asUserId(v) : null)}
              searchable
              style={{ minWidth: 320 }}
            />
            <Select
              label="Role"
              data={[
                { value: "owner", label: "owner" },
                { value: "lead", label: "lead" },
                { value: "member", label: "member" },
                { value: "viewer", label: "viewer" },
              ]}
              value={roleValue}
              onChange={(v) => setRoleValue((v as ProjectRole | null) ?? null)}
              style={{ minWidth: 200 }}
            />
            <Button
              disabled={!canAssignProjectRoles || !roleProjectId || !roleUserId || !roleValue}
              onClick={() => {
                if (!roleProjectId || !roleUserId || !roleValue) return;
                store.upsertProjectMembership(roleProjectId, roleUserId, roleValue ?? "member");
              }}
            >
              Assign
            </Button>
          </Group>

          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Project</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {store.projectMemberships
                .filter((m) => {
                  const p = store.projects.find((x) => x.id === m.projectId);
                  return p?.companyId === companyId;
                })
                .map((m, idx) => {
                  const p = store.projects.find((x) => x.id === m.projectId);
                  const u = store.users.find((x) => x.id === m.userId);
                  // hide users outside company
                  if (!companyUsers.some((cu) => cu.id === m.userId)) return null;
                  return (
                    <Table.Tr key={`${m.projectId}:${m.userId}:${m.role}:${idx}`}>
                      <Table.Td>{p?.name ?? m.projectId}</Table.Td>
                      <Table.Td>{u ? `${u.name} (${u.email})` : m.userId}</Table.Td>
                      <Table.Td>{m.role}</Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          disabled={!canAddProjects}
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


      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Title order={5}>Assign company roles</Title>
          <Text size="sm" c="dimmed">
            Users can hold multiple company roles (e.g. executive + member). Permissions use the highest role.
          </Text>
          <Group align="flex-end" wrap="wrap">
            <Select
              label="User (this company)"
              data={userOptions}
              value={roleUserId}
              onChange={(v) => setRoleUserId(v ? asUserId(v) : null)}
              searchable
              style={{ minWidth: 320 }}
            />
            <Select
              label="Company role"
              data={[
                { value: "member", label: "member" },
                { value: "management", label: "management" },
                { value: "executive", label: "executive" },
                { value: "admin", label: "admin" },
              ]}
              value={membershipCompanyRole}
              onChange={(v) => setMembershipCompanyRole((v as CompanyRole | null) ?? null)}
              style={{ minWidth: 220 }}
            />
            <Button
              disabled={!canAddCompanyUsers || !roleUserId || !membershipCompanyRole}
              onClick={() => {
                if (!roleUserId || !membershipCompanyRole) return;
                store.upsertCompanyMembership(companyId, roleUserId, membershipCompanyRole ?? "member");
              }}
            >
              Add role
            </Button>
          </Group>

          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {store.companyMemberships
                .filter((m) => m.companyId === companyId && companyUsers.some((cu) => cu.id === m.userId))
                .map((m, idx) => {
                  const u = store.users.find((x) => x.id === m.userId);
                  return (
                    <Table.Tr key={`${m.companyId}:${m.userId}:${m.role}:${idx}`}>
                      <Table.Td>{u ? `${u.name} (${u.email})` : m.userId}</Table.Td>
                      <Table.Td>{m.role}</Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          disabled={!canAddCompanyUsers}
                          onClick={() => store.removeCompanyMembership(m.companyId, m.userId, m.role)}
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


      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Title order={5}>Projects</Title>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>ID</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projects.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>{p.name}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {p.id}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Title order={5}>Company users</Title>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Email</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {companyUsers.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td>{u.name}</Table.Td>
                    <Table.Td>{u.email}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
