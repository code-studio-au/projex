import React, { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { MantineReactTable, type MRT_ColumnDef } from "mantine-react-table";
import { useAppStore } from "../context/AppStore";
import type { CompanyRole, Id, ProjectRole } from "../types";

type UserRow = {
  id: Id;
  name: string;
  email: string;
  companyId: Id | null;
  companyName: string;
  companyRoles: CompanyRole[];
  disabled?: boolean;
};

type ProjectRow = {
  id: Id;
  name: string;
  companyId: Id;
  companyName: string;
  currency: string;
  status: string;
};

export default function SuperAdminPage(props: { onBack: () => void }) {
  const { onBack } = props;
  const store = useAppStore();

  const isOwner = store.isAppOwner(store.currentUser.id);
  const [tab, setTab] = useState<string | null>("app");

  // Create Tenant modal
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");

  // Create Project modal
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectCompanyId, setProjectCompanyId] = useState<Id | null>(store.activeCompanyId);

  // Create User modal
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [userCompanyId, setUserCompanyId] = useState<Id | null>(store.activeCompanyId);
  const [userCompanyRoles, setUserCompanyRoles] = useState<CompanyRole[]>(["member"]);

  // Membership assignment (Company)
  const [memberCompanyId, setMemberCompanyId] = useState<Id | null>(store.activeCompanyId);
  const [memberUserId, setMemberUserId] = useState<Id | null>(null);
  const [memberCompanyRole, setMemberCompanyRole] = useState<CompanyRole>("member");

  // Membership assignment (Project)
  const [pmProjectId, setPmProjectId] = useState<Id | null>(store.activeProjectId);
  const [pmUserId, setPmUserId] = useState<Id | null>(null);
  const [pmRole, setPmRole] = useState<ProjectRole>("member");

  const companyOptions = useMemo(
    () => store.companies.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name })),
    [store.companies]
  );

  const userRows: UserRow[] = useMemo(() => {
    return store.users.map((u) => {
      const companyId = store.getUserCompanyId(u.id);
      const companyName = companyId ? store.companies.find((c) => c.id === companyId)?.name ?? companyId : "—";
      const roles = companyId ? store.getUserCompanyRoles(u.id) : [];
      return { id: u.id, name: u.name, email: u.email, companyId, companyName, companyRoles: roles, disabled: u.disabled };
    });
  }, [store.users, store.companyMemberships, store.companies]);

  const projectRows: ProjectRow[] = useMemo(() => {
    return store.projects.map((p) => ({
      id: p.id,
      name: p.name,
      companyId: p.companyId,
      companyName: store.companies.find((c) => c.id === p.companyId)?.name ?? p.companyId,
      currency: p.currency,
      status: p.status,
    }));
  }, [store.projects, store.companies]);

  const userColumns = useMemo<MRT_ColumnDef<UserRow>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "email", header: "Email" },
      { accessorKey: "companyName", header: "Company", enableGrouping: true },
      {
        accessorKey: "companyRoles",
        header: "Company roles",
        Cell: ({ cell }) => {
          const roles = cell.getValue<CompanyRole[]>() ?? [];
          if (!roles.length) return <Text c="dimmed">—</Text>;
          return (
            <Group gap={6} wrap="wrap">
              {roles.map((r) => (
                <Badge key={r} variant="light" size="sm">
                  {r}
                </Badge>
              ))}
            </Group>
          );
        },
        filterFn: "arrIncludesSome",
      },
      {
        accessorKey: "disabled",
        header: "Disabled",
        Cell: ({ cell }) => (cell.getValue<boolean>() ? <Badge color="red">disabled</Badge> : <Badge color="green">active</Badge>),
      },
    ],
    []
  );

  const projectColumns = useMemo<MRT_ColumnDef<ProjectRow>[]>(
    () => [
      { accessorKey: "name", header: "Project" },
      { accessorKey: "companyName", header: "Company", enableGrouping: true },
      { accessorKey: "currency", header: "Currency" },
      {
        accessorKey: "status",
        header: "Status",
        Cell: ({ cell }) => {
          const v = cell.getValue<string>();
          return v === "archived" ? <Badge color="gray">archived</Badge> : <Badge color="green">active</Badge>;
        },
      },
    ],
    []
  );

  const companyMembershipRows = useMemo(
    () =>
      store.companyMemberships.map((m) => ({
        companyId: m.companyId,
        companyName: store.companies.find((c) => c.id === m.companyId)?.name ?? m.companyId,
        userId: m.userId,
        userName: store.users.find((u) => u.id === m.userId)?.name ?? m.userId,
        role: m.role,
      })),
    [store.companyMemberships, store.companies, store.users]
  );

  const projectMembershipRows = useMemo(
    () =>
      store.projectMemberships.map((m) => {
        const proj = store.projects.find((p) => p.id === m.projectId);
        return {
          projectId: m.projectId,
          projectName: proj?.name ?? m.projectId,
          companyName: proj ? store.companies.find((c) => c.id === proj.companyId)?.name ?? proj.companyId : "—",
          userId: m.userId,
          userName: store.users.find((u) => u.id === m.userId)?.name ?? m.userId,
          role: m.role,
        };
      }),
    [store.projectMemberships, store.projects, store.companies, store.users]
  );

  const companyMembershipColumns = useMemo<MRT_ColumnDef<(typeof companyMembershipRows)[number]>[]>(
    () => [
      { accessorKey: "companyName", header: "Company", enableGrouping: true },
      { accessorKey: "userName", header: "User" },
      { accessorKey: "role", header: "Role" },
    ],
    []
  );

  const projectMembershipColumns = useMemo<MRT_ColumnDef<(typeof projectMembershipRows)[number]>[]>(
    () => [
      { accessorKey: "companyName", header: "Company", enableGrouping: true },
      { accessorKey: "projectName", header: "Project" },
      { accessorKey: "userName", header: "User" },
      { accessorKey: "role", header: "Role" },
    ],
    []
  );

  if (!isOwner) {
    return (
      <Container size="lg" py="xl">
        <Paper withBorder radius="lg" p="lg">
          <Stack>
            <Title order={3}>Super Admin</Title>
            <Text c="dimmed">You don’t have access to this page.</Text>
            <Button variant="light" onClick={onBack}>
              Back
            </Button>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={2}>Super Admin</Title>
            <Text c="dimmed">Global app administration — tenants, users, projects, and memberships.</Text>
          </Stack>
          <Button variant="light" onClick={onBack}>
            Back
          </Button>
        </Group>

        <Paper withBorder radius="lg" p="md">
          <Tabs value={tab} onChange={setTab}>
            <Tabs.List>
              <Tabs.Tab value="app">App settings</Tabs.Tab>
              <Tabs.Tab value="tenants">Tenants</Tabs.Tab>
              <Tabs.Tab value="users">Users</Tabs.Tab>
              <Tabs.Tab value="projects">Projects</Tabs.Tab>
              <Tabs.Tab value="membership">Membership</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="app" pt="md">
              <Stack gap="md">
                <Title order={4}>Local state</Title>
                <Text c="dimmed" size="sm">
                  You can clear local storage or overwrite it with the seed demo state. This reloads the app.
                </Text>
                <Group>
                  <Button color="red" variant="light" onClick={() => store.clearLocalState()}>
                    Clear local state
                  </Button>
                  <Button color="orange" variant="light" onClick={() => store.applySeedState()}>
                    Re-apply seed demo data
                  </Button>
                </Group>

                <Divider />

                <Title order={4}>Safety</Title>
                <Text c="dimmed" size="sm">
                  Projects and companies are soft-deleted (archived) so you can restore data later.
                </Text>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="tenants" pt="md">
              <Stack gap="md">
                <Group justify="space-between" align="flex-end">
                  <Stack gap={2}>
                    <Title order={4}>Tenants</Title>
                    <Text c="dimmed" size="sm">
                      Create and archive companies. Super Admin can impersonate any tenant via the dashboard.
                    </Text>
                  </Stack>
                  <Button onClick={() => setAddTenantOpen(true)}>Add tenant</Button>
                </Group>

                <MantineReactTable
                  columns={[
                    { accessorKey: "name", header: "Company" },
                    { accessorKey: "id", header: "Company ID" },
                    {
                      accessorKey: "archived",
                      header: "Status",
                      Cell: ({ row }) => (row.original.archived ? <Badge color="gray">archived</Badge> : <Badge color="green">active</Badge>),
                    },
                  ] as MRT_ColumnDef<any>[]}
                  data={store.companies.map((c) => ({ ...c }))}
                  enableColumnFilters
                  enableSorting
                  enableGrouping
                  renderRowActions={({ row }) => (
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        disabled={row.original.id === "co_projex"}
                        onClick={() => store.removeCompany(row.original.id)}
                      >
                        Archive
                      </Button>
                    </Group>
                  )}
                  enableRowActions
                />

                <Modal opened={addTenantOpen} onClose={() => setAddTenantOpen(false)} title="Add tenant" centered>
                  <Stack>
                    <TextInput
                      label="Company name"
                      value={newTenantName}
                      onChange={(e) => setNewTenantName(e.currentTarget.value)}
                      placeholder="e.g. Acme Co"
                    />
                    <Button
                      onClick={() => {
                        const name = newTenantName.trim();
                        if (!name) return;
                        store.addCompany(name);
                        setNewTenantName("");
                        setAddTenantOpen(false);
                      }}
                    >
                      Create
                    </Button>
                  </Stack>
                </Modal>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="users" pt="md">
              <Stack gap="md">
                <Group justify="space-between" align="flex-end">
                  <Stack gap={2}>
                    <Title order={4}>Users</Title>
                    <Text c="dimmed" size="sm">
                      Manage global users. Use filtering/grouping to find users by company.
                    </Text>
                  </Stack>
                  <Button onClick={() => setAddUserOpen(true)}>Add user</Button>
                </Group>

                <MantineReactTable
                  columns={userColumns}
                  data={userRows}
                  enableColumnFilters
                  enableSorting
                  enableGrouping
                  initialState={{ grouping: ["companyName"] }}
                />

                <Modal opened={addUserOpen} onClose={() => setAddUserOpen(false)} title="Add user" centered>
                  <Stack>
                    <Select
                      label="Company"
                      data={companyOptions}
                      value={userCompanyId}
                      onChange={(v) => setUserCompanyId(v as Id)}
                      searchable
                    />
                    <TextInput label="Name" value={newUserName} onChange={(e) => setNewUserName(e.currentTarget.value)} />
                    <TextInput
                      label="Email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.currentTarget.value)}
                    />
                    <Select
                      label="Initial role"
                      data={[
                        { value: "member", label: "member" },
                        { value: "management", label: "management" },
                        { value: "executive", label: "executive" },
                        { value: "admin", label: "admin" },
                      ]}
                      value={userCompanyRoles[0]}
                      onChange={(v) => setUserCompanyRoles([(v as CompanyRole) ?? "member"])}
                    />
                    <Button
                      onClick={() => {
                        const name = newUserName.trim();
                        const email = newUserEmail.trim();
                        if (!name || !email || !userCompanyId) return;
                        store.addUserToCompany(userCompanyId, name, email, userCompanyRoles[0] ?? "member");
                        setNewUserName("");
                        setNewUserEmail("");
                        setAddUserOpen(false);
                      }}
                    >
                      Create
                    </Button>
                  </Stack>
                </Modal>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="projects" pt="md">
              <Stack gap="md">
                <Group justify="space-between" align="flex-end">
                  <Stack gap={2}>
                    <Title order={4}>Projects</Title>
                    <Text c="dimmed" size="sm">
                      Global projects view. Group by company and archive projects as needed.
                    </Text>
                  </Stack>
                  <Button onClick={() => setAddProjectOpen(true)}>Add project</Button>
                </Group>

                <MantineReactTable
                  columns={projectColumns}
                  data={projectRows}
                  enableColumnFilters
                  enableSorting
                  enableGrouping
                  initialState={{ grouping: ["companyName"] }}
                  renderRowActions={({ row }) => (
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => store.removeProject(row.original.id)}
                        disabled={row.original.status === "archived"}
                      >
                        Archive
                      </Button>
                    </Group>
                  )}
                  enableRowActions
                />

                <Modal opened={addProjectOpen} onClose={() => setAddProjectOpen(false)} title="Add project" centered>
                  <Stack>
                    <Select
                      label="Company"
                      data={companyOptions}
                      value={projectCompanyId}
                      onChange={(v) => setProjectCompanyId(v as Id)}
                      searchable
                    />
                    <TextInput
                      label="Project name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.currentTarget.value)}
                      placeholder="e.g. Alpha"
                    />
                    <Button
                      onClick={() => {
                        const name = newProjectName.trim();
                        if (!name || !projectCompanyId) return;
                        store.addProject(projectCompanyId, name);
                        setNewProjectName("");
                        setAddProjectOpen(false);
                      }}
                    >
                      Create
                    </Button>
                  </Stack>
                </Modal>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="membership" pt="md">
              <Stack gap="md">
                <Title order={4}>Membership</Title>
                <Text c="dimmed" size="sm">
                  Assign roles at the company and project levels. Tables below show all memberships.
                </Text>

                <Paper withBorder radius="lg" p="md">
                  <Stack gap="sm">
                    <Title order={5}>Assign company role</Title>
                    <Group align="flex-end" wrap="wrap">
                      <Select
                        label="Company"
                        data={companyOptions}
                        value={memberCompanyId}
                        onChange={(v) => setMemberCompanyId(v as Id)}
                        searchable
                        style={{ minWidth: 240 }}
                      />
                      <Select
                        label="User"
                        data={store.users
                          .filter((u) => !u.disabled)
                          .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
                        value={memberUserId}
                        onChange={(v) => setMemberUserId(v as Id)}
                        searchable
                        style={{ minWidth: 360 }}
                      />
                      <Select
                        label="Role"
                        data={[
                          { value: "member", label: "member" },
                          { value: "management", label: "management" },
                          { value: "executive", label: "executive" },
                          { value: "admin", label: "admin" },
                          { value: "superadmin", label: "superadmin" },
                        ]}
                        value={memberCompanyRole}
                        onChange={(v) => setMemberCompanyRole((v as CompanyRole) ?? "member")}
                        style={{ minWidth: 200 }}
                      />
                      <Button
                        onClick={() => {
                          if (!memberCompanyId || !memberUserId) return;
                          store.upsertCompanyMembership(memberCompanyId, memberUserId, memberCompanyRole);
                        }}
                      >
                        Assign
                      </Button>
                    </Group>

                    <MantineReactTable
                      columns={companyMembershipColumns}
                      data={companyMembershipRows}
                      enableColumnFilters
                      enableSorting
                      enableGrouping
                      initialState={{ grouping: ["companyName"] }}
                      enableRowActions
                      renderRowActions={({ row }) => (
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() =>
                            store.removeCompanyMembership(row.original.companyId, row.original.userId, row.original.role)
                          }
                        >
                          Remove
                        </Button>
                      )}
                    />
                  </Stack>
                </Paper>

                <Paper withBorder radius="lg" p="md">
                  <Stack gap="sm">
                    <Title order={5}>Assign project role</Title>
                    <Group align="flex-end" wrap="wrap">
                      <Select
                        label="Project"
                        data={store.projects.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))}
                        value={pmProjectId}
                        onChange={(v) => setPmProjectId(v as Id)}
                        searchable
                        style={{ minWidth: 320 }}
                      />
                      <Select
                        label="User"
                        data={store.users
                          .filter((u) => !u.disabled)
                          .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
                        value={pmUserId}
                        onChange={(v) => setPmUserId(v as Id)}
                        searchable
                        style={{ minWidth: 360 }}
                      />
                      <Select
                        label="Role"
                        data={[
                          { value: "viewer", label: "viewer" },
                          { value: "member", label: "member" },
                          { value: "lead", label: "lead" },
                          { value: "owner", label: "owner" },
                        ]}
                        value={pmRole}
                        onChange={(v) => setPmRole((v as ProjectRole) ?? "member")}
                        style={{ minWidth: 200 }}
                      />
                      <Button
                        onClick={() => {
                          if (!pmProjectId || !pmUserId) return;
                          store.upsertProjectMembership(pmProjectId, pmUserId, pmRole);
                        }}
                      >
                        Assign
                      </Button>
                    </Group>

                    <MantineReactTable
                      columns={projectMembershipColumns}
                      data={projectMembershipRows}
                      enableColumnFilters
                      enableSorting
                      enableGrouping
                      initialState={{ grouping: ["companyName"] }}
                      enableRowActions
                      renderRowActions={({ row }) => (
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() =>
                            store.removeProjectMembership(
                              (row.original as any).projectId,
                              (row.original as any).userId,
                              (row.original as any).role
                            )
                          }
                        >
                          Remove
                        </Button>
                      )}
                    />
                  </Stack>
                </Paper>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </Stack>
    </Container>
  );
}
