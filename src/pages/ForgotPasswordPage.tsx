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
import { apiMessageResponseSchema } from '../validation/responseSchemas';

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
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const parsed = apiMessageResponseSchema.safeParse(body);
        setError(
          parsed.success
            ? parsed.data.message ?? 'Could not request a password reset.'
            : 'Could not request a password reset.'
        );
        return;
      }
      setSuccess(
        'If that email exists, a password reset email is on its way. Check spam or junk if it does not appear soon, and use the newest email if you requested more than one.'
      );
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
            Enter your email and we&apos;ll send a password reset email if the account exists.
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
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
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
