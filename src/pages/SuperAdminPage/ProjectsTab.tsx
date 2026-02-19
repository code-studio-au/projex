import React, { useMemo, useState } from "react";
import { Button, Group, Modal, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useAppStore } from "../../context/AppStore";

export default function ProjectsTab() {
  const store = useAppStore();
  const companies = useMemo(() => store.companies.filter((c) => !c.archived), [store.companies]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState<string>(store.activeCompanyId);

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));

  const rows = store.projects.map((p) => {
    const c = store.companies.find((x) => x.id === p.companyId);
    return (
      <Table.Tr key={p.id}>
        <Table.Td>{p.name}</Table.Td>
        <Table.Td>{c?.name ?? "-"}</Table.Td>
        <Table.Td>{p.currency}</Table.Td>
        <Table.Td>{p.status}</Table.Td>
        <Table.Td>
          <Group justify="flex-end">
            <Button size="xs" variant="subtle" onClick={() => store.setActiveProjectId(p.id)}>
              Select
            </Button>
            <Button size="xs" color="red" variant="subtle" onClick={() => store.removeProject(p.id)}>
              Remove
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Projects</Text>
        <Button onClick={() => setOpen(true)}>Create Project</Button>
      </Group>

      <Table withTableBorder withColumnBorders striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Tenant</Table.Th>
            <Table.Th>Currency</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th style={{ width: 220 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>

      <Modal opened={open} onClose={() => setOpen(false)} title="Create Project" centered>
        <Stack>
          <Select
            label="Tenant"
            data={companyOptions}
            value={companyId}
            onChange={(v) => v && setCompanyId(v)}
            searchable
          />
          <TextInput label="Project name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button
              onClick={() => {
                const n = name.trim();
                if (!n) return;
                const id = store.addProject(asCompanyId(companyId), n);
                store.setActiveProjectId(id);
                setName("");
                setOpen(false);
              }}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
