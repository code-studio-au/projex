import { useState } from 'react';
import {
  Alert,
  Button,
  Container,
  Divider,
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
import { useQueryClient } from '@tanstack/react-query';

import { forgotPasswordRoute, homeRoute } from '../router';
import {
  getPostLoginTargetServerFn,
  getSessionServerFn,
} from '../server/start/functions/auth';
import { refreshAfterAuthChange } from '../queries/session';
import classes from '../styles/ui.module.css';

export default function LoginPage() {
  return <ServerLoginPanel />;
}

function ServerLoginPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function waitForServerSession() {
    const attempts = 12;

    for (let i = 0; i < attempts; i += 1) {
      const session = await getSessionServerFn();
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
        setError(
          'Sign in succeeded but the browser session was not ready yet. Please try again.'
        );
        return;
      }

      const target = await getPostLoginTargetServerFn();
      await refreshAfterAuthChange(queryClient);
      await router.invalidate();
      await router.navigate(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <Container
      size="lg"
      px={isMobile ? 'xs' : 'md'}
      py={isMobile ? 'lg' : 'xl'}
    >
      <div className={classes.authShell}>
        <Paper className={classes.authPanel} radius="xl">
          <Stack gap="xl">
            <Stack gap="md">
              <div>
                <Title
                  order={1}
                  size={isMobile ? 'h2' : 'h1'}
                  className={classes.pageHeroTitle}
                >
                  ProjEx
                </Title>
                <Text className={classes.authLead} mt="xs">
                  Keep budgets, imports, and coding decisions in one operational
                  workspace built for project expense control.
                </Text>
              </div>
            </Stack>

            <div className={classes.infoList}>
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
            </div>
          </Stack>
        </Paper>

        <Paper className={classes.authPanel} radius="xl">
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
              <Button
                variant="subtle"
                px={0}
                onClick={() => router.navigate({ to: forgotPasswordRoute.to })}
              >
                Forgot password?
              </Button>
            </Group>
            <Divider />
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Button
                variant="light"
                onClick={() => router.navigate({ to: homeRoute.to })}
              >
                Back
              </Button>
              <Button
                onClick={handleServerLogin}
                loading={pending}
                disabled={!email || !password}
              >
                Continue
              </Button>
            </Group>
          </Stack>
        </Paper>
      </div>
    </Container>
  );
}

function InfoRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={classes.infoRow}>
      <span className={classes.infoBullet}>•</span>
      <div>
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="dimmed">
          {detail}
        </Text>
      </div>
    </div>
  );
}
