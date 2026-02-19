import React, { useState } from 'react';
import {
  Button,
  Container,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { useAppStore } from '../../context/AppStore';
import TenantsTab from './TenantsTab';
import ProjectsTab from './ProjectsTab';
import UsersTab from './UsersTab';
import AccessTab from './AccessTab';
import AppTab from './AppTab';

export default function SuperAdminPage(props: { onBack: () => void }) {
  const { onBack } = props;
  const store = useAppStore();

  const isOwner = store.isAppOwner(store.currentUser.id);
  const [tab, setTab] = useState<string | null>('app');

  if (!isOwner) {
    return (
      <Container size="md">
        <Stack>
          <Title order={3}>Access denied</Title>
          <Text c="dimmed">Only the app owner can access these settings.</Text>
          <Button onClick={onBack}>Back</Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Super Admin</Title>
          <Button variant="light" onClick={onBack}>
            Back
          </Button>
        </Group>

        <Tabs value={tab} onChange={setTab}>
          <Tabs.List>
            <Tabs.Tab value="app">App</Tabs.Tab>
            <Tabs.Tab value="tenants">Tenants</Tabs.Tab>
            <Tabs.Tab value="projects">Projects</Tabs.Tab>
            <Tabs.Tab value="users">Users</Tabs.Tab>
            <Tabs.Tab value="access">Access</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="app" pt="md">
            <AppTab />
          </Tabs.Panel>
          <Tabs.Panel value="tenants" pt="md">
            <TenantsTab />
          </Tabs.Panel>
          <Tabs.Panel value="projects" pt="md">
            <ProjectsTab />
          </Tabs.Panel>
          <Tabs.Panel value="users" pt="md">
            <UsersTab />
          </Tabs.Panel>
          <Tabs.Panel value="access" pt="md">
            <AccessTab />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
