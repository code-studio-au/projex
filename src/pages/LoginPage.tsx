import { useMemo, useState } from 'react';
import { Button, Card, Container, Group, Select, Stack, Text, Title } from '@mantine/core';
import { useRouter } from '@tanstack/react-router';

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
    <Container size="sm">
      <Card withBorder radius="lg" p="xl">
        <Stack gap="md">
          <Title order={3}>Login (local)</Title>
          <Text c="dimmed">Pick a seeded user. Later this becomes Better Auth.</Text>
          <Select
            label="User"
            placeholder={users.isLoading ? 'Loading...' : 'Select a user'}
            data={options}
            value={selected}
            onChange={(v) => setSelected(v ? asUserId(v) : null)}
            searchable
            nothingFoundMessage="No users"
          />

          <Group justify="space-between">
            <Button variant="light" onClick={() => router.navigate({ to: landingRoute.to })}>
              Back
            </Button>
            <Button onClick={handleLogin} disabled={!selected || login.isPending}>
              Login
            </Button>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}
