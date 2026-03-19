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
import { useUpdateCurrentUserProfileMutation } from '../queries/account';
import { isServerAuthMode } from '../routes/-authMode';

export default function AccountPage() {
  const session = useSessionQuery();
  const userId = session.data?.userId;
  const usersQ = useUsersQuery();
  const membershipsQ = useAllCompanyMembershipsQuery();
  const companiesQ = useCompaniesQuery(userId ?? undefined);
  const updateProfile = useUpdateCurrentUserProfileMutation();

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
          <TextInput label="Email" value={currentUser?.email ?? ''} readOnly disabled />
          <Text size="sm" c="dimmed">
            Email changes should go through a verified flow, so we will add that separately.
          </Text>
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
