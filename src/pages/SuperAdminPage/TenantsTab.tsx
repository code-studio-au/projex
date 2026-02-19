import React, { useMemo, useState } from "react";
import { Button, Group, Modal, Stack, Table, Text, TextInput } from "@mantine/core";
import { useAppStore } from "../../context/AppStore";

export default function TenantsTab() {
  const store = useAppStore();
  const companies = useMemo(() => store.companies.filter((c) => !c.archived), [store.companies]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const rows = companies.map((c) => (
    <Table.Tr key={c.id}>
      <Table.Td>{c.name}</Table.Td>
      <Table.Td>
        <Group justify="flex-end">
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              store.setActiveCompanyId(c.id);
            }}
          >
            Select
          </Button>
          <Button size="xs" color="red" variant="subtle" onClick={() => store.removeCompany(c.id)}>
            Remove
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Tenants</Text>
        <Button onClick={() => setOpen(true)}>Create Tenant</Button>
      </Group>

      <Table withTableBorder withColumnBorders striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th style={{ width: 220 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>

      <Modal opened={open} onClose={() => setOpen(false)} title="Create Tenant" centered>
        <Stack>
          <TextInput label="Tenant name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button
              onClick={() => {
                const n = name.trim();
                if (!n) return;
                const id = store.addCompany(n);
                store.setActiveCompanyId(id);
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
