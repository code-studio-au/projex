import React, { useMemo, useState } from "react";
import { Button, Container, Group, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useAppStore } from "../context/AppStore";

export default function SuperAdminPage(props: { onBack: () => void }) {
  const { onBack } = props;
  const store = useAppStore();

  const isOwner = store.isAppOwner(store.currentUser.id);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [companyForProject, setCompanyForProject] = useState<string | null>(store.activeCompanyId);

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");

  const companyOptions = useMemo(() => store.companies.map((c) => ({ value: c.id, label: c.name })), [store.companies]);
  const userOptions = useMemo(() => store.users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })), [store.users]);
  const projectOptions = useMemo(
    () => store.projects.map((p) => ({ value: p.id, label: `${store.companies.find((c) => c.id === p.companyId)?.name ?? ""} • ${p.name}` })),
    [store.projects, store.companies]
  );

  const [membershipCompanyId, setMembershipCompanyId] = useState<string | null>(store.activeCompanyId);
  const [membershipUserId, setMembershipUserId] = useState<string | null>(store.currentUser.id);
  const [membershipCompanyRole, setMembershipCompanyRole] = useState<string | null>("member");

  const [membershipProjectId, setMembershipProjectId] = useState<string | null>(store.activeProjectId);
  const [membershipProjectRole, setMembershipProjectRole] = useState<string | null>("member");

  if (!isOwner) {
    return (
      <Container size="md" py={48}>
        <Paper withBorder radius="lg" p="lg">
          <Stack>
            <Title order={3}>Access denied</Title>
            <Text c="dimmed">This page is restricted to the App Owner / Super Admin.</Text>
            <Button onClick={onBack}>Back</Button>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size="xl" py={24}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={3}>App settings</Title>
            <Text c="dimmed" size="sm">
              Super Admin only: manage tenants, users, and memberships.
            </Text>
          </Stack>
          <Button variant="light" onClick={onBack}>
            Back
          </Button>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          <Paper withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <Title order={5}>Add company</Title>
              <TextInput label="Company name" value={newCompanyName} onChange={(e) => setNewCompanyName(e.currentTarget.value)} />
              <Button
                onClick={() => {
                  const name = newCompanyName.trim();
                  if (!name) return;
                  store.addCompany(name);
                  setNewCompanyName("");
                }}
              >
                Create company
              </Button>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <Title order={5}>Add project</Title>
              <Select label="Company" data={companyOptions} value={companyForProject} onChange={setCompanyForProject} searchable />
              <TextInput label="Project name" value={newProjectName} onChange={(e) => setNewProjectName(e.currentTarget.value)} />
              <Button
                onClick={() => {
                  if (!companyForProject) return;
                  const name = newProjectName.trim();
                  if (!name) return;
                  store.addProject(companyForProject, name);
                  setNewProjectName("");
                }}
              >
                Create project
              </Button>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <Title order={5}>Add user</Title>
              <TextInput label="Name" value={newUserName} onChange={(e) => setNewUserName(e.currentTarget.value)} />
              <TextInput label="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.currentTarget.value)} />
              <Button
                onClick={() => {
                  const name = newUserName.trim();
                  const email = newUserEmail.trim();
                  if (!name || !email) return;
                  store.addUser(name, email);
                  setNewUserName("");
                  setNewUserEmail("");
                }}
              >
                Create user
              </Button>
            </Stack>
          </Paper>
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Paper withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <Title order={5}>Tenants</Title>
              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Tenant ID</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {store.companies.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>{c.name}</Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {c.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Button size="xs" color="red" variant="light" onClick={() => store.removeCompany(c.id)} disabled={c.id === "co_projex"}>
                          Remove
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <Title order={5}>Projects</Title>
              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Project</Table.Th>
                    <Table.Th>Company</Table.Th>
                    <Table.Th>Project ID</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {store.projects.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>{p.name}</Table.Td>
                      <Table.Td>{store.companies.find((c) => c.id === p.companyId)?.name ?? ""}</Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {p.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Button size="xs" color="red" variant="light" onClick={() => store.removeProject(p.id)}>
                          Remove
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Paper>
        </SimpleGrid>

        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Title order={5}>Users</Title>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>User ID</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {store.users.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td>{u.name}</Table.Td>
                    <Table.Td>{u.email}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {u.id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Button size="xs" color="red" variant="light" onClick={() => store.removeUser(u.id)} disabled={u.id === store.appOwnerUserId}>
                        Remove
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Paper>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Paper withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <Title order={5}>Company memberships</Title>
              <Select label="Company" data={companyOptions} value={membershipCompanyId} onChange={setMembershipCompanyId} searchable />
              <Select label="User" data={userOptions} value={membershipUserId} onChange={setMembershipUserId} searchable />
              <Select
                label="Role"
                data={[
                  { value: "superadmin", label: "superadmin" },
                  { value: "admin", label: "admin" },
                  { value: "executive", label: "executive" },
                  { value: "management", label: "management" },
                  { value: "member", label: "member" },
                ]}
                value={membershipCompanyRole}
                onChange={setMembershipCompanyRole}
              />
              <Button
                onClick={() => {
                  if (!membershipCompanyId || !membershipUserId || !membershipCompanyRole) return;
                  store.upsertCompanyMembership(membershipCompanyId, membershipUserId, membershipCompanyRole as any);
                }}
              >
                Add role
              </Button>

              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Company</Table.Th>
                    <Table.Th>User</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {store.companyMemberships.map((m, i) => (
                    <Table.Tr key={`${m.companyId}:${m.userId}:${m.role}:${i}`}>
                      <Table.Td>{store.companies.find((c) => c.id === m.companyId)?.name ?? m.companyId}</Table.Td>
                      <Table.Td>{store.users.find((u) => u.id === m.userId)?.name ?? m.userId}</Table.Td>
                      <Table.Td>{m.role}</Table.Td>
                      <Table.Td>
                        <Button size="xs" color="red" variant="light" onClick={() => store.removeCompanyMembership(m.companyId, m.userId, m.role)}>
                          Remove
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <Title order={5}>Project memberships</Title>
              <Select label="Project" data={projectOptions} value={membershipProjectId} onChange={setMembershipProjectId} searchable />
              <Select label="User" data={userOptions} value={membershipUserId} onChange={setMembershipUserId} searchable />
              <Select
                label="Role"
                data={[
                  { value: "owner", label: "owner" },
                  { value: "lead", label: "lead" },
                  { value: "member", label: "member" },
                  { value: "viewer", label: "viewer" },
                ]}
                value={membershipProjectRole}
                onChange={setMembershipProjectRole}
              />
              <Button
                onClick={() => {
                  if (!membershipProjectId || !membershipUserId || !membershipProjectRole) return;
                  store.upsertProjectMembership(membershipProjectId, membershipUserId, membershipProjectRole as any);
                }}
              >
                Add role
              </Button>

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
                  {store.projectMemberships.map((m, i) => (
                    <Table.Tr key={`${m.projectId}:${m.userId}:${m.role}:${i}`}>
                      <Table.Td>{store.projects.find((p) => p.id === m.projectId)?.name ?? m.projectId}</Table.Td>
                      <Table.Td>{store.users.find((u) => u.id === m.userId)?.name ?? m.userId}</Table.Td>
                      <Table.Td>{m.role}</Table.Td>
                      <Table.Td>
                        <Button size="xs" color="red" variant="light" onClick={() => store.removeProjectMembership(m.projectId, m.userId, m.role)}>
                          Remove
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Paper>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
