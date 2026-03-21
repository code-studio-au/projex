import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';

import { useSessionQuery } from '../queries/session';
import { useAllCompanyMembershipsQuery } from '../queries/memberships';
import { useCompaniesQuery, useUsersQuery } from '../queries/reference';
import {
  useCancelEmailChangeMutation,
  usePendingEmailChangeQuery,
  useRequestEmailChangeMutation,
  useResendEmailChangeMutation,
  useUpdateCurrentUserProfileMutation,
} from '../queries/account';
import { isServerAuthMode } from '../routes/-authMode';

type EmailActivity = {
  kind: 'requested' | 'resent' | 'cancelled';
  message: string;
  at: string;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default function AccountPage() {
  const session = useSessionQuery();
  const userId = session.data?.userId;
  const usersQ = useUsersQuery();
  const membershipsQ = useAllCompanyMembershipsQuery();
  const companiesQ = useCompaniesQuery(userId ?? undefined);
  const updateProfile = useUpdateCurrentUserProfileMutation();
  const pendingEmailChangeQ = usePendingEmailChangeQuery();
  const requestEmailChange = useRequestEmailChangeMutation();
  const resendEmailChange = useResendEmailChangeMutation();
  const cancelEmailChange = useCancelEmailChangeMutation();

  const currentUser = useMemo(
    () => (usersQ.data ?? []).find((user) => user.id === userId) ?? null,
    [userId, usersQ.data]
  );
  const myMemberships = useMemo(() => {
    const companyNameById = new Map((companiesQ.data ?? []).map((company) => [company.id, company.name]));
    return (membershipsQ.data ?? [])
      .filter((membership) => membership.userId === userId)
      .map((membership) => ({
        ...membership,
        companyName: companyNameById.get(membership.companyId) ?? membership.companyId,
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [companiesQ.data, membershipsQ.data, userId]);

  const [name, setName] = useState('');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [emailChangeMessage, setEmailChangeMessage] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [emailActivity, setEmailActivity] = useState<EmailActivity | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.name) setName((existing) => existing || currentUser.name);
  }, [currentUser?.name]);

  async function handleProfileSave() {
    if (!name.trim()) return;
    setProfileMessage(null);
    setProfileError(null);
    try {
      await updateProfile.mutateAsync({ name: name.trim() });
      setProfileMessage('Your display name was updated.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not update your display name.');
    }
  }

  async function handleEmailChangeRequest() {
    if (!newEmail.trim()) return;
    setEmailChangeMessage(null);
    setEmailChangeError(null);
    try {
      const result = await requestEmailChange.mutateAsync({ newEmail: newEmail.trim() });
      setEmailChangeMessage(
        result.delivery === 'log'
          ? `Email delivery is not configured, so the verification link for ${result.newEmail} was logged on the server.`
          : `We sent a verification email to ${result.newEmail}. Your current login email stays active until you confirm the new address.`
      );
      setEmailActivity({
        kind: 'requested',
        message: `Verification requested for ${result.newEmail}`,
        at: new Date().toISOString(),
      });
      setNewEmail('');
    } catch (err) {
      setEmailChangeError(err instanceof Error ? err.message : 'Could not start the email change flow.');
    }
  }

  async function handleResendEmailChange() {
    setEmailChangeMessage(null);
    setEmailChangeError(null);
    try {
      const result = await resendEmailChange.mutateAsync();
      setEmailChangeMessage(
        result.delivery === 'log'
          ? `Email delivery is not configured, so the verification link for ${result.newEmail} was logged on the server.`
          : `We sent a fresh verification email to ${result.newEmail}. The newest link is the one to use.`
      );
      setEmailActivity({
        kind: 'resent',
        message: `Verification re-sent to ${result.newEmail}`,
        at: new Date().toISOString(),
      });
    } catch (err) {
      setEmailChangeError(err instanceof Error ? err.message : 'Could not resend the verification email.');
    }
  }

  async function handleCancelEmailChange() {
    setEmailChangeMessage(null);
    setEmailChangeError(null);
    try {
      await cancelEmailChange.mutateAsync();
      setEmailChangeMessage('The pending email change was cancelled. Your login email will stay unchanged unless you start a new request.');
      setEmailActivity({
        kind: 'cancelled',
        message: 'Pending email change cancelled',
        at: new Date().toISOString(),
      });
    } catch (err) {
      setEmailChangeError(err instanceof Error ? err.message : 'Could not cancel the pending email change.');
    }
  }

  async function handlePasswordChange() {
    if (!currentPassword || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setPasswordPending(true);
    setPasswordMessage(null);
    setPasswordError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          body && typeof body === 'object' && 'message' in body
            ? String(body.message ?? 'Could not change password.')
            : 'Could not change password.';
        throw new Error(message);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Your password was updated.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setPasswordPending(false);
    }
  }

  return (
    <Stack gap="lg">
      <Paper withBorder radius="lg" p="lg">
        <Stack gap="xs">
          <Title order={2}>Account</Title>
          <Text c="dimmed">
            Manage your profile details and review the companies you can access.
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Title order={4}>Profile</Title>
          {profileMessage ? <Alert color="green">{profileMessage}</Alert> : null}
          {profileError ? <Alert color="red">{profileError}</Alert> : null}
          <TextInput
            label="Display name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              onClick={handleProfileSave}
              loading={updateProfile.isPending}
              disabled={!name.trim() || name.trim() === (currentUser?.name ?? '')}
            >
              Save profile
            </Button>
          </Group>
        </Stack>
      </Paper>


      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Title order={4}>Email</Title>
          <TextInput label="Current email" value={currentUser?.email ?? ''} readOnly disabled />
          {isServerAuthMode ? (
            <>
              {emailChangeMessage ? <Alert color="green">{emailChangeMessage}</Alert> : null}
              {emailChangeError ? <Alert color="red">{emailChangeError}</Alert> : null}
              {pendingEmailChangeQ.isLoading ? (
                <Text size="sm" c="dimmed">
                  Checking for a pending email change...
                </Text>
              ) : null}
              {pendingEmailChangeQ.data ? (
                <Alert color="blue">
                  <Stack gap="xs">
                    <Text fw={600}>Pending email change</Text>
                    <Text size="sm">
                      New email: {pendingEmailChangeQ.data.newEmail}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Requested: {formatDateTime(pendingEmailChangeQ.data.requestedAt)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Expires: {formatDateTime(pendingEmailChangeQ.data.expiresAt)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Check spam or junk if the email does not appear quickly. If you want to use a different email address, cancel this pending change first.
                    </Text>
                    <Group>
                      <Button
                        variant="light"
                        onClick={handleResendEmailChange}
                        loading={resendEmailChange.isPending}
                      >
                        Resend verification
                      </Button>
                      <Button
                        color="red"
                        variant="light"
                        onClick={handleCancelEmailChange}
                        loading={cancelEmailChange.isPending}
                      >
                        Cancel pending change
                      </Button>
                    </Group>
                  </Stack>
                </Alert>
              ) : null}
              {emailActivity ? (
                <Alert color="gray" variant="light">
                  <Stack gap={4}>
                    <Text fw={600}>Latest email change activity</Text>
                    <Text size="sm">{emailActivity.message}</Text>
                    <Text size="sm" c="dimmed">
                      {formatDateTime(emailActivity.at)}
                    </Text>
                  </Stack>
                </Alert>
              ) : null}
              <Text size="sm" c="dimmed">
                Your current login email remains active until you confirm the new address from your inbox.
              </Text>
              <TextInput
                label="New email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.currentTarget.value)}
                autoComplete="email"
                disabled={Boolean(pendingEmailChangeQ.data)}
              />
              <Group justify="flex-end">
                <Button
                  onClick={handleEmailChangeRequest}
                  loading={requestEmailChange.isPending}
                  disabled={!newEmail.trim() || Boolean(pendingEmailChangeQ.data)}
                >
                  Send verification email
                </Button>
              </Group>
            </>
          ) : (
            <Text c="dimmed">
              Verified email changes are only available in server-auth mode.
            </Text>
          )}
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Title order={4}>Password</Title>
          {isServerAuthMode ? (
            <>
              {passwordMessage ? <Alert color="green">{passwordMessage}</Alert> : null}
              {passwordError ? <Alert color="red">{passwordError}</Alert> : null}
              <PasswordInput
                label="Current password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.currentTarget.value)}
                autoComplete="current-password"
              />
              <PasswordInput
                label="New password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.currentTarget.value)}
                autoComplete="new-password"
              />
              <PasswordInput
                label="Confirm new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                autoComplete="new-password"
              />
              <Group justify="flex-end">
                <Button
                  onClick={handlePasswordChange}
                  loading={passwordPending}
                  disabled={!currentPassword || !newPassword || !confirmPassword}
                >
                  Change password
                </Button>
              </Group>
            </>
          ) : (
            <Text c="dimmed">
              Password changes are only available in server-auth mode. Local mode uses seeded identities.
            </Text>
          )}
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Title order={4}>Company access</Title>
          {myMemberships.length ? (
            myMemberships.map((membership) => (
              <Group key={`${membership.companyId}:${membership.role}`} justify="space-between" wrap="wrap">
                <Stack gap={0}>
                  <Text fw={600}>{membership.companyName}</Text>
                  <Text size="sm" c="dimmed">
                    {membership.companyId}
                  </Text>
                </Stack>
                <Badge variant="light">{membership.role}</Badge>
              </Group>
            ))
          ) : (
            <Text c="dimmed">No company memberships found for this account.</Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
