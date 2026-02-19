import React, { useMemo, useState } from "react";
import { Button, Group, Select, Stack, Table, Text } from "@mantine/core";
import { useAppStore } from "../../context/AppStore";
import type { CompanyRole, ProjectRole } from "../../types";
import { asCompanyId, asProjectId, asUserId } from "../../types";

export default function AccessTab() {
  const store = useAppStore();

  const companyOptions = useMemo(
    () => store.companies.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name })),
    [store.companies]
  );
  const userOptions = useMemo(() => store.users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })), [store.users]);
  const projectOptions = useMemo(() => store.projects.map((p) => ({ value: p.id, label: p.name })), [store.projects]);

  const [companyId, setCompanyId] = useState<string>(store.activeCompanyId);
  const [userId, setUserId] = useState<string | null>(null);
  const [companyRole, setCompanyRole] = useState<CompanyRole>("member");

  const [projectId, setProjectId] = useState<string>(store.activeProjectId ?? "");
  const [pmUserId, setPmUserId] = useState<string | null>(null);
  const [projectRole, setProjectRole] = useState<ProjectRole>("member");

  const companyMembershipRows = store.companyMemberships.map((m, idx) => {
    const c = store.companies.find((x) => x.id === m.companyId);
    const u = store.users.find((x) => x.id === m.userId);
    return (
      <Table.Tr key={idx}>
        <Table.Td>{c?.name ?? "-"}</Table.Td>
        <Table.Td>{u?.name ?? "-"}</Table.Td>
        <Table.Td>{m.role}</Table.Td>
        <Table.Td>
          <Button size="xs" variant="subtle" color="red" onClick={() => store.removeCompanyMembership(m.companyId, m.userId, m.role)}>
            Remove
          </Button>
        </Table.Td>
      </Table.Tr>
    );
  });

  const projectMembershipRows = store.projectMemberships.map((m, idx) => {
    const p = store.projects.find((x) => x.id === m.projectId);
    const u = store.users.find((x) => x.id === m.userId);
    return (
      <Table.Tr key={idx}>
        <Table.Td>{p?.name ?? "-"}</Table.Td>
        <Table.Td>{u?.name ?? "-"}</Table.Td>
        <Table.Td>{m.role}</Table.Td>
        <Table.Td>
          <Button size="xs" variant="subtle" color="red" onClick={() => store.removeProjectMembership(m.projectId, m.userId, m.role)}>
            Remove
          </Button>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Text fw={600}>Company access</Text>
        <Group align="flex-end">
          <Select label="Tenant" data={companyOptions} value={companyId} onChange={(v) => v && setCompanyId(v)} searchable />
          <Select label="User" data={userOptions} value={userId} onChange={setUserId} searchable />
          <Select
            label="Role"
            data={["superadmin", "admin", "executive", "management", "member"]}
            value={companyRole}
            onChange={(v) => v && setCompanyRole(v as CompanyRole)}
          />
          <Button
            onClick={() => {
              if (!userId) return;
              store.upsertCompanyMembership(asCompanyId(companyId), asUserId(userId), companyRole);
            }}
          >
            Grant
          </Button>
        </Group>

        <Table withTableBorder withColumnBorders striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tenant</Table.Th>
              <Table.Th>User</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th style={{ width: 120 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{companyMembershipRows}</Table.Tbody>
        </Table>
      </Stack>

      <Stack gap="sm">
        <Text fw={600}>Project access</Text>
        <Group align="flex-end">
          <Select label="Project" data={projectOptions} value={projectId} onChange={(v) => v && setProjectId(v)} searchable />
          <Select label="User" data={userOptions} value={pmUserId} onChange={setPmUserId} searchable />
          <Select
            label="Role"
            data={["owner", "lead", "member", "viewer"]}
            value={projectRole}
            onChange={(v) => v && setProjectRole(v as ProjectRole)}
          />
          <Button
            onClick={() => {
              if (!pmUserId || !projectId) return;
              store.upsertProjectMembership(asProjectId(projectId), asUserId(pmUserId), projectRole);
            }}
          >
            Grant
          </Button>
        </Group>

        <Table withTableBorder withColumnBorders striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Project</Table.Th>
              <Table.Th>User</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th style={{ width: 120 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{projectMembershipRows}</Table.Tbody>
        </Table>
      </Stack>
    </Stack>
  );
}
