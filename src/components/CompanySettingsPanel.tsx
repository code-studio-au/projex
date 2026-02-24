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

import type { CompanyId, CompanyRole, UserId } from '../types';
import { asUserId } from '../types';

import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { getCompanyUsers } from '../store/access';
import { useUsersQuery, useCompanyQuery } from '../queries/reference';
import {
  useCompanyMembershipsQuery,
  useUpsertCompanyMembershipMutation,
} from '../queries/memberships';
import {
  useCreateUserInCompanyMutation,
} from '../queries/admin';

export default function CompanySettingsPanel(props: { companyId: CompanyId }) {
  const { companyId } = props;

  const access = useCompanyAccess(companyId);
  const company = useCompanyQuery(companyId);
  const usersQ = useUsersQuery();
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);

  const createUser = useCreateUserInCompanyMutation(companyId);
  const upsertCompanyMembership = useUpsertCompanyMembershipMutation(companyId);

  // Permissions are evaluated via `access.can(...)` so that global superadmin
  // works across companies even without explicit membership.
  const currentCompanyRole = access.companyRole;
  const canAddCompanyUsers = access.can('company:manage_members');

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


  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<CompanyRole | null>('member');
  const [roleUserId, setRoleUserId] = useState<UserId | null>(null);

  // Derive a sensible default selection without synchronously setting state in an effect.
  // This avoids cascading renders and keeps `react-hooks/set-state-in-effect` happy.
  const effectiveRoleUserId: UserId | null =
    roleUserId ?? (userOptions[0]?.value ? asUserId(userOptions[0].value) : null);

  const [membershipCompanyRole, setMembershipCompanyRole] =
    useState<CompanyRole | null>('member');

  const companyRoleValues = ['member', 'management', 'executive', 'admin'] as const;
  const toCompanyRole = (v: string | null): CompanyRole | null => {
    if (!v) return null;
    return (companyRoleValues as readonly string[]).includes(v) ? (v as CompanyRole) : null;
  };

  const highestRoleBadge = (
    <Badge variant="light">
      Your company role: {currentCompanyRole}
      {access.isSuperadmin ? ' (global superadmin)' : ''}
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
          <Title order={5}>Company roles</Title>
          <Group align="flex-end" wrap="wrap">
            <Select
              label="User"
              data={userOptions}
              value={effectiveRoleUserId}
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
              onChange={(v) => setMembershipCompanyRole(toCompanyRole(v))}
              style={{ minWidth: 200 }}
            />
            <Button
              disabled={!effectiveRoleUserId || !membershipCompanyRole}
              onClick={async () => {
                if (!effectiveRoleUserId || !membershipCompanyRole) return;
                await upsertCompanyMembership.mutateAsync({
                  userId: effectiveRoleUserId,
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
