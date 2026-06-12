import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyExportJob, CompanyId, CompanyRole, UserId } from '../types';
import { asUserId } from '../types';

import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { getCompanyUsers } from '../store/access';
import { useUsersQuery } from '../queries/reference';
import {
  useCompanyMembershipsQuery,
  useDeleteCompanyMembershipMutation,
  useUpsertCompanyMembershipMutation,
} from '../queries/memberships';
import {
  useCreateUserInCompanyMutation,
  useSendCompanyUserInviteEmailMutation,
} from '../queries/admin';
import { useCompanyDefaultsQuery } from '../queries/taxonomy';
import {
  Route as companyLayoutRoute,
} from '../routes/_authed.c.$companyId';
import CompanyDefaultTaxonomyModal from './CompanyDefaultTaxonomyModal';
import CompanyDefaultMappingsModal from './CompanyDefaultMappingsModal';
import CompanyImportRulesModal from './CompanyImportRulesModal';
import classes from '../styles/ui.module.css';

const hydrateSubscription = () => () => {};
const getClientHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;
const EXPORT_JOB_POLL_INTERVAL_MS = 2000;

type ExportJobState = {
  job: CompanyExportJob | null;
  error: string | null;
  isStarting: boolean;
};

export default function CompanySettingsPanel(props: { companyId: CompanyId }) {
  const { companyId } = props;
  const loaderData = companyLayoutRoute.useLoaderData();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useSyncExternalStore(
    hydrateSubscription,
    getClientHydratedSnapshot,
    getServerHydratedSnapshot
  );

  const access = useCompanyAccess(companyId);
  const usersQ = useUsersQuery();
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);

  const createUser = useCreateUserInCompanyMutation(companyId);
  const sendInviteEmail = useSendCompanyUserInviteEmailMutation(companyId);
  const removeCompanyMember = useDeleteCompanyMembershipMutation(companyId);
  const upsertCompanyMembership = useUpsertCompanyMembershipMutation(companyId);
  // Permissions are evaluated via `access.can(...)` so that global superadmin
  // works across companies even without explicit membership.
  const currentCompanyRole =
    (isHydrated ? access.companyRole : undefined) ??
    loaderData?.companyRole ??
    'none';
  const effectiveIsSuperadmin =
    (isHydrated ? access.isSuperadmin : undefined) ??
    loaderData?.isGlobalSuperadmin ??
    false;
  const canAddCompanyUsers =
    (isHydrated ? access.can('company:manage_members') : undefined) ??
    loaderData?.canManageCompanyMembers ??
    false;
  const canEditCompanyDefaults =
    (isHydrated ? access.can('company:manage_defaults') : undefined) ??
    loaderData?.canManageCompanyDefaults ??
    false;
  const canExportCompany =
    (isHydrated ? access.can('company:export') : undefined) ??
    loaderData?.canExportCompany ??
    false;
  const companyDefaultsQ = useCompanyDefaultsQuery(companyId);
  const effectiveDefaults = isHydrated
    ? companyDefaultsQ.data
    : {
        categories: Array.from({
          length: loaderData?.companyDefaultsCategoryCount ?? 0,
        }),
        subCategories: Array.from({
          length: loaderData?.companyDefaultsSubCategoryCount ?? 0,
        }),
        mappingRules: Array.from({
          length: loaderData?.companyDefaultsMappingRuleCount ?? 0,
        }),
      };
  const companyDefaultsLoading = isHydrated
    ? companyDefaultsQ.isPending && !companyDefaultsQ.data
    : false;

  const companyUsers = useMemo(() => {
    return getCompanyUsers(
      companyId,
      usersQ.data ?? [],
      companyMembershipsQ.data ?? []
    );
  }, [companyId, usersQ.data, companyMembershipsQ.data]);

  const userOptions = useMemo(
    () =>
      companyUsers.map((u) => ({
        value: u.id,
        label: `${u.name} (${u.email})`,
      })),
    [companyUsers]
  );

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<CompanyRole | null>('member');
  const [sendOnboardingEmail, setSendOnboardingEmail] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [roleUserId, setRoleUserId] = useState<UserId | null>(null);
  const [defaultsModalOpen, setDefaultsModalOpen] = useState(false);
  const [mappingsModalOpen, setMappingsModalOpen] = useState(false);
  const [importRulesModalOpen, setImportRulesModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'all' | 'active'>('all');
  const [exportDetail, setExportDetail] = useState<'full' | 'summary'>('full');
  const [exportFromDate, setExportFromDate] = useState('');
  const [exportToDate, setExportToDate] = useState('');
  const [exportJobState, setExportJobState] = useState<ExportJobState>({
    job: null,
    error: null,
    isStarting: false,
  });
  const autoDownloadJobIdRef = useRef<string | null>(null);

  // Derive a sensible default selection without synchronously setting state in an effect.
  // This avoids cascading renders and keeps `react-hooks/set-state-in-effect` happy.
  const effectiveRoleUserId: UserId | null =
    roleUserId ??
    (isHydrated && userOptions[0]?.value ? asUserId(userOptions[0].value) : null);

  const [membershipCompanyRole, setMembershipCompanyRole] =
    useState<CompanyRole | null>('member');

  const currentExportOptions = useMemo(
    () => ({
      scope: exportScope,
      detail: exportDetail,
      from: exportFromDate || undefined,
      to: exportToDate || undefined,
    }),
    [exportDetail, exportFromDate, exportScope, exportToDate]
  );

  useEffect(() => {
    if (!isHydrated || !canExportCompany) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/companies/${encodeURIComponent(companyId)}/export-jobs`,
          {
            method: 'GET',
            headers: { accept: 'application/json' },
          }
        );
        const payload = (await response.json()) as CompanyExportJob | {
          message?: string;
        } | null;
        if (cancelled || !response.ok || !payload) return;
        autoDownloadJobIdRef.current = (payload as CompanyExportJob).id;
        setExportJobState((current) => ({
          ...current,
          job: payload as CompanyExportJob,
        }));
      } catch {
        if (cancelled) return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canExportCompany, companyId, isHydrated]);

  useEffect(() => {
    const job = exportJobState.job;
    if (!job) return;
    if (job.status !== 'queued' && job.status !== 'running') return;

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/export-jobs/${encodeURIComponent(job.id)}`,
          {
            method: 'GET',
            headers: { accept: 'application/json' },
          }
        );
        const payload = (await response.json()) as CompanyExportJob | {
          message?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setExportJobState((current) => ({
            ...current,
            error:
              typeof payload === 'object' && payload && 'message' in payload
                ? payload.message ?? 'Could not refresh export job status.'
                : 'Could not refresh export job status.',
          }));
          return;
        }
        setExportJobState((current) => ({
          ...current,
          job: payload as CompanyExportJob,
        }));
      } catch {
        if (cancelled) return;
        setExportJobState((current) => ({
          ...current,
          error: 'Could not refresh export job status.',
        }));
      }
    }, EXPORT_JOB_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [exportJobState.job]);

  useEffect(() => {
    const job = exportJobState.job;
    if (!job || job.status !== 'completed' || !job.downloadPath) return;
    if (autoDownloadJobIdRef.current === job.id) return;

    autoDownloadJobIdRef.current = job.id;
    window.location.assign(job.downloadPath);
  }, [exportJobState.job]);

  async function handleStartExport() {
    setExportJobState((current) => ({
      ...current,
      error: null,
      isStarting: true,
    }));

    try {
      const response = await fetch(
        `/api/companies/${encodeURIComponent(companyId)}/export-jobs`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(currentExportOptions),
        }
      );
      const payload = (await response.json()) as CompanyExportJob | {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          typeof payload === 'object' && payload && 'message' in payload
            ? payload.message ?? 'Could not start export.'
            : 'Could not start export.'
        );
      }
      autoDownloadJobIdRef.current = null;
      setExportJobState({
        job: payload as CompanyExportJob,
        error: null,
        isStarting: false,
      });
    } catch (error) {
      setExportJobState((current) => ({
        ...current,
        isStarting: false,
        error: error instanceof Error ? error.message : 'Could not start export.',
      }));
    }
  }

  const exportJob = exportJobState.job;
  const exportInFlight =
    exportJobState.isStarting ||
    exportJob?.status === 'queued' ||
    exportJob?.status === 'running';

  const toCompanyRole = (v: string | null): CompanyRole | null => {
    if (!v) return null;
    if (
      v === 'member' ||
      v === 'management' ||
      v === 'executive' ||
      v === 'admin'
    ) {
      return v;
    }
    return null;
  };

  const highestRoleBadge = (
    <Badge variant="light">
      Your company role: {currentCompanyRole}
      {effectiveIsSuperadmin ? ' (global superadmin)' : ''}
    </Badge>
  );

  const membershipRows = useMemo(() => {
    const adminCount = (companyMembershipsQ.data ?? []).filter(
      (m) => m.role === 'admin'
    ).length;
    return (companyMembershipsQ.data ?? []).map((m) => {
      const u = (usersQ.data ?? []).find((x) => x.id === m.userId);
      return {
        key: `${m.companyId}:${m.userId}`,
        userName: u?.name ?? String(m.userId),
        userEmail: u?.email ?? '',
        userId: m.userId,
        role: m.role,
        isSelf: m.userId === access.userId,
        isOnlyAdmin: m.role === 'admin' && adminCount <= 1,
      };
    });
  }, [access.userId, companyMembershipsQ.data, usersQ.data]);

  const selectedMembership = useMemo(
    () =>
      membershipRows.find((row) => row.userId === effectiveRoleUserId) ?? null,
    [effectiveRoleUserId, membershipRows]
  );
  const wouldDemoteLastAdmin =
    !!selectedMembership &&
    selectedMembership.role === 'admin' &&
    selectedMembership.isOnlyAdmin &&
    membershipCompanyRole !== 'admin';

  const membershipColumns = useMemo<
    MRT_ColumnDef<(typeof membershipRows)[number]>[]
  >(
    () => [
      {
        accessorKey: 'userName',
        header: 'User',
        Cell: ({ row }) => (
          <Stack gap={2}>
            <Text className="table-body-left-bold">{row.original.userName}</Text>
            {row.original.userEmail ? (
              <Text className="table-body-left" c="dimmed">
                {row.original.userEmail}
              </Text>
            ) : null}
          </Stack>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        Cell: ({ row }) => <Badge variant="light">{row.original.role}</Badge>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        size: 280,
        minSize: 280,
        Cell: ({ row }) => (
          <Group gap="xs" wrap="wrap" className="tableActionGroup">
            <Button
              size="xs"
              variant="light"
              className="tableActionButton"
              disabled={!canAddCompanyUsers || sendInviteEmail.isPending}
              onClick={async () => {
                setInviteError(null);
                setInviteStatus(null);
                try {
                  const result = await sendInviteEmail.mutateAsync(
                    row.original.userId
                  );
                  setInviteStatus(
                    result.onboardingDelivery === 'email'
                      ? `Password setup email sent to ${result.user.email}. Ask them to check spam or junk if it does not arrive soon, and to use the newest email if more than one was sent.`
                      : `Password setup email requested for ${result.user.email}. Email delivery is not configured, so the newest setup link was logged on the server instead.`
                  );
                } catch (err) {
                  setInviteError(
                    err instanceof Error
                      ? err.message
                      : 'Could not send password setup email.'
                  );
                }
              }}
            >
              Resend invite
            </Button>
            <Button
              size="xs"
              color="red"
              variant="light"
              className="tableActionButton"
              disabled={
                !canAddCompanyUsers ||
                row.original.isSelf ||
                row.original.isOnlyAdmin
              }
              onClick={async () => {
                setMembershipError(null);
                setMembershipStatus(null);
                try {
                  await removeCompanyMember.mutateAsync(row.original.userId);
                  setMembershipStatus(
                    `${row.original.userName} was removed from the company.`
                  );
                } catch (err) {
                  setMembershipError(
                    err instanceof Error
                      ? err.message
                      : 'Could not remove company member.'
                  );
                }
              }}
            >
              Remove
            </Button>
          </Group>
        ),
      },
    ],
    [canAddCompanyUsers, removeCompanyMember, sendInviteEmail]
  );

  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={4}>Company settings</Title>
        {highestRoleBadge}
      </Group>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Exports</Title>
          <Text size="sm" c="dimmed">
            Download a full-company Excel workbook for finance handoff,
            offline analysis, or executive reporting.
          </Text>
          <Select
            label="Project scope"
            data={[
              { value: 'all', label: 'All visible projects and programmes' },
              { value: 'active', label: 'Active projects and programmes only' },
            ]}
            value={exportScope}
            onChange={(value) =>
              setExportScope(value === 'active' ? 'active' : 'all')
            }
            disabled={!canExportCompany || exportInFlight}
          />
          <Select
            label="Workbook detail"
            data={[
              { value: 'full', label: 'Full detail workbook' },
              { value: 'summary', label: 'Summary and reporting only' },
            ]}
            value={exportDetail}
            onChange={(value) =>
              setExportDetail(value === 'summary' ? 'summary' : 'full')
            }
            disabled={!canExportCompany || exportInFlight}
          />
          <Group grow align="flex-end">
            <TextInput
              label="Transactions from"
              type="date"
              value={exportFromDate}
              onChange={(event) => setExportFromDate(event.currentTarget.value)}
              disabled={!canExportCompany || exportInFlight}
            />
            <TextInput
              label="Transactions to"
              type="date"
              value={exportToDate}
              onChange={(event) => setExportToDate(event.currentTarget.value)}
              disabled={!canExportCompany || exportInFlight}
            />
          </Group>
          {exportJobState.error ? (
            <Alert color="red">{exportJobState.error}</Alert>
          ) : null}
          {exportJob ? (
            <Alert color={exportJob.status === 'failed' ? 'red' : 'blue'}>
              {exportJob.status === 'queued'
                ? 'Export queued. We are preparing the workbook in the background.'
                : exportJob.status === 'running'
                  ? 'Export in progress. The workbook will download automatically when it is ready.'
                  : exportJob.status === 'completed'
                    ? `Workbook ready${exportJob.fileName ? `: ${exportJob.fileName}` : ''}.`
                    : exportJob.status === 'expired'
                      ? 'That prepared workbook expired. Start a fresh export to regenerate it.'
                      : exportJob.errorMessage ?? 'Export failed.'}
            </Alert>
          ) : null}
          <Group gap="sm" wrap="wrap">
            <Button
              variant="light"
              disabled={!canExportCompany || exportInFlight}
              loading={exportJobState.isStarting}
              onClick={() => {
                void handleStartExport();
              }}
            >
              {exportJob?.status === 'completed' || exportJob?.status === 'failed'
                ? 'Generate fresh export'
                : 'Prepare company export'}
            </Button>
            {exportJob?.status === 'completed' && exportJob.downloadPath ? (
              <Button
                component="a"
                href={exportJob.downloadPath}
                variant="default"
              >
                Download workbook
              </Button>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed">
            Current exports support active-only scope, transaction date ranges,
            full or summary workbooks, and detailed reporting tabs. Large
            workbooks now prepare in the background and download when ready.
          </Text>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Company default categories</Title>
          <Text size="sm" c="dimmed">
            Define company-wide default categories and subcategories that can be
            safely added into projects later.
          </Text>
          {companyDefaultsLoading ? (
            <Text size="sm" c="dimmed">
              Loading current company defaults…
            </Text>
          ) : (
            <Group gap="sm" wrap="wrap">
              <Badge variant="light">
                {effectiveDefaults?.categories.length ?? 0} categories
              </Badge>
              <Badge variant="light">
                {effectiveDefaults?.subCategories.length ?? 0} subcategories
              </Badge>
            </Group>
          )}
          <Button
            variant="light"
            disabled={!canEditCompanyDefaults}
            onClick={() => setDefaultsModalOpen(true)}
          >
            Manage company defaults
          </Button>
          <Text size="xs" c="dimmed">
            Applying company defaults to a project only adds missing categories
            and subcategories. Existing project taxonomy is left unchanged.
          </Text>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Import Rules</Title>
          <Text size="sm" c="dimmed">
            Decide which PowerBI rows import, which are excluded, and which are
            staged for project review before Auto-Categorise Rules run.
          </Text>
          <Button
            variant="light"
            disabled={!canEditCompanyDefaults}
            onClick={() => setImportRulesModalOpen(true)}
          >
            Manage Import Rules
          </Button>
          <Text size="xs" c="dimmed">
            Defaults are seeded for SAL, EXA, and suspected salary transfers,
            then can be adjusted for the company without code changes.
          </Text>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Auto-Categorise Rules</Title>
          <Text size="sm" c="dimmed">
            Match imported transaction text to company default taxonomy so
            uncoded imports can be auto-categorised in projects that already
            contain those defaults.
          </Text>
          {companyDefaultsLoading ? (
            <Text size="sm" c="dimmed">
              Loading Auto-Categorise Rules…
            </Text>
          ) : (
            <Group gap="sm" wrap="wrap">
              <Badge variant="light">
                {effectiveDefaults?.mappingRules.length ?? 0}{' '}
                Auto-Categorise Rules
              </Badge>
            </Group>
          )}
          <Button
            variant="light"
            disabled={!canEditCompanyDefaults}
            onClick={() => setMappingsModalOpen(true)}
          >
            Manage Auto-Categorise Rules
          </Button>
          <Text size="xs" c="dimmed">
            The first matching rule wins. Rules search transaction item and
            description text, support simple singular/plural matches, and mark
            auto-categorised rows for approval in the transaction list.
          </Text>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Add member</Title>
          {inviteError ? <Alert color="red">{inviteError}</Alert> : null}
          {inviteStatus ? <Alert color="green">{inviteStatus}</Alert> : null}
          <TextInput
            label="Name"
            value={newUserName}
            onChange={(e) => setNewUserName(e.currentTarget.value)}
          />
          <TextInput
            label="Email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.currentTarget.value)}
          />
          <Select
            label="Initial company role"
            data={[
              { value: 'member', label: 'member' },
              { value: 'management', label: 'management' },
              { value: 'executive', label: 'executive' },
              { value: 'admin', label: 'admin' },
            ]}
            value={newUserRole}
            onChange={(v) => setNewUserRole(toCompanyRole(v))}
          />
          <Checkbox
            label="Send password setup email now"
            description="Brand-new users will still receive their setup email automatically. Turn this on when you also want to send the newest setup email to an existing account."
            checked={sendOnboardingEmail}
            onChange={(e) => setSendOnboardingEmail(e.currentTarget.checked)}
          />
          <Button
            disabled={!canAddCompanyUsers || createUser.isPending}
            onClick={async () => {
              const name = newUserName.trim();
              const email = newUserEmail.trim();
              if (!name || !email) return;
              setInviteError(null);
              setInviteStatus(null);
              try {
                const result = await createUser.mutateAsync({
                  name,
                  email,
                  role: newUserRole ?? 'member',
                  sendOnboardingEmail,
                });
                setNewUserName('');
                setNewUserEmail('');
                setNewUserRole('member');
                setSendOnboardingEmail(false);
                if (result.onboardingEmailSent) {
                  setInviteStatus(
                    result.createdAuthUser
                      ? result.onboardingDelivery === 'email'
                        ? `${result.user.email} was added as a new company member and sent a password setup email. Ask them to check spam or junk if it does not arrive soon.`
                        : `${result.user.email} was added as a new company member. Email delivery is not configured, so the newest password setup link was logged on the server instead.`
                      : result.onboardingDelivery === 'email'
                        ? `${result.user.email} was added to the company and sent the newest password setup email. Ask them to check spam or junk if it does not arrive soon.`
                        : `${result.user.email} was added to the company. Email delivery is not configured, so the newest password setup link was logged on the server instead.`
                  );
                  return;
                }
                setInviteStatus(
                  result.membershipCreated
                    ? `${result.user.email} was added to the company. No email was sent. You can resend their password setup email later from the member list if they need it.`
                    : `${result.user.email} was already in the company. Their role was updated and no email was sent.`
                );
              } catch (err) {
                setInviteError(
                  err instanceof Error ? err.message : 'Could not invite user.'
                );
              }
            }}
          >
            Add member
          </Button>
          <Text size="xs" c="dimmed">
            Adding someone to the company and emailing them are now separate
            choices. New BetterAuth accounts still get their setup email
            automatically, while existing users can be added quietly and emailed
            later if needed.
          </Text>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Company roles</Title>
          {membershipError ? (
            <Alert color="red">{membershipError}</Alert>
          ) : null}
          {membershipStatus ? (
            <Alert color="green">{membershipStatus}</Alert>
          ) : null}
          {isHydrated ? (
            <Group align="flex-end" wrap="wrap">
              <Select
                label="User"
                data={userOptions}
                value={effectiveRoleUserId}
                onChange={(v) => setRoleUserId(v ? asUserId(v) : null)}
                searchable
                style={{ width: '100%', maxWidth: 420 }}
              />
              <Select
                label="Company role"
                data={[
                  { value: 'member', label: 'member' },
                  { value: 'management', label: 'management' },
                  { value: 'executive', label: 'executive' },
                  { value: 'admin', label: 'admin' },
                ]}
                value={membershipCompanyRole}
                onChange={(v) => setMembershipCompanyRole(toCompanyRole(v))}
                style={{ width: '100%', maxWidth: 220 }}
              />
              <Button
                size="sm"
                disabled={
                  !effectiveRoleUserId ||
                  !membershipCompanyRole ||
                  wouldDemoteLastAdmin
                }
                onClick={async () => {
                  if (!effectiveRoleUserId || !membershipCompanyRole) return;
                  setMembershipError(null);
                  setMembershipStatus(null);
                  try {
                    await upsertCompanyMembership.mutateAsync({
                      userId: effectiveRoleUserId,
                      role: membershipCompanyRole,
                    });
                    setMembershipStatus('Company role updated.');
                  } catch (err) {
                    setMembershipError(
                      err instanceof Error
                        ? err.message
                        : 'Could not update company role.'
                    );
                  }
                }}
              >
                Set
              </Button>
            </Group>
          ) : (
            <Paper className={classes.surfaceMuted} radius="xl" p="md">
              <Text size="sm" c="dimmed">
                Loading role controls...
              </Text>
            </Paper>
          )}
          {wouldDemoteLastAdmin ? (
            <Alert color="yellow">
              This company must retain at least one admin. Assign another admin
              before changing this role.
            </Alert>
          ) : null}
          <Divider />
          <Text size="sm" c="dimmed">
            Update a teammate’s company role or remove them from the company
            entirely.
          </Text>
          <div className={classes.tableWrap}>
            {isHydrated ? (
              <MantineReactTable
                columns={membershipColumns}
                data={membershipRows}
                getRowId={(row) => row.key}
                mantineTableContainerProps={{ className: 'financeTable' }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                }}
                mantineTableBodyCellProps={{
                  style: { verticalAlign: 'middle' },
                }}
                enableColumnActions={false}
                enableColumnFilters={false}
                enableSorting
                enableTopToolbar={false}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
                initialState={{
                  density: 'xs',
                  pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 8 },
                }}
              />
            ) : (
              <Paper className={classes.surfaceMuted} radius="xl" p="md">
                <Text size="sm" c="dimmed">
                  Loading company members...
                </Text>
              </Paper>
            )}
          </div>
        </Stack>
      </Paper>

      <CompanyDefaultTaxonomyModal
        opened={defaultsModalOpen}
        onClose={() => setDefaultsModalOpen(false)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
      <CompanyDefaultMappingsModal
        opened={mappingsModalOpen}
        onClose={() => setMappingsModalOpen(false)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
      <CompanyImportRulesModal
        opened={importRulesModalOpen}
        onClose={() => setImportRulesModalOpen(false)}
        companyId={companyId}
        readOnly={!canEditCompanyDefaults}
      />
    </Stack>
  );
}
