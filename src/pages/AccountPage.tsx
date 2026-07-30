import { useMemo, useState } from 'react';
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

import { useIsHydrated } from '../hooks/useIsHydrated';
import { apiErrorMessage } from '../api/errorResponses';
import { Route as accountRoute } from '../routes/_authed.account';
import { useSessionQuery } from '../queries/session';
import { useAllCompanyMembershipsQuery } from '../queries/memberships';
import { useCompaniesQuery } from '../queries/reference';
import {
  useCancelEmailChangeMutation,
  useCurrentUserQuery,
  usePendingEmailChangeQuery,
  useRequestEmailChangeMutation,
  useResendEmailChangeMutation,
  useUpdateCurrentUserProfileMutation,
} from '../queries/account';
import { formatUtcDateTime } from '../utils/dateTime';
import { readJsonResponseOrNull } from '../utils/json';
import classes from '../styles/ui.module.css';

type EmailActivity = {
  kind: 'requested' | 'resent' | 'cancelled';
  message: string;
  at: string;
};

function useAccountPageController() {
  const loaderData = accountRoute.useLoaderData();
  const isHydrated = useIsHydrated();
  const session = useSessionQuery();
  const userId = session.data?.userId;
  const currentUserQ = useCurrentUserQuery();
  const membershipsQ = useAllCompanyMembershipsQuery();
  const companiesQ = useCompaniesQuery(userId ?? undefined);
  const updateProfile = useUpdateCurrentUserProfileMutation();
  const pendingEmailChangeQ = usePendingEmailChangeQuery();
  const requestEmailChange = useRequestEmailChangeMutation();
  const resendEmailChange = useResendEmailChangeMutation();
  const cancelEmailChange = useCancelEmailChangeMutation();

  const currentUser = currentUserQ.data ?? loaderData?.currentUser ?? null;
  const pendingEmailChange =
    pendingEmailChangeQ.data ?? loaderData?.pendingEmailChange ?? null;
  const pendingEmailChangeReady =
    pendingEmailChangeQ.status !== 'pending' ||
    loaderData?.pendingEmailChange !== undefined;
  const myMemberships = useMemo(() => {
    const companyNameById = new Map(
      (companiesQ.data ?? []).map((company) => [company.id, company.name])
    );
    return (membershipsQ.data ?? [])
      .flatMap((membership) =>
        membership.userId === userId
          ? [
              {
                ...membership,
                companyName:
                  companyNameById.get(membership.companyId) ??
                  membership.companyId,
              },
            ]
          : []
      )
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [companiesQ.data, membershipsQ.data, userId]);

  const [name, setName] = useState('');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [emailChangeMessage, setEmailChangeMessage] = useState<string | null>(
    null
  );
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [emailActivity, setEmailActivity] = useState<EmailActivity | null>(
    null
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleProfileSave() {
    const trimmedName = (name || currentUser?.name || '').trim();
    if (!trimmedName) return;
    setProfileMessage(null);
    setProfileError(null);
    try {
      await updateProfile.mutateAsync({ name: trimmedName });
      setProfileMessage('Your display name was updated.');
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : 'Could not update your display name.'
      );
    }
  }

  async function handleEmailChangeRequest() {
    if (!newEmail.trim()) return;
    setEmailChangeMessage(null);
    setEmailChangeError(null);
    try {
      const result = await requestEmailChange.mutateAsync({
        newEmail: newEmail.trim(),
      });
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
      setEmailChangeError(
        err instanceof Error
          ? err.message
          : 'Could not start the email change flow.'
      );
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
      setEmailChangeError(
        err instanceof Error
          ? err.message
          : 'Could not resend the verification email.'
      );
    }
  }

  async function handleCancelEmailChange() {
    setEmailChangeMessage(null);
    setEmailChangeError(null);
    try {
      await cancelEmailChange.mutateAsync();
      setEmailChangeMessage(
        'The pending email change was cancelled. Your login email will stay unchanged unless you start a new request.'
      );
      setEmailActivity({
        kind: 'cancelled',
        message: 'Pending email change cancelled',
        at: new Date().toISOString(),
      });
    } catch (err) {
      setEmailChangeError(
        err instanceof Error
          ? err.message
          : 'Could not cancel the pending email change.'
      );
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

      const body = await readJsonResponseOrNull(res);
      if (!res.ok) {
        throw new Error(apiErrorMessage(body, 'Could not change password.'));
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Your password was updated.');
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : 'Could not change password.'
      );
    } finally {
      setPasswordPending(false);
    }
  }

  return {
    cancelEmailChange,
    confirmPassword,
    currentPassword,
    currentUser,
    emailActivity,
    emailChangeError,
    emailChangeMessage,
    handleCancelEmailChange,
    handleEmailChangeRequest,
    handlePasswordChange,
    handleProfileSave,
    handleResendEmailChange,
    isHydrated,
    myMemberships,
    name,
    newEmail,
    newPassword,
    passwordError,
    passwordMessage,
    passwordPending,
    pendingEmailChange,
    pendingEmailChangeReady,
    profileError,
    profileMessage,
    requestEmailChange,
    resendEmailChange,
    setConfirmPassword,
    setCurrentPassword,
    setName,
    setNewEmail,
    setNewPassword,
    updateProfile,
  };
}

type AccountPageController = ReturnType<typeof useAccountPageController>;

function AccountPageView({ model }: { model: AccountPageController }) {
  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.pageHero} radius="xl" p="lg">
        <Stack gap="xs">
          <Text className={classes.sectionEyebrow}>Account</Text>
          <Title order={2} className={classes.pageHeroTitle}>
            Account
          </Title>
          <Text className={classes.pageHeroCopy}>
            Manage your profile details and review the companies you can access.
          </Text>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="md">
          <Title order={4}>Profile</Title>
          {model.profileMessage ? (
            <Alert color="green">{model.profileMessage}</Alert>
          ) : null}
          {model.profileError ? (
            <Alert color="red">{model.profileError}</Alert>
          ) : null}
          <TextInput
            label="Display name"
            value={model.name || model.currentUser?.name || ''}
            onChange={(event) => model.setName(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              onClick={model.handleProfileSave}
              loading={model.updateProfile.isPending}
              disabled={
                !model.name.trim() ||
                model.name.trim() === (model.currentUser?.name ?? '')
              }
            >
              Save profile
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="md">
          <Title order={4}>Email</Title>
          <TextInput
            label="Current email"
            value={model.currentUser?.email ?? ''}
            readOnly
            disabled
          />
          {model.emailChangeMessage ? (
            <Alert color="green">{model.emailChangeMessage}</Alert>
          ) : null}
          {model.emailChangeError ? (
            <Alert color="red">{model.emailChangeError}</Alert>
          ) : null}
          {!model.pendingEmailChangeReady ? (
            <Text size="sm" c="dimmed">
              Checking for a pending email change...
            </Text>
          ) : null}
          {model.pendingEmailChange ? (
            <Alert color="blue">
              <Stack gap="xs">
                <Text fw={600}>Pending email change</Text>
                <Text size="sm">
                  New email: {model.pendingEmailChange.newEmail}
                </Text>
                <Text size="sm" c="dimmed">
                  Requested:{' '}
                  {formatUtcDateTime(model.pendingEmailChange.requestedAt)}
                </Text>
                <Text size="sm" c="dimmed">
                  Expires:{' '}
                  {formatUtcDateTime(model.pendingEmailChange.expiresAt)}
                </Text>
                <Text size="sm" c="dimmed">
                  Check spam or junk if the email does not appear quickly. If
                  you want to use a different email address, cancel this pending
                  change first.
                </Text>
                <Group gap="sm" align="center">
                  <Button
                    variant="light"
                    onClick={model.handleResendEmailChange}
                    loading={model.resendEmailChange.isPending}
                  >
                    Resend verification
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    onClick={model.handleCancelEmailChange}
                    loading={model.cancelEmailChange.isPending}
                  >
                    Cancel pending change
                  </Button>
                </Group>
              </Stack>
            </Alert>
          ) : null}
          {model.emailActivity ? (
            <Alert color="gray" variant="light">
              <Stack gap={4}>
                <Text fw={600}>Latest email change activity</Text>
                <Text size="sm">{model.emailActivity.message}</Text>
                <Text size="sm" c="dimmed">
                  {formatUtcDateTime(model.emailActivity.at)}
                </Text>
              </Stack>
            </Alert>
          ) : null}
          <Text size="sm" c="dimmed">
            Your current login email remains active until you confirm the new
            address from your inbox.
          </Text>
          {model.isHydrated ? (
            <>
              <TextInput
                label="New email"
                value={model.newEmail}
                onChange={(event) =>
                  model.setNewEmail(event.currentTarget.value)
                }
                autoComplete="email"
                disabled={Boolean(model.pendingEmailChange)}
              />
              <Group justify="flex-end" gap="sm">
                <Button
                  onClick={model.handleEmailChangeRequest}
                  loading={model.requestEmailChange.isPending}
                  disabled={
                    !model.newEmail.trim() || Boolean(model.pendingEmailChange)
                  }
                >
                  Send verification email
                </Button>
              </Group>
            </>
          ) : (
            <Paper className={classes.surfaceMuted} radius="xl" p="md">
              <Text size="sm" c="dimmed">
                Loading email change controls...
              </Text>
            </Paper>
          )}
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="md">
          <Title order={4}>Password</Title>
          {model.passwordMessage ? (
            <Alert color="green">{model.passwordMessage}</Alert>
          ) : null}
          {model.passwordError ? (
            <Alert color="red">{model.passwordError}</Alert>
          ) : null}
          <PasswordInput
            label="Current password"
            value={model.currentPassword}
            onChange={(event) =>
              model.setCurrentPassword(event.currentTarget.value)
            }
            autoComplete="current-password"
          />
          <PasswordInput
            label="New password"
            value={model.newPassword}
            onChange={(event) =>
              model.setNewPassword(event.currentTarget.value)
            }
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirm new password"
            value={model.confirmPassword}
            onChange={(event) =>
              model.setConfirmPassword(event.currentTarget.value)
            }
            autoComplete="new-password"
          />
          <Group justify="flex-end" gap="sm">
            <Button
              onClick={model.handlePasswordChange}
              loading={model.passwordPending}
              disabled={
                !model.currentPassword ||
                !model.newPassword ||
                !model.confirmPassword
              }
            >
              Change password
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="md">
          <Title order={4}>Company access</Title>
          {model.myMemberships.length ? (
            model.myMemberships.map((membership) => (
              <Group
                key={`${membership.companyId}:${membership.role}`}
                justify="space-between"
                wrap="wrap"
              >
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
            <Text c="dimmed">
              No company memberships found for this account.
            </Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

export default function AccountPage() {
  const model = useAccountPageController();
  return <AccountPageView model={model} />;
}
