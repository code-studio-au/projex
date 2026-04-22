import { useMemo, useState } from 'react';
import {
  Alert,
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

import { accountRoute, loginRoute } from '../router';
import { useSessionQuery } from '../queries/session';
import { apiMessageResponseSchema } from '../validation/responseSchemas';

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
  const sessionQ = useSessionQuery();
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
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const parsed = apiMessageResponseSchema.safeParse(body);
        setError(
          parsed.success
            ? parsed.data.message ?? 'Could not set your password.'
            : 'Could not set your password.'
        );
        return;
      }
      setSuccess(
        'Your password has been set. Return to sign in with your updated credentials.'
      );
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
          <Title order={3}>Set Password</Title>
          <Text c="dimmed">
            Finish your Projex invite by choosing a password for your BetterAuth account.
          </Text>
          {searchError ? (
            <Alert color="red">
              {searchError === 'INVALID_TOKEN'
                ? 'This password setup email is no longer valid. Request a fresh invite or password reset email and use the newest link.'
                : searchError}
            </Alert>
          ) : null}
          {error ? <Alert color="red">{error}</Alert> : null}
          {success ? (
            <>
              <Alert color="green">{success}</Alert>
              {sessionQ.data ? (
                <Alert color="yellow">
                  Another user is currently signed in in this browser. Sign out first, then return
                  to sign in with the account whose password you just updated.
                </Alert>
              ) : null}
              <Text c="dimmed">
                If you were testing with multiple accounts, use Return to sign in so you can start
                a fresh login with the updated password.
              </Text>
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <Button onClick={() => router.navigate({ to: loginRoute.to })}>
                  Return to sign in
                </Button>
                {sessionQ.data ? (
                  <Button variant="light" onClick={() => router.navigate({ to: accountRoute.to })}>
                    Stay with current session
                  </Button>
                ) : null}
              </Group>
            </>
          ) : (
            <>
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
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
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
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
