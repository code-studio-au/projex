import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';

import type { CompanyId, CompanyRole, ProjectId, ProjectRole, UserId } from '../types';
import { asProjectId, asUserId } from '../types';

import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { getCompanyUsers } from '../store/access';
import { useUsersQuery, useCompanyQuery, useProjectsQuery } from '../queries/reference';
import {
  useCompanyMembershipsQuery,
  useProjectMembershipsQuery,
  useUpsertCompanyMembershipMutation,
  useUpsertProjectMembershipMutation,
} from '../queries/memberships';
import {
  useCreateProjectMutation,
  useCreateUserInCompanyMutation,
} from '../queries/admin';

const companyRoleRank: Record<CompanyRole, number> = {
  superadmin: 5,
  admin: 4,
  executive: 3,
  management: 2,
  member: 1,
};

export default function CompanySettingsPanel(props: { companyId: CompanyId }) {
  const { companyId } = props;

  const access = useCompanyAccess(companyId);
  const company = useCompanyQuery(companyId);
  const usersQ = useUsersQuery();
  const projectsQ = useProjectsQuery(companyId);
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);

  const createProject = useCreateProjectMutation(companyId);
  const createUser = useCreateUserInCompanyMutation(companyId);
  const upsertCompanyMembership = useUpsertCompanyMembershipMutation(companyId);

  // Permissions requested:
  // - Execs can access company settings and add company users
  // - Execs + Managers can add projects
  const currentCompanyRole = access.companyRole;
  const canAddProjects =
    currentCompanyRole === 'superadmin' ||
    currentCompanyRole === 'admin' ||
    currentCompanyRole === 'executive' ||
    currentCompanyRole === 'management';

  const canAddCompanyUsers =
    currentCompanyRole === 'superadmin' ||
    currentCompanyRole === 'admin' ||
    currentCompanyRole === 'executive';

  const canAssignProjectRoles = canAddProjects;

  const companyUsers = useMemo(() => {
    return getCompanyUsers(
      companyId,
      usersQ.data ?? [],
      companyMembershipsQ.data ?? []
    );
  }, [companyId, usersQ.data, companyMembershipsQ.data]);

  const userOptions = useMemo(
    () =>
      companyUsers.map((u) => ({
        value: u.id,
        label: `${u.name} (${u.email})`,
      })),
    [companyUsers]
  );

  const projects = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);

  const [newProjectName, setNewProjectName] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<CompanyRole | null>('member');

  // Assign project role
  const [roleProjectId, setRoleProjectId] = useState<ProjectId | null>(
    (projects[0]?.id ?? null) as ProjectId | null
  );
  const [roleUserId, setRoleUserId] = useState<UserId | null>(
    (userOptions[0]?.value ?? null) as UserId | null
  );
  const [roleValue, setRoleValue] = useState<ProjectRole | null>('member');
  const [membershipCompanyRole, setMembershipCompanyRole] =
    useState<CompanyRole | null>('member');

  const upsertProjectMembership = useUpsertProjectMembershipMutation(
    (roleProjectId ?? projects[0]?.id ?? 'prj_unknown') as ProjectId
  );

  const roleRank = currentCompanyRole === 'none' ? 0 : companyRoleRank[currentCompanyRole];
  const highestRoleBadge = (
    <Badge variant="light">
      Your company role: {currentCompanyRole} (rank {roleRank ?? 0})
    </Badge>
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={4}>Company settings</Title>
          <Text size="sm" c="dimmed">
            {company.data?.name ?? companyId} • Manage projects, users, and project roles
          </Text>
        </Stack>
        {highestRoleBadge}
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>Create project</Title>
              <Badge variant="light" color={canAddProjects ? 'gray' : 'red'}>
                {canAddProjects ? 'Allowed' : 'Not allowed'}
              </Badge>
            </Group>
            <TextInput
              label="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.currentTarget.value)}
              placeholder="e.g. Website Refresh"
            />
            <Button
              disabled={!canAddProjects || createProject.isPending}
              onClick={async () => {
                const name = newProjectName.trim();
                if (!name) return;
                await createProject.mutateAsync({ name });
                setNewProjectName('');
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
              <Badge variant="light" color={canAddCompanyUsers ? 'gray' : 'red'}>
                {canAddCompanyUsers ? 'Allowed' : 'Not allowed'}
              </Badge>
            </Group>
            <TextInput
              label="Name"
              value={newUserName}
              onChange={(e) => setNewUserName(e.currentTarget.value)}
            />
            <TextInput
              label="Email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.currentTarget.value)}
            />
            <Select
              label="Initial company role"
              data={[
                { value: 'member', label: 'member' },
                { value: 'management', label: 'management' },
                { value: 'executive', label: 'executive' },
                { value: 'admin', label: 'admin' },
              ]}
              value={newUserRole}
              onChange={(v) => setNewUserRole((v as CompanyRole | null) ?? null)}
            />
            <Button
              disabled={!canAddCompanyUsers || createUser.isPending}
              onClick={async () => {
                const name = newUserName.trim();
                const email = newUserEmail.trim();
                if (!name || !email) return;
                await createUser.mutateAsync({ name, email, role: newUserRole ?? 'member' });
                setNewUserName('');
                setNewUserEmail('');
                setNewUserRole('member');
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
                { value: 'owner', label: 'owner' },
                { value: 'lead', label: 'lead' },
                { value: 'member', label: 'member' },
                { value: 'viewer', label: 'viewer' },
              ]}
              value={roleValue}
              onChange={(v) => setRoleValue((v as ProjectRole | null) ?? null)}
              style={{ minWidth: 200 }}
            />
            <Button
              disabled={!canAssignProjectRoles || !roleProjectId || !roleUserId || !roleValue}
              onClick={async () => {
                if (!roleProjectId || !roleUserId || !roleValue) return;
                // ensure mutation is bound to current project
                await upsertProjectMembership.mutateAsync({ userId: roleUserId, role: roleValue });
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
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(projectsQ.data ?? []).map((p) => (
                <ProjectMembershipRows key={p.id} companyId={companyId} projectId={p.id} />
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Title order={5}>Company roles</Title>
          <Group align="flex-end" wrap="wrap">
            <Select
              label="User"
              data={userOptions}
              value={roleUserId}
              onChange={(v) => setRoleUserId(v ? asUserId(v) : null)}
              searchable
              style={{ minWidth: 320 }}
            />
            <Select
              label="Company role"
              data={[
                { value: 'member', label: 'member' },
                { value: 'management', label: 'management' },
                { value: 'executive', label: 'executive' },
                { value: 'admin', label: 'admin' },
              ]}
              value={membershipCompanyRole}
              onChange={(v) => setMembershipCompanyRole((v as CompanyRole | null) ?? null)}
              style={{ minWidth: 200 }}
            />
            <Button
              disabled={!roleUserId || !membershipCompanyRole}
              onClick={async () => {
                if (!roleUserId || !membershipCompanyRole) return;
                await upsertCompanyMembership.mutateAsync({
                  userId: roleUserId,
                  role: membershipCompanyRole,
                });
              }}
            >
              Set
            </Button>
          </Group>

          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(companyMembershipsQ.data ?? []).map((m) => {
                const u = (usersQ.data ?? []).find((x) => x.id === m.userId);
                return (
                  <Table.Tr key={`${m.companyId}:${m.userId}`}>
                    <Table.Td>{u ? `${u.name} (${u.email})` : m.userId}</Table.Td>
                    <Table.Td>
                      <Badge variant="light">{m.role}</Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>
    </Stack>
  );
}

function ProjectMembershipRows(props: { companyId: CompanyId; projectId: ProjectId }) {
  const { projectId } = props;
  const usersQ = useUsersQuery();
  const membershipsQ = useProjectMembershipsQuery(projectId);

  const members = membershipsQ.data ?? [];

  return (
    <>
      {members.map((m) => {
        const u = (usersQ.data ?? []).find((x) => x.id === m.userId);
        return (
          <Table.Tr key={`${m.projectId}:${m.userId}`}>
            <Table.Td>{projectId}</Table.Td>
            <Table.Td>{u ? `${u.name} (${u.email})` : m.userId}</Table.Td>
            <Table.Td>
              <Badge variant="light">{m.role}</Badge>
            </Table.Td>
          </Table.Tr>
        );
      })}
    </>
  );
}
