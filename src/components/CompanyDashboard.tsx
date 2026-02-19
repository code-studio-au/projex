import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useAppStore } from '../context/AppStore';
import { can } from '../utils/auth';
import { currency } from '../utils/finance';
import CompanySettingsPanel from './CompanySettingsPanel';
import type { CompanyId, ProjectId } from '../types';

export default function CompanyDashboard(props: {
  onOpenProject: (projectId: ProjectId) => void;
}) {
  const { onOpenProject } = props;
  const store = useAppStore();

  const isOwner = store.isAppOwner(store.currentUser.id);

  // For normal users: company is fixed. For owner: allow selecting a company to "impersonate" its dashboard.
  const userCompanyId =
    store.getUserCompanyId(store.currentUser.id) ?? store.activeCompanyId;

  const [selectedCompanyId, setSelectedCompanyId] = useState<CompanyId | null>(
    isOwner ? null : userCompanyId
  );

  React.useEffect(() => {
    const h = () => setSelectedCompanyId(null);
    window.addEventListener('superadmin:resetCompanySelection', h as any);
    return () =>
      window.removeEventListener('superadmin:resetCompanySelection', h as any);
  }, []);

  const effectiveCompanyId =
    (isOwner ? selectedCompanyId : userCompanyId) ?? userCompanyId;
  const effectiveCompany = store.companies.find(
    (c) => c.id === effectiveCompanyId
  );

  const companyRole =
    store.getUserCompanyRole(store.currentUser.id) ?? 'member';
  const canSeeCompanySettingsTab =
    companyRole === 'superadmin' ||
    companyRole === 'admin' ||
    companyRole === 'executive' ||
    companyRole === 'management';
  const canAddProjects =
    companyRole === 'superadmin' ||
    companyRole === 'admin' ||
    companyRole === 'executive' ||
    companyRole === 'management';

  const visibleProjects = useMemo(() => {
    const inCompany = store.projects.filter(
      (p) => p.companyId === effectiveCompanyId && p.status === 'active'
    );
    if (isOwner) return inCompany;
    return inCompany.filter((p) =>
      can({
        userId: store.currentUser.id,
        companyId: effectiveCompanyId,
        projectId: p.id,
        action: 'project:view',
        companyMemberships: store.companyMemberships,
        projectMemberships: store.projectMemberships,
      })
    );
  }, [store, effectiveCompanyId, isOwner]);

  const cards = useMemo(() => {
    return visibleProjects.map((p) => {
      const data = store.getProjectData(p.id);
      const total = data.transactions.reduce((a, b) => a + (b.amount ?? 0), 0);
      const uncoded = data.transactions.filter((t) => !t.subCategoryId).length;
      return { project: p, total, uncoded, count: data.transactions.length };
    });
  }, [visibleProjects, store]);

  // Add company / project modals (best UX for now)
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');

  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const companyList = useMemo(
    () => store.companies.filter((c) => c.id !== 'co_projex' && !c.archived),
    [store.companies]
  );

  // Owner landing: list companies
  if (isOwner && !selectedCompanyId) {
    return (
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={3}>Companies</Title>
            <Text c="dimmed">
              Select a company to view its projects and settings.
            </Text>
          </Stack>
          <Button onClick={() => setAddCompanyOpen(true)}>Add company</Button>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          {companyList.map((c) => (
            <Paper
              key={c.id}
              withBorder
              radius="lg"
              p="lg"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setSelectedCompanyId(c.id);
                store.setActiveCompanyId(c.id);
              }}
            >
              <Stack gap={6}>
                <Text fw={700}>{c.name}</Text>
                <Text size="sm" c="dimmed">
                  {c.id}
                </Text>
                <Badge variant="light">
                  {store.projects.filter((p) => p.companyId === c.id).length}{' '}
                  projects
                </Badge>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>

        <Modal
          opened={addCompanyOpen}
          onClose={() => setAddCompanyOpen(false)}
          title="Add company"
          centered
        >
          <Stack>
            <TextInput
              label="Company name"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.currentTarget.value)}
              placeholder="e.g. Acme Co"
            />
            <Button
              onClick={() => {
                const name = newCompanyName.trim();
                if (!name) return;
                const id = store.addCompany(name);
                setNewCompanyName('');
                setAddCompanyOpen(false);
                // jump straight into the company
                setSelectedCompanyId(id);
                store.setActiveCompanyId(id);
              }}
            >
              Create
            </Button>
          </Stack>
        </Modal>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={3}>{effectiveCompany?.name ?? 'Company'}</Title>
          <Text c="dimmed">
            {isOwner ? 'Super Admin view' : 'Your projects and reporting'} •
            Click a project card to open workspace
          </Text>
        </Stack>

        <Group gap="sm">
          {isOwner && (
            <Button variant="light" onClick={() => setSelectedCompanyId(null)}>
              Back to companies
            </Button>
          )}
          {(isOwner || canAddProjects) && (
            <Button onClick={() => setAddProjectOpen(true)}>Add project</Button>
          )}
        </Group>
      </Group>

      <Tabs defaultValue="projects">
        <Tabs.List>
          <Tabs.Tab value="projects">Projects</Tabs.Tab>
          {(isOwner || canSeeCompanySettingsTab) && (
            <Tabs.Tab value="companySettings">Company settings</Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="projects" pt="md">
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            {cards.map((c) => (
              <Paper
                key={c.project.id}
                withBorder
                radius="lg"
                p="lg"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  store.setActiveCompanyId(effectiveCompanyId);
                  store.setActiveProjectId(c.project.id);
                  onOpenProject(c.project.id);
                }}
              >
                <Stack gap={6}>
                  <Group justify="space-between">
                    <Text fw={700}>{c.project.name}</Text>
                    <Badge variant="light">
                      {currency(c.project.currency)}
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Transactions: {c.count} • Uncoded: {c.uncoded}
                  </Text>
                  <Text fw={700}>
                    Total spend: {currency(c.project.currency)}{' '}
                    {Math.round(c.total).toLocaleString()}
                  </Text>
                </Stack>
              </Paper>
            ))}
            {!cards.length && (
              <Paper withBorder radius="lg" p="lg">
                <Text c="dimmed">No projects available for this user.</Text>
              </Paper>
            )}
          </SimpleGrid>
        </Tabs.Panel>

        {(isOwner || canSeeCompanySettingsTab) && (
          <Tabs.Panel value="companySettings" pt="md">
            <CompanySettingsPanel companyId={effectiveCompanyId} />
          </Tabs.Panel>
        )}
      </Tabs>

      <Modal
        opened={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        title="Add project"
        centered
      >
        <Stack>
          <TextInput
            label="Project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.currentTarget.value)}
            placeholder="e.g. Alpha"
          />
          <Button
            onClick={() => {
              const name = newProjectName.trim();
              if (!name) return;
              const id = store.addProject(effectiveCompanyId, name);
              store.setActiveCompanyId(effectiveCompanyId);
              store.setActiveProjectId(id);
              setNewProjectName('');
              setAddProjectOpen(false);
            }}
          >
            Create
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
