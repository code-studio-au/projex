import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useRouter } from '@tanstack/react-router';
import { useMediaQuery } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import { useUsersQuery } from '../queries/reference';
import { useLoginMutation } from '../queries/session';
import type { UserId } from '../types';
import { asUserId } from '../types';
import { companyRoute, homeRoute, landingRoute } from '../router';
import { authClient } from '../auth/client';
import { sessionQueryOptions } from '../queries/session';
import { getPostLoginTarget } from '../routes/-postLogin';

const env = (import.meta as unknown as { env?: Record<string, string> }).env;
const isServerMode = env?.VITE_API_MODE === 'server';

export default function LoginPage() {
  return isServerMode ? <ServerLoginPanel /> : <LocalLoginPanel />;
}

function LocalLoginPanel() {
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
    const memberships = await api.listAllCompanyMemberships();
    const isSuperadmin = memberships.some((m) => m.userId === selected && m.role === 'superadmin');
    if (isSuperadmin) {
      router.navigate({ to: landingRoute.to });
      return;
    }

    const companies = await api.listCompanies();
    if (companies.length > 1) {
      router.navigate({ to: landingRoute.to });
      return;
    }

    const defaultCompanyId = await api.getDefaultCompanyIdForUser(selected);
    if (defaultCompanyId) {
      router.navigate({
        to: companyRoute.to,
        params: { companyId: defaultCompanyId },
      });
      return;
    }

    router.navigate({ to: landingRoute.to });
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
            <Button variant="light" onClick={() => router.navigate({ to: homeRoute.to })}>
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

function ServerLoginPanel() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleServerLogin() {
    if (!email.trim() || !password) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (result.error) {
        setError(result.error.message ?? 'Sign in failed');
        return;
      }

      const session = await queryClient.fetchQuery(sessionQueryOptions(api));
      if (!session) {
        setError('Sign in succeeded but no session was returned.');
        return;
      }
      const target = await getPostLoginTarget(api, session.userId);
      router.navigate(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <Container size="sm" px={isMobile ? 'xs' : 'md'}>
      <Paper withBorder radius="lg" p={isMobile ? 'md' : 'xl'}>
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Title order={3}>Sign In</Title>
            <Badge variant="light">server auth</Badge>
          </Group>
          <Text c="dimmed">Sign in with your BetterAuth account.</Text>
          {error ? <Alert color="red">{error}</Alert> : null}
          <TextInput
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            autoComplete="email"
            required
          />
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="current-password"
            required
          />
          <Group justify="space-between" wrap="wrap">
            <Button variant="light" onClick={() => router.navigate({ to: homeRoute.to })}>
              Back
            </Button>
            <Button onClick={handleServerLogin} loading={pending} disabled={!email || !password}>
              Continue
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
