import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useRouter } from '@tanstack/react-router';
import { useMediaQuery } from '@mantine/hooks';

import { useApi } from '../hooks/useApi';
import { useUsersQuery } from '../queries/reference';
import { useLoginMutation } from '../queries/session';
import type { UserId } from '../types';
import { forgotPasswordRoute, homeRoute } from '../router';
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
    <Container size="lg" px={isMobile ? 'xs' : 'md'} py={isMobile ? 'lg' : 'xl'}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={isMobile ? 'md' : 'xl'}>
        <Paper
          radius="xl"
          p={isMobile ? 'lg' : 'xl'}
          style={{
            background:
              'linear-gradient(145deg, rgba(239,246,255,0.96), rgba(248,250,252,0.98))',
            border: '1px solid rgba(148,163,184,0.22)',
          }}
        >
          <Stack gap="lg" h="100%" justify="space-between">
            <Stack gap="md">
              <Badge variant="light" color="blue" radius="xl" w="fit-content">
                Local workspace
              </Badge>
              <div>
                <Title order={1} size={isMobile ? 'h2' : 'h1'}>
                  ProjEx
                </Title>
                <Text c="dimmed" mt="xs" maw={440}>
                  Use a seeded workspace account to move through budgets, imports, coding, and
                  company reporting while working locally.
                </Text>
              </div>
            </Stack>

            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <InfoTile title="Local mode" detail="Seeded users and test data ready to use" />
              <InfoTile title="Fast switching" detail="Jump into different company roles quickly" />
            </SimpleGrid>
          </Stack>
        </Paper>

        <Paper withBorder radius="xl" p={isMobile ? 'lg' : 'xl'}>
          <Stack gap="md">
            <div>
              <Title order={3}>Local Login</Title>
              <Text size="sm" c="dimmed" mt={4}>
                Select a seeded user to enter the workspace.
              </Text>
            </div>
            {error ? <Alert color="red">{error}</Alert> : null}
            {users.isError ? (
              <Alert color="yellow">
                Could not read local users from the current session state. Falling back to bundled
                seed users.
              </Alert>
            ) : null}
            {users.isLoading ? (
              <Text size="sm" c="dimmed">
                Loading local users...
              </Text>
            ) : null}
            <Stack gap="sm">
              {availableUsers.map((user) => (
                <Paper key={user.id} withBorder radius="lg" p="md">
                  <Group justify="space-between" wrap="wrap" align="center" gap="sm">
                    <div>
                      <Text fw={700}>{user.name}</Text>
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
                </Paper>
              ))}
            </Stack>

            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Button variant="light" onClick={() => router.navigate({ to: homeRoute.to })}>
                Back
              </Button>
            </Group>
          </Stack>
        </Paper>
      </SimpleGrid>
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
    <Container size="lg" px={isMobile ? 'xs' : 'md'} py={isMobile ? 'lg' : 'xl'}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={isMobile ? 'md' : 'xl'}>
        <Paper
          radius="xl"
          p={isMobile ? 'lg' : 'xl'}
          style={{
            background:
              'linear-gradient(160deg, rgba(239,246,255,0.96), rgba(255,255,255,0.98))',
            border: '1px solid rgba(148,163,184,0.22)',
          }}
        >
          <Stack gap="lg" h="100%" justify="space-between">
            <Stack gap="md">
              <Badge variant="light" color="blue" radius="xl" w="fit-content">
                Secure sign in
              </Badge>
              <div>
                <Title order={1} size={isMobile ? 'h2' : 'h1'}>
                  ProjEx
                </Title>
                <Text c="dimmed" mt="xs" maw={460}>
                  Keep budgets, imports, and coding decisions in one operational workspace built
                  for project expense control.
                </Text>
              </div>
            </Stack>

            <Stack gap="sm">
              <InfoRow
                title="Clear project visibility"
                detail="Move from company summary into the exact budget or transaction view you need."
              />
              <InfoRow
                title="Safer review workflows"
                detail="Track uncoded spend, approve auto-mapped rows, and keep category work consistent."
              />
              <InfoRow
                title="Built for operational teams"
                detail="Use one workspace for imports, budgeting, approvals, and company oversight."
              />
            </Stack>
          </Stack>
        </Paper>

        <Paper withBorder radius="xl" p={isMobile ? 'lg' : 'xl'}>
          <Stack gap="md">
            <div>
              <Title order={3}>Sign In</Title>
              <Text size="sm" c="dimmed" mt={4}>
                Use your work email and password to continue.
              </Text>
            </div>
            {error ? <Alert color="red">{error}</Alert> : null}
            <TextInput
              label="Email"
              placeholder="you@company.com"
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
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Button variant="subtle" px={0} onClick={() => router.navigate({ to: forgotPasswordRoute.to })}>
                Forgot password?
              </Button>
              <Badge variant="dot" color="blue" radius="xl">
                Encrypted session
              </Badge>
            </Group>
            <Divider />
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Button variant="light" onClick={() => router.navigate({ to: homeRoute.to })}>
                Back
              </Button>
              <Button onClick={handleServerLogin} loading={pending} disabled={!email || !password}>
                Continue
              </Button>
            </Group>
          </Stack>
        </Paper>
      </SimpleGrid>
    </Container>
  );
}

function InfoRow({ title, detail }: { title: string; detail: string }) {
  return (
    <Group align="flex-start" gap="sm" wrap="nowrap">
      <ThemeIcon variant="light" color="blue" radius="xl" size={30}>
        <Text fw={700} size="sm">
          •
        </Text>
      </ThemeIcon>
      <div>
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="dimmed">
          {detail}
        </Text>
      </div>
    </Group>
  );
}

function InfoTile({ title, detail }: { title: string; detail: string }) {
  return (
    <Paper
      radius="lg"
      p="md"
      style={{
        background: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(148,163,184,0.2)',
      }}
    >
      <Stack gap={4}>
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="dimmed">
          {detail}
        </Text>
      </Stack>
    </Paper>
  );
}
