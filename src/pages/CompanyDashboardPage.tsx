import React, { useMemo } from 'react';
import { Button, Card, Group, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';

import type { CompanyId } from '../types';
import { useCompanyQuery, useProjectsQuery } from '../queries/reference';
import CompanySettingsPanel from '../components/CompanySettingsPanel';
import { companyRoute, projectRoute } from '../router';
import { useCompanyAccess } from '../hooks/useCompanyAccess';

export default function CompanyDashboardPage() {
  // Use the route object's hook to avoid `from` mismatches across router versions.
  const { companyId } = companyRoute.useParams() as { companyId: CompanyId };

  const companyQ = useCompanyQuery(companyId);
  const projectsQ = useProjectsQuery(companyId);

  const access = useCompanyAccess(companyId);
  const canEditCompany = access.can('company:edit');

  const rows = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={2}>{companyQ.data?.name ?? 'Company'}</Title>
          <Text c="dimmed">Projects and settings</Text>
        </Stack>
        <Button component={Link} to="/" variant="light">
          Switch company
        </Button>
      </Group>

      <Tabs defaultValue="projects" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="projects">Projects</Tabs.Tab>
          <Tabs.Tab value="settings" disabled={!canEditCompany}>
            Settings
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="projects" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
            {rows.map((p) => (
              <Card key={p.id} withBorder radius="lg" p="md">
                <Stack gap={6}>
                  <Text fw={700}>{p.name}</Text>
                  <Text size="sm" c="dimmed" lineClamp={2}>
                    {p.description || p.id}
                  </Text>
                  <Group justify="space-between" mt="sm">
                    <Button
                      component={Link}
                      to={projectRoute.fullPath}
                      params={{ companyId, projectId: p.id }}
                      variant="light"
                    >
                      Open workspace
                    </Button>
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>

          {rows.length === 0 && (
            <Card withBorder radius="lg" p="md" mt="md">
              <Text c="dimmed">No projects found for this company.</Text>
            </Card>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="settings" pt="md">
          <CompanySettingsPanel companyId={companyId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
