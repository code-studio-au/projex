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
import { forgotPasswordRoute, homeRoute } from '../router';
import { getPostLoginTarget } from '../routes/-postLogin';

export default function LoginPage() {
  return <ServerLoginPanel />;
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
