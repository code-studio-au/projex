import { useEffect, useMemo, useState } from 'react';
import { Alert, Anchor, Button, Paper, Stack, Text, Title } from '@mantine/core';

type ConfirmState =
  | { status: 'loading' }
  | { status: 'success'; email: string; previousEmail: string }
  | { status: 'error'; message: string };

export default function VerifyEmailChangePage() {
  const token = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
  }, []);
  const [state, setState] = useState<ConfirmState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setState({ status: 'error', message: 'This email change link is missing a token.' });
        return;
      }

      try {
        const res = await fetch('/api/me/email-change/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            body && typeof body === 'object' && 'message' in body
              ? String(body.message ?? 'Could not confirm your new email.')
              : 'Could not confirm your new email.';
          throw new Error(message);
        }
        if (!cancelled) {
          const payload =
            body && typeof body === 'object'
              ? (body as { email?: unknown; previousEmail?: unknown })
              : null;
          setState({
            status: 'success',
            email: String(payload?.email ?? ''),
            previousEmail: String(payload?.previousEmail ?? ''),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not confirm your new email.',
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Paper withBorder radius="lg" p="xl">
      <Stack gap="md">
        <Title order={2}>Confirm email change</Title>
        {state.status === 'loading' ? (
          <Text c="dimmed">
            Confirming your new email address. This can take a moment if the link was opened in a fresh browser session.
          </Text>
        ) : null}
        {state.status === 'success' ? (
          <>
            <Alert color="green">
              Your Projex login email has been changed from {state.previousEmail} to {state.email}.
            </Alert>
            <Text c="dimmed">
              Future sign-ins, password resets, and invite emails will use your new email address.
            </Text>
            <Text c="dimmed">
              If another user is currently signed in in this browser, sign out first and then sign back in with {state.email}.
            </Text>
            <Stack>
              <Button component="a" href="/account">
                Return to account
              </Button>
              <Button component="a" href="/login" variant="light">
                Go to sign in
              </Button>
            </Stack>
          </>
        ) : null}
        {state.status === 'error' ? (
          <>
            <Alert color="red">{state.message}</Alert>
            <Text c="dimmed">
              If the link expired, request a fresh email change from your account settings and use the newest verification email.
            </Text>
            <Stack gap="xs">
              <Anchor href="/account">Return to account</Anchor>
              <Anchor href="/login">Go to sign in</Anchor>
            </Stack>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}
