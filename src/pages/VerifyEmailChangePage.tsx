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
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            body && typeof body === 'object' && 'message' in body
              ? String(body.message ?? 'Could not confirm your new email.')
              : 'Could not confirm your new email.';
          throw new Error(message);
        }
        if (!cancelled) {
          setState({
            status: 'success',
            email: String(body?.email ?? ''),
            previousEmail: String(body?.previousEmail ?? ''),
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
          <Text c="dimmed">Confirming your new email address...</Text>
        ) : null}
        {state.status === 'success' ? (
          <>
            <Alert color="green">
              Your Projex email has been updated to {state.email}.
            </Alert>
            <Text c="dimmed">
              Future sign-ins and password resets will use your new email address.
            </Text>
            <Text c="dimmed">Previous email: {state.previousEmail}</Text>
            <Button component="a" href="/account">
              Return to account
            </Button>
          </>
        ) : null}
        {state.status === 'error' ? (
          <>
            <Alert color="red">{state.message}</Alert>
            <Text c="dimmed">Start the email change again from your account settings.</Text>
            <Anchor href="/account">Return to account</Anchor>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}
