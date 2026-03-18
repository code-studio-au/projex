import { useState } from 'react';
import {
  Alert,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useRouter } from '@tanstack/react-router';
import { useMediaQuery } from '@mantine/hooks';

import { loginRoute } from '../router';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim()) return;

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(body?.message ?? 'Could not request a password reset.');
        return;
      }
      setSuccess('If that email exists, a password reset link is on its way. Check spam or junk if it does not appear soon.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a password reset.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Container size="sm" px={isMobile ? 'xs' : 'md'}>
      <Paper withBorder radius="lg" p={isMobile ? 'md' : 'xl'}>
        <Stack gap="md">
          <Title order={3}>Forgot Password</Title>
          <Text c="dimmed">
            Enter your email and we&apos;ll send you a password reset link if the account exists.
          </Text>
          {error ? <Alert color="red">{error}</Alert> : null}
          {success ? <Alert color="green">{success}</Alert> : null}
          <TextInput
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            autoComplete="email"
            required
          />
          <Group justify="space-between" wrap="wrap">
            <Button variant="light" onClick={() => router.navigate({ to: loginRoute.to })}>
              Back to sign in
            </Button>
            <Button onClick={handleSubmit} loading={pending} disabled={!email.trim()}>
              Send reset link
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
