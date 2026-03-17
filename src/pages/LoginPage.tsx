import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useRouter } from '@tanstack/react-router';
import { useMediaQuery } from '@mantine/hooks';

import { useApi } from '../hooks/useApi';
import { useUsersQuery } from '../queries/reference';
import { useLoginMutation } from '../queries/session';
import type { UserId } from '../types';
import { homeRoute } from '../router';
import { getPostLoginTarget } from '../routes/-postLogin';
import { isServerAuthMode } from '../routes/-authMode';
import { seedUsers } from '../seed/users';

export default function LoginPage() {
  return isServerAuthMode ? <ServerLoginPanel /> : <LocalLoginPanel />;
}

function LocalLoginPanel() {
  const api = useApi();
  const router = useRouter();
  const users = useUsersQuery();
  const login = useLoginMutation();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const availableUsers = users.data?.length ? users.data : seedUsers;
  const [selected, setSelected] = useState<UserId | null>(availableUsers[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(userId: UserId) {
    try {
      setError(null);
      setSelected(userId);
      await login.mutateAsync(userId);

      const target = await getPostLoginTarget(api, userId);
      await router.invalidate();
      await router.navigate(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Local login failed.');
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
          {error ? <Alert color="red">{error}</Alert> : null}
          {users.isError ? (
            <Alert color="yellow">
              Could not read local users from the current session state. Falling back to bundled seed users.
            </Alert>
          ) : null}
          {users.isLoading ? <Text size="sm" c="dimmed">Loading local users...</Text> : null}
          <Stack gap="xs">
            {availableUsers.map((user) => (
              <Group key={user.id} justify="space-between" wrap="wrap">
                <div>
                  <Text fw={600}>{user.name}</Text>
                  <Text size="sm" c="dimmed">
                    {user.email} · {user.id}
                  </Text>
                </div>
                <Button
                  onClick={() => handleLogin(user.id)}
                  loading={login.isPending && selected === user.id}
                  disabled={login.isPending}
                >
                  Continue as {user.name}
                </Button>
              </Group>
            ))}
          </Stack>

          <Group justify="space-between" wrap="wrap">
            <Button variant="light" onClick={() => router.navigate({ to: homeRoute.to })}>
              Back
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
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function waitForServerSession() {
    const attempts = 12;

    for (let i = 0; i < attempts; i += 1) {
      const session = await api.getSession();
      if (session?.userId) return session.userId;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }

    return null;
  }

  async function handleServerLogin() {
    if (!email.trim() || !password) return;
    setPending(true);
    setError(null);
    try {
      const { authClient } = await import('../auth/client');
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (result.error) {
        setError(result.error.message ?? 'Sign in failed');
        return;
      }
      const userId = await waitForServerSession();
      if (!userId) {
        setError('Sign in succeeded but the browser session was not ready yet. Please try again.');
        return;
      }

      const target = await getPostLoginTarget(api, userId);
      await router.invalidate();
      await router.navigate(target);
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
