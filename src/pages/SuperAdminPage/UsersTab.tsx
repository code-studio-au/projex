import React, { useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useAppStore } from '../../context/AppStore';

export default function UsersTab() {
  const store = useAppStore();
  const users = useMemo(() => store.users, [store.users]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const rows = users.map((u) => (
    <Table.Tr key={u.id}>
      <Table.Td>{u.name}</Table.Td>
      <Table.Td>{u.email}</Table.Td>
      <Table.Td>{u.disabled ? 'Disabled' : 'Active'}</Table.Td>
      <Table.Td>
        <Group justify="flex-end">
          <Button
            size="xs"
            color="red"
            variant="subtle"
            onClick={() => store.removeUser(u.id)}
          >
            Remove
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Users</Text>
        <Button onClick={() => setOpen(true)}>Create User</Button>
      </Group>

      <Table withTableBorder withColumnBorders striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th style={{ width: 140 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>

      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Create User"
        centered
      >
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              onClick={() => {
                const n = name.trim();
                const e = email.trim();
                if (!n || !e) return;
                store.addUser(n, e);
                setName('');
                setEmail('');
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
