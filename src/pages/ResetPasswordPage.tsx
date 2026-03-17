import { useMemo, useState } from 'react';
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
  Title,
} from '@mantine/core';
import { useRouter } from '@tanstack/react-router';
import { useMediaQuery } from '@mantine/hooks';

import { loginRoute } from '../router';

function useResetSearch() {
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return { token: '', error: '' };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      token: params.get('token')?.trim() ?? '',
      error: params.get('error')?.trim() ?? '',
    };
  }, []);
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { token, error: searchError } = useResetSearch();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit() {
    if (!token) {
      setError('This password setup link is missing a valid token.');
      return;
    }
    if (!password || password !== confirmPassword) {
      setError('Passwords must match.');
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token,
          newPassword: password,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(body?.message ?? 'Could not set your password.');
        return;
      }
      setSuccess('Password set. You can sign in now.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set your password.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Container size="sm" px={isMobile ? 'xs' : 'md'}>
      <Paper withBorder radius="lg" p={isMobile ? 'md' : 'xl'}>
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Title order={3}>Set Password</Title>
            <Badge variant="light">server auth</Badge>
          </Group>
          <Text c="dimmed">
            Finish your Projex invite by choosing a password for your BetterAuth account.
          </Text>
          {searchError ? (
            <Alert color="red">
              {searchError === 'INVALID_TOKEN'
                ? 'This password setup link is invalid or has expired.'
                : searchError}
            </Alert>
          ) : null}
          {error ? <Alert color="red">{error}</Alert> : null}
          {success ? <Alert color="green">{success}</Alert> : null}
          <PasswordInput
            label="New password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="new-password"
            required
          />
          <PasswordInput
            label="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            autoComplete="new-password"
            required
          />
          <Group justify="space-between" wrap="wrap">
            <Button variant="light" onClick={() => router.navigate({ to: loginRoute.to })}>
              Back to sign in
            </Button>
            <Button
              onClick={handleSubmit}
              loading={pending}
              disabled={!token || !password || !confirmPassword}
            >
              Save password
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
