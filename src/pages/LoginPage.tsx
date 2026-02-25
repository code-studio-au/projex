import { useMemo, useState } from 'react';
import { Badge, Button, Container, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useRouter } from '@tanstack/react-router';
import { useMediaQuery } from '@mantine/hooks';

import { useApi } from '../hooks/useApi';
import { useUsersQuery } from '../queries/reference';
import { useLoginMutation } from '../queries/session';
import type { UserId } from '../types';
import { asUserId } from '../types';
import { companyRoute, landingRoute } from '../router';

export default function LoginPage() {
  const api = useApi();
  const router = useRouter();
  const users = useUsersQuery();
  const login = useLoginMutation();
  const isMobile = useMediaQuery('(max-width: 48em)');

  const options = useMemo(
    () => (users.data ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.id})` })),
    [users.data]
  );

  const [selected, setSelected] = useState<UserId | null>(null);

  async function handleLogin() {
    if (!selected) return;
    await login.mutateAsync(selected);
    const defaultCompanyId = await api.getDefaultCompanyIdForUser(selected);
    if (defaultCompanyId) {
      router.navigate({
        to: companyRoute.to,
        params: { companyId: defaultCompanyId },
      });
    } else {
      router.navigate({ to: landingRoute.to });
    }
  }

  return (
    <Container size="sm" px={isMobile ? 'xs' : 'md'}>
      <Paper withBorder radius="lg" p={isMobile ? 'md' : 'xl'}>
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Title order={3}>Local Login</Title>
            <Badge variant="light">seeded users</Badge>
          </Group>
          <Text c="dimmed">Select a seeded user to enter the workspace.</Text>
          <Select
            label="User"
            placeholder={users.isLoading ? 'Loading...' : 'Select a user'}
            data={options}
            value={selected}
            onChange={(v) => setSelected(v ? asUserId(v) : null)}
            searchable
            nothingFoundMessage="No users"
          />

          <Group justify="space-between" wrap="wrap">
            <Button variant="light" onClick={() => router.navigate({ to: landingRoute.to })}>
              Back
            </Button>
            <Button onClick={handleLogin} disabled={!selected || login.isPending}>
              Continue
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
