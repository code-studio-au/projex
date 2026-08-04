import { useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';

import { apiErrorMessage } from '../api/errorResponses';
import { loginRoute } from '../router';
import {
  refreshAfterAccountSwitch,
  sessionQueryOptions,
} from '../queries/session';
import { getPostLoginTargetServerFn } from '../server/start/functions/auth';
import { Route as resetPasswordRoute } from '../routes/reset-password';
import { readJsonResponseOrNull } from '../utils/json';
import classes from '../styles/ui.module.css';

export default function ResetPasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { token = '', error: searchError = '' } =
    resetPasswordRoute.useSearch();
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
      const body = await readJsonResponseOrNull(res);
      if (!res.ok) {
        setError(apiErrorMessage(body, 'Could not set your password.'));
        return;
      }
      setSuccess(
        'Your password has been set. Securely switching this browser to the updated account…'
      );
      setPassword('');
      setConfirmPassword('');

      try {
        await refreshAfterAccountSwitch(queryClient);
        const session = await queryClient.fetchQuery({
          ...sessionQueryOptions(),
          staleTime: 0,
        });
        if (!session?.userId) {
          throw new Error('The new session was not ready.');
        }
        const target = await getPostLoginTargetServerFn();
        await router.invalidate();
        await router.navigate(target);
      } catch {
        setSuccess(
          'Your password was updated, but automatic account switching could not be confirmed. Sign in once with your updated password.'
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not set your password.'
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Container size="sm" px={isMobile ? 'xs' : 'md'}>
      <Paper
        withBorder
        radius="lg"
        p={isMobile ? 'md' : 'xl'}
        className={classes.modalCard}
      >
        <Stack className={classes.modalStack}>
          <Title order={3}>Set Password</Title>
          <Text c="dimmed" className={classes.modalIntro}>
            Finish your Projex invite by choosing a password for your BetterAuth
            account.
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
              <Text c="dimmed" className={classes.modalIntro}>
                The reset link proves ownership of the updated account. Any
                other account previously active in this browser is replaced; its
                server-side sessions on other devices are not affected.
              </Text>
              <Group className={classes.footerRowBetween}>
                <Button onClick={() => router.navigate({ to: loginRoute.to })}>
                  Sign in manually
                </Button>
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
              <Group className={classes.footerRowBetween}>
                <Button
                  variant="light"
                  onClick={() => router.navigate({ to: loginRoute.to })}
                >
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
