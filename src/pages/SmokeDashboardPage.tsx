import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Alert,
  Badge,
  Button,
  Code,
  Divider,
  Group,
  PasswordInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconLoader2,
  IconPlayerPlay,
  IconX,
} from '@tabler/icons-react';

import { apiErrorMessage } from '../api/errorResponses';
import { useCurrentUserQuery } from '../queries/account';
import { useSessionQuery } from '../queries/session';
import type {
  SmokeManualInputs,
  SmokeRunMode,
  SmokeSectionId,
  SmokeSectionResult,
  SmokeSectionStatus,
  SmokeStepResult,
  SmokeStepStatus,
  SmokeStepStreamEvent,
  SmokeStepTemplate,
} from '../types';
import { smokeSectionDefinitions } from '../types';
import { formatUtcDateTime } from '../utils/dateTime';
import { parseJsonWithSchema, readJsonResponseOrNull } from '../utils/json';
import { z } from 'zod';
import classes from '../styles/ui.module.css';

type SmokeStepView = SmokeStepTemplate & {
  status: SmokeStepStatus;
  durationMs: number;
  error?: string;
  detail?: string;
};

type SmokeSectionView = {
  sectionId: SmokeSectionId;
  status: SmokeSectionStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  statusMessage?: string;
  steps: SmokeStepView[];
};

type RunSectionOutcome = {
  ok: boolean;
  retryableRateLimit: boolean;
  message?: string;
};

type FocusStripCardProps = {
  label: string;
  status: SmokeSectionStatus;
  title: string;
  message?: React.ReactNode;
  active?: boolean;
};

const RUN_ALL_COOLDOWN_MS = 2000;
const RUN_ALL_RATE_LIMIT_RETRY_MS = 10000;
const RUN_ALL_RATE_LIMIT_SECTION_RETRIES = 2;
const APP_HEADER_OFFSET_PX = 70;
const RUN_ALL_FOCUS_OFFSET_PX = APP_HEADER_OFFSET_PX;
const SECTION_SCROLL_MARGIN_TOP_PX = 320;
const hydrateSubscription = () => () => {};
const getClientHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;
const smokeSectionIdValues = [
  'basics',
  'appPages',
  'emailChange',
  'temporaryData',
  'companyDefaults',
  'inviteFlow',
  'exportFlow',
  'privacyChecks',
] as const;
const manualInviteRoleOptions = [
  { value: 'member', label: 'Member' },
  { value: 'management', label: 'Management' },
  { value: 'executive', label: 'Executive' },
  { value: 'admin', label: 'Admin' },
] as const;

const smokeStepResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  durationMs: z.number(),
  error: z.string().optional(),
  detail: z.string().optional(),
});

const isoTimestampSchema = z.iso.datetime({ offset: true });

const smokeSectionResultSchema = z.object({
  sectionId: z.enum(smokeSectionIdValues),
  label: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  startedAt: isoTimestampSchema,
  finishedAt: isoTimestampSchema,
  durationMs: z.number(),
  steps: z.array(smokeStepResultSchema),
});

const smokeStepStreamEventSchema = z.union([
  z.object({
    type: z.literal('step'),
    sectionId: z.enum(smokeSectionIdValues),
    step: smokeStepResultSchema,
  }),
  z.object({
    type: z.literal('status'),
    sectionId: z.enum(smokeSectionIdValues),
    message: z.string(),
  }),
  z.object({
    type: z.literal('result'),
    result: smokeSectionResultSchema,
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
  }),
]);

type ManualFieldDef = {
  key: keyof SmokeManualInputs;
  label: string;
  placeholder?: string;
  description?: string;
  kind: 'text' | 'email' | 'password' | 'select';
  data?: Array<{ value: string; label: string }>;
};

const manualBaseFieldDefs: ManualFieldDef[] = [
  {
    key: 'email',
    label: 'Smoke email',
    placeholder: 'smoke-user@example.com',
    kind: 'email',
  },
  {
    key: 'password',
    label: 'Smoke password',
    placeholder: 'Required for manual auth-backed sections',
    kind: 'password',
  },
  {
    key: 'resetEmail',
    label: 'Reset email',
    placeholder: 'Defaults to the smoke email when left blank',
    kind: 'email',
  },
  {
    key: 'companyId',
    label: 'Preferred company id',
    placeholder: 'Optional. Defaults to the first visible company',
    kind: 'text',
  },
  {
    key: 'projectId',
    label: 'Preferred project id',
    placeholder: 'Optional. Defaults to the first active project',
    kind: 'text',
  },
];

const manualSectionFieldMap: Partial<Record<SmokeSectionId, ManualFieldDef[]>> =
  {
    emailChange: [
      {
        key: 'emailChangeTo',
        label: 'New email target',
        placeholder: 'new-email@example.com',
        kind: 'email',
      },
    ],
    inviteFlow: [
      {
        key: 'inviteEmail',
        label: 'Invite email',
        placeholder: 'invitee@example.com',
        kind: 'email',
      },
      {
        key: 'inviteName',
        label: 'Invite name',
        placeholder: 'Smoke Invite',
        kind: 'text',
      },
      {
        key: 'inviteRole',
        label: 'Invite role',
        kind: 'select',
        data: [...manualInviteRoleOptions],
      },
    ],
    privacyChecks: [
      {
        key: 'privacyAdminEmail',
        label: 'Admin email',
        placeholder: 'admin@example.com',
        kind: 'email',
      },
      {
        key: 'privacyAdminPassword',
        label: 'Admin password',
        placeholder: 'Password for the admin user',
        kind: 'password',
      },
      {
        key: 'privacySuperadminEmail',
        label: 'Superadmin email',
        placeholder: 'superadmin@example.com',
        kind: 'email',
      },
      {
        key: 'privacySuperadminPassword',
        label: 'Superadmin password',
        placeholder: 'Password for the superadmin user',
        kind: 'password',
      },
    ],
  };

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function humanizeSmokeStatusMessage(value: string) {
  const normalized = value.toLowerCase();
  if (
    normalized.includes('too many requests') ||
    normalized.includes('rate-limit') ||
    normalized.includes('429')
  ) {
    return 'This step hit a temporary rate limit. The raw provider response is shown below.';
  }
  if (
    normalized.includes('not authenticated') ||
    normalized.includes('unauthenticated')
  ) {
    return 'This step could not continue because the smoke session was no longer authenticated.';
  }
  if (normalized.includes('forbidden')) {
    return 'This step was blocked by a permission check.';
  }
  if (normalized.includes('did not return html')) {
    return 'This page check returned an unexpected response instead of HTML.';
  }
  if (normalized.includes('missing a valid token')) {
    return 'This step could not continue because the required token was missing or invalid.';
  }
  if (
    normalized.includes('projex_smoke_email') ||
    normalized.includes('projex_smoke_password')
  ) {
    return 'This smoke run is missing the base smoke credentials required for server-authenticated checks.';
  }
  return 'This step failed. The raw error details are shown below.';
}

function isRateLimitMessage(value: string | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.includes('429') ||
    normalized.includes('too many requests') ||
    normalized.includes('rate-limit')
  );
}

function statusColor(status: SmokeSectionStatus) {
  if (status === 'passed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'skipped') return 'gray';
  if (status === 'running') return 'blue';
  return 'gray';
}

function FocusStripCard({
  label,
  status,
  title,
  message,
  active = false,
}: FocusStripCardProps) {
  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      className={classes.surfaceCard}
      style={{
        transform: active ? 'scale(1)' : 'scale(0.985)',
        transition: 'transform 120ms ease',
      }}
    >
      <Stack gap={6}>
        <Group justify="space-between" align="flex-start">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {label}
          </Text>
          <Badge
            color={statusColor(status)}
            variant={active ? 'filled' : 'light'}
          >
            {status === 'idle' ? 'Queued' : status}
          </Badge>
        </Group>
        <Text fw={700} size={active ? 'md' : 'sm'}>
          {title}
        </Text>
        <Text size="sm" c="dimmed" className={classes.sectionCopy}>
          {message ?? 'Waiting to run.'}
        </Text>
      </Stack>
    </Paper>
  );
}

function stepViewIcon(step: SmokeStepView) {
  if (step.status === 'passed') return <IconCheck size={14} />;
  if (step.status === 'failed') return <IconX size={14} />;
  if (step.status === 'running') return <IconLoader2 size={14} />;
  return <IconAlertCircle size={14} />;
}

function SmokeStepRow({ step }: { step: SmokeStepView }) {
  return (
    <Paper withBorder radius="md" p="xs">
      <Stack gap={6}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group align="flex-start" wrap="nowrap">
            <ThemeIcon
              radius="xl"
              size="md"
              color={statusColor(step.status)}
              variant="filled"
            >
              {stepViewIcon(step)}
            </ThemeIcon>
            <Stack gap={2}>
              <Text fw={600} size="sm">
                {step.label}
              </Text>
              {step.detail ? (
                <Text size="xs" c="dimmed">
                  {step.detail}
                </Text>
              ) : null}
            </Stack>
          </Group>
          <Badge variant="light" color={statusColor(step.status)}>
            {step.status === 'idle'
              ? 'Pending'
              : step.status === 'running'
                ? 'Running'
                : step.status === 'skipped'
                  ? 'Skipped'
                  : formatDuration(step.durationMs)}
          </Badge>
        </Group>
        {step.error ? (
          <Stack gap={6}>
            <Text size="sm" c="red">
              {humanizeSmokeStatusMessage(step.error)}
            </Text>
            <Code block className={classes.commentBody}>
              {step.error}
            </Code>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}

function SmokeManualField(props: {
  field: ManualFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const { field, value, onChange } = props;

  if (field.kind === 'password') {
    return (
      <PasswordInput
        label={field.label}
        description={field.description}
        placeholder={field.placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }

  if (field.kind === 'select') {
    return (
      <Select
        label={field.label}
        description={field.description}
        placeholder={field.placeholder}
        data={field.data ?? []}
        value={value || null}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        clearable
      />
    );
  }

  return (
    <TextInput
      type={field.kind === 'email' ? 'email' : 'text'}
      label={field.label}
      description={field.description}
      placeholder={field.placeholder}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function createIdleSection(sectionId: SmokeSectionId): SmokeSectionView {
  const definition = smokeSectionDefinitions.find(
    (section) => section.id === sectionId
  );
  return {
    sectionId,
    status: 'idle',
    steps: (definition?.steps ?? []).map((step, index) => ({
      ...step,
      status: index === 0 ? 'running' : 'idle',
      durationMs: 0,
    })),
  };
}

function applyStepUpdate(
  section: SmokeSectionView,
  stepResult: SmokeStepResult
): SmokeSectionView {
  const steps = section.steps.map((step) =>
    step.id === stepResult.id
      ? {
          ...step,
          status: stepResult.status,
          durationMs: stepResult.durationMs,
          error: stepResult.error,
          detail: stepResult.detail,
        }
      : step
  );

  const nextIndex = steps.findIndex((step) => step.status === 'idle');
  if (stepResult.status !== 'failed' && nextIndex >= 0) {
    steps[nextIndex] = {
      ...steps[nextIndex],
      status: 'running',
    };
  }

  return {
    ...section,
    steps,
  };
}

export default function SmokeDashboardPage() {
  const isHydrated = useSyncExternalStore(
    hydrateSubscription,
    getClientHydratedSnapshot,
    getServerHydratedSnapshot
  );
  const session = useSessionQuery();
  const currentUserQ = useCurrentUserQuery();

  const userId = session.data?.userId ?? null;
  const isSuperadmin = useMemo(
    () => !!userId && currentUserQ.data?.isGlobalSuperadmin === true,
    [currentUserQ.data?.isGlobalSuperadmin, userId]
  );

  const [results, setResults] = useState<
    Partial<Record<SmokeSectionId, SmokeSectionResult>>
  >({});
  const [views, setViews] = useState<
    Partial<Record<SmokeSectionId, SmokeSectionView>>
  >({});
  const [runningSectionId, setRunningSectionId] =
    useState<SmokeSectionId | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<SmokeRunMode>('generated');
  const [manualInputs, setManualInputs] = useState<SmokeManualInputs>({
    inviteRole: 'member',
  });
  const [runAllStatus, setRunAllStatus] = useState<string | null>(null);
  const [runAllActive, setRunAllActive] = useState(false);
  const [runAllSectionIndex, setRunAllSectionIndex] = useState<number | null>(
    null
  );
  const sectionRefs = useRef<
    Partial<Record<SmokeSectionId, HTMLDivElement | null>>
  >({});

  function clearRunAllState() {
    setRunAllActive(false);
    setRunAllStatus(null);
    setRunAllSectionIndex(null);
  }

  function resetAllSectionState() {
    setResults({});
    setViews({});
    setPageError(null);
    clearRunAllState();
  }

  function setManualInputValue(
    key: keyof SmokeManualInputs,
    value: string | undefined
  ) {
    setManualInputs((current) => ({
      ...current,
      [key]: value && value.length > 0 ? value : undefined,
    }));
  }

  function sectionManualFieldDefs(sectionId: SmokeSectionId) {
    return manualSectionFieldMap[sectionId] ?? [];
  }

  function manualInputsForSection(
    sectionId: SmokeSectionId
  ): SmokeManualInputs | undefined {
    if (runMode !== 'manual') return undefined;

    const fieldKeys = new Set<keyof SmokeManualInputs>([
      ...manualBaseFieldDefs.map((field) => field.key),
      ...sectionManualFieldDefs(sectionId).map((field) => field.key),
    ]);

    const nextEntries = Array.from(fieldKeys).flatMap((key) => {
      const value = manualInputs[key];
      return typeof value === 'string' && value.length > 0
        ? ([[key, value]] as const)
        : [];
    });

    return nextEntries.length > 0
      ? (Object.fromEntries(nextEntries) as SmokeManualInputs)
      : undefined;
  }

  function resetSectionState(sectionId: SmokeSectionId) {
    setResults((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
    setViews((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
  }

  async function waitWithCountdown(
    durationMs: number,
    update: (secondsRemaining: number) => void
  ) {
    let remainingMs = durationMs;
    while (remainingMs > 0) {
      const secondsRemaining = Math.max(1, Math.ceil(remainingMs / 1000));
      update(secondsRemaining);
      const sleepMs = Math.min(1000, remainingMs);
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      remainingMs -= sleepMs;
    }
  }

  async function runSection(
    sectionId: SmokeSectionId,
    options?: { preserveRunAllContext?: boolean }
  ): Promise<RunSectionOutcome> {
    if (!options?.preserveRunAllContext) {
      clearRunAllState();
    }
    setPageError(null);
    setRunningSectionId(sectionId);
    let sectionSucceeded = true;
    let retryableRateLimit = false;
    let resultMessage: string | undefined;
    setViews((current) => ({
      ...current,
      [sectionId]: {
        ...createIdleSection(sectionId),
        status: 'running',
        startedAt: new Date().toISOString(),
        statusMessage: 'Starting checks...',
      },
    }));
    try {
      const res = await fetch('/api/admin/smoke', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sectionId,
          mode: runMode,
          manualInputs: manualInputsForSection(sectionId),
        }),
      });

      if (!res.ok) {
        const body = await readJsonResponseOrNull(res);
        throw new Error(apiErrorMessage(body, 'Smoke run failed.'));
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Smoke stream was unavailable.');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parsed = parseJsonWithSchema(
            trimmed,
            smokeStepStreamEventSchema
          );
          if (!parsed.success) continue;
          const event: SmokeStepStreamEvent = parsed.data;
          if (event.type === 'step') {
            setViews((current) => {
              const existing =
                current[sectionId] ?? createIdleSection(sectionId);
              return {
                ...current,
                [sectionId]: applyStepUpdate(existing, event.step),
              };
            });
            continue;
          }
          if (event.type === 'status') {
            setViews((current) => {
              const existing =
                current[sectionId] ?? createIdleSection(sectionId);
              return {
                ...current,
                [sectionId]: {
                  ...existing,
                  statusMessage: event.message,
                },
              };
            });
            setRunAllStatus((current) => {
              if (!current) return current;
              const sectionLabel =
                smokeSectionDefinitions.find(
                  (section) => section.id === sectionId
                )?.label ?? sectionId;
              return `${sectionLabel}: ${event.message}`;
            });
            continue;
          }
          if (event.type === 'result') {
            sectionSucceeded = event.result.status !== 'failed';
            retryableRateLimit = event.result.steps.some(
              (step) =>
                step.status === 'failed' && isRateLimitMessage(step.error)
            );
            resultMessage =
              event.result.steps.find((step) => step.status === 'failed')
                ?.error ?? undefined;
            setResults((current) => ({
              ...current,
              [sectionId]: event.result,
            }));
            setViews((current) => {
              const existing =
                current[sectionId] ?? createIdleSection(sectionId);
              return {
                ...current,
                [sectionId]: {
                  ...existing,
                  status: event.result.status,
                  startedAt: event.result.startedAt,
                  finishedAt: event.result.finishedAt,
                  durationMs: event.result.durationMs,
                  statusMessage:
                    event.result.status === 'failed'
                      ? existing.statusMessage
                      : undefined,
                  steps: existing.steps.map((step) => {
                    const completed = event.result.steps.find(
                      (item) => item.id === step.id
                    );
                    return completed
                      ? {
                          ...step,
                          status: completed.status,
                          durationMs: completed.durationMs,
                          error: completed.error,
                          detail: completed.detail,
                        }
                      : {
                          ...step,
                          status: 'skipped',
                          durationMs: 0,
                          detail: 'Not required for this run.',
                        };
                  }),
                },
              };
            });
            continue;
          }
          if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }
      return {
        ok: sectionSucceeded,
        retryableRateLimit,
        message: resultMessage,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not run the smoke section.';
      retryableRateLimit = isRateLimitMessage(message);
      setPageError(message);
      setViews((current) => ({
        ...current,
        [sectionId]: current[sectionId]
          ? {
              ...current[sectionId],
              status: 'failed',
              finishedAt: new Date().toISOString(),
              statusMessage: message,
            }
          : current[sectionId],
      }));
      return {
        ok: false,
        retryableRateLimit,
        message,
      };
    } finally {
      setRunningSectionId(null);
    }
  }

  async function runFullSmoke() {
    resetAllSectionState();
    setPageError(null);
    setRunAllActive(true);
    setRunAllStatus('Preparing full smoke run...');
    setRunAllSectionIndex(0);
    let failedSectionLabel: string | null = null;
    for (let index = 0; index < smokeSectionDefinitions.length; index += 1) {
      const section = smokeSectionDefinitions[index];
      setRunAllSectionIndex(index);
      let attempts = 0;

      while (attempts <= RUN_ALL_RATE_LIMIT_SECTION_RETRIES) {
        setRunAllStatus(`Running ${section.label}`);
        const outcome = await runSection(section.id, {
          preserveRunAllContext: true,
        });
        if (outcome.ok) {
          break;
        }

        if (
          outcome.retryableRateLimit &&
          attempts < RUN_ALL_RATE_LIMIT_SECTION_RETRIES
        ) {
          attempts += 1;
          await waitWithCountdown(
            RUN_ALL_RATE_LIMIT_RETRY_MS,
            (secondsRemaining) => {
              const message = `Rate limited on ${section.label}. Retrying in ${secondsRemaining}s.`;
              setRunAllStatus(message);
              setViews((current) => ({
                ...current,
                [section.id]: current[section.id]
                  ? {
                      ...current[section.id],
                      statusMessage: message,
                    }
                  : current[section.id],
              }));
            }
          );
          resetSectionState(section.id);
          continue;
        }

        failedSectionLabel = section.label;
        setRunAllStatus(
          `Stopped on ${section.label}. ${outcome.message ?? 'Fix the failure or rerun that section.'}`
        );
        break;
      }

      if (failedSectionLabel) {
        break;
      }

      const nextSection = smokeSectionDefinitions[index + 1];
      if (nextSection) {
        setRunAllStatus(
          `Awaiting ${RUN_ALL_COOLDOWN_MS / 1000}s before ${nextSection.label}`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, RUN_ALL_COOLDOWN_MS)
        );
      }
    }
    if (!failedSectionLabel) {
      setRunAllStatus('All sections completed.');
    }
    setRunAllActive(false);
  }

  function resetSection(sectionId: SmokeSectionId) {
    resetSectionState(sectionId);
    clearRunAllState();
  }

  function hasSmokeSectionResult(
    result: SmokeSectionResult | undefined
  ): result is SmokeSectionResult {
    return Boolean(result);
  }

  const summary = useMemo(() => {
    const completedResults = Object.values(results).filter(
      hasSmokeSectionResult
    );
    return {
      totalConfigured: smokeSectionDefinitions.length,
      totalCompleted: completedResults.length,
      passed: completedResults.filter((result) => result.status === 'passed')
        .length,
      failed: completedResults.filter((result) => result.status === 'failed')
        .length,
      skipped: completedResults.filter((result) => result.status === 'skipped')
        .length,
      latestFinishedAt: completedResults
        .map((result) => result.finishedAt)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
    };
  }, [results]);

  const hasRecordedRuns = useMemo(
    () => Object.keys(results).length > 0 || Object.keys(views).length > 0,
    [results, views]
  );

  const focusSections = useMemo(() => {
    if (runAllSectionIndex == null)
      return { previous: null, current: null, next: null };
    return {
      previous: smokeSectionDefinitions[runAllSectionIndex - 1] ?? null,
      current: smokeSectionDefinitions[runAllSectionIndex] ?? null,
      next: smokeSectionDefinitions[runAllSectionIndex + 1] ?? null,
    };
  }, [runAllSectionIndex]);

  useEffect(() => {
    if (!runAllActive || !runningSectionId) return;
    const target = sectionRefs.current[runningSectionId];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [runAllActive, runningSectionId]);

  if (!isHydrated) {
    return (
      <Stack gap="md">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="xs">
            <Title order={2}>System Checks</Title>
            <Text c="dimmed" className={classes.modalIntro}>
              Loading system checks...
            </Text>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  if (!isSuperadmin) {
    return (
      <Stack gap="lg">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="xs">
            <Title order={2}>System Checks</Title>
            <Text c="dimmed" className={classes.modalIntro}>
              Run visual system checks from the app without SSHing into the
              server.
            </Text>
          </Stack>
        </Paper>

        <Alert color="red" title="Restricted">
          This dashboard is only available to the global superadmin.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <Stack gap="xs">
              <Title order={2}>System Checks</Title>
              <Text c="dimmed" className={classes.modalIntro}>
                Run each system-check section separately, inspect the exact
                steps that passed or failed, and keep the core server checks
                accessible from the app.
              </Text>
            </Stack>
            <Group gap="xs">
              {hasRecordedRuns ? (
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={resetAllSectionState}
                  disabled={!!runningSectionId || runAllActive}
                >
                  Clear results
                </Button>
              ) : null}
              <Button
                leftSection={
                  runningSectionId ? (
                    <IconLoader2 size={16} />
                  ) : (
                    <IconPlayerPlay size={16} />
                  )
                }
                onClick={runFullSmoke}
                disabled={!!runningSectionId || runMode === 'manual'}
              >
                Run all checks
              </Button>
            </Group>
          </Group>
          <Select
            label="Run mode"
            value={runMode}
            onChange={(value) =>
              setRunMode(value === 'manual' ? 'manual' : 'generated')
            }
            data={[
              {
                value: 'generated',
                label: 'Generated fixtures (recommended)',
              },
              {
                value: 'manual',
                label: 'Manual advanced mode',
              },
            ]}
            disabled={!!runningSectionId || runAllActive}
          />
          <Text size="sm" c="dimmed" className={classes.sectionCopy}>
            {runMode === 'generated'
              ? 'The dashboard will create disposable smoke users, a temporary company, and a temporary project for each run, then clean them up automatically. This is the default path for fresh databases and repeatable regression checks.'
              : 'Manual mode is the advanced fallback when you want to target existing users or long-lived data. Enter only the values needed for the section you are about to run; nothing is persisted in the UI.'}
          </Text>
          <Alert color="blue" className={classes.notice}>
            {runMode === 'generated'
              ? 'Generated mode mirrors the disposable smoke CLI flow, but the dashboard always targets the current app origin so browser checks stay aligned with the page you are using.'
              : 'Manual mode is intended for one-off operator checks. The Run all action stays generated-only so each advanced section can use the right per-run inputs.'}
          </Alert>
          {runMode === 'manual' ? (
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Title order={5}>Manual Base Inputs</Title>
                <Text size="sm" c="dimmed" className={classes.sectionCopy}>
                  These values are reused by the auth-backed sections. Section-
                  specific advanced inputs appear inside the relevant cards
                  below.
                </Text>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  {manualBaseFieldDefs.map((field) => (
                    <SmokeManualField
                      key={field.key}
                      field={field}
                      value={manualInputs[field.key] ?? ''}
                      onChange={(value) =>
                        setManualInputValue(field.key, value)
                      }
                    />
                  ))}
                </SimpleGrid>
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </Paper>

      {runAllStatus && focusSections.current ? (
        <Paper
          withBorder
          radius="lg"
          p="lg"
          className={classes.surfaceCard}
          style={{
            position: 'sticky',
            top: RUN_ALL_FOCUS_OFFSET_PX,
            zIndex: 20,
          }}
        >
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Title order={4}>Run All Focus</Title>
                <Text size="sm" c="dimmed">
                  {runAllStatus}
                </Text>
              </Stack>
              <Badge variant="light" color="blue">
                {runAllSectionIndex != null
                  ? `${Math.min(runAllSectionIndex + 1, smokeSectionDefinitions.length)} of ${smokeSectionDefinitions.length}`
                  : `0 of ${smokeSectionDefinitions.length}`}
              </Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              {focusSections.previous ? (
                <FocusStripCard
                  label="Previous"
                  status={
                    results[focusSections.previous.id]?.status ??
                    views[focusSections.previous.id]?.status ??
                    'idle'
                  }
                  title={focusSections.previous.label}
                  message={
                    views[focusSections.previous.id]?.statusMessage ??
                    focusSections.previous.description
                  }
                />
              ) : (
                <FocusStripCard
                  label="Previous"
                  status="idle"
                  title="No previous section"
                  message="This is the first section."
                />
              )}
              <FocusStripCard
                label={runAllActive ? 'Current' : 'Previous'}
                status={
                  runningSectionId
                    ? 'running'
                    : (results[focusSections.current.id]?.status ??
                      views[focusSections.current.id]?.status ??
                      'idle')
                }
                title={focusSections.current.label}
                message={
                  views[focusSections.current.id]?.statusMessage ??
                  focusSections.current.description
                }
                active={runAllActive}
              />
              {focusSections.next ? (
                <FocusStripCard
                  label="Next"
                  status={
                    results[focusSections.next.id]?.status ??
                    views[focusSections.next.id]?.status ??
                    'idle'
                  }
                  title={focusSections.next.label}
                  message={
                    views[focusSections.next.id]?.statusMessage ??
                    focusSections.next.description
                  }
                />
              ) : (
                <FocusStripCard
                  label="Summary"
                  status={
                    summary.failed > 0
                      ? 'failed'
                      : summary.totalCompleted === summary.totalConfigured
                        ? 'passed'
                        : 'running'
                  }
                  title="Run summary"
                  message={`Completed ${summary.totalCompleted}/${summary.totalConfigured}. Passed ${summary.passed}, failed ${summary.failed}, skipped ${summary.skipped}.${summary.latestFinishedAt ? ` Last completed ${formatUtcDateTime(summary.latestFinishedAt)}.` : ''}`}
                  active={!runAllActive}
                />
              )}
            </SimpleGrid>
          </Stack>
        </Paper>
      ) : null}

      {pageError ? <Alert color="red">{pageError}</Alert> : null}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" verticalSpacing="md">
        {smokeSectionDefinitions.map((section) => {
          const result = results[section.id];
          const view = views[section.id];
          const isRunning = runningSectionId === section.id;

          return (
            <Paper
              key={section.id}
              withBorder
              radius="lg"
              p="lg"
              ref={(node) => {
                sectionRefs.current[section.id] = node;
              }}
              style={{ scrollMarginTop: SECTION_SCROLL_MARGIN_TOP_PX }}
            >
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Title order={4}>{section.label}</Title>
                      <Badge
                        color={statusColor(
                          isRunning ? 'running' : (result?.status ?? 'idle')
                        )}
                        variant="light"
                      >
                        {isRunning
                          ? 'Running'
                          : result
                            ? result.status
                            : 'Idle'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed" className={classes.sectionCopy}>
                      {section.description}
                    </Text>
                    {view?.statusMessage ? (
                      <Text
                        size="sm"
                        c={view.status === 'failed' ? 'red' : 'dimmed'}
                      >
                        {view.statusMessage}
                      </Text>
                    ) : null}
                    {runMode === 'manual' &&
                    sectionManualFieldDefs(section.id).length > 0 ? (
                      <Paper withBorder radius="md" p="sm">
                        <Stack gap="sm">
                          <Text size="sm" fw={600}>
                            Advanced inputs for {section.label}
                          </Text>
                          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                            {sectionManualFieldDefs(section.id).map((field) => (
                              <SmokeManualField
                                key={`${section.id}-${field.key}`}
                                field={field}
                                value={manualInputs[field.key] ?? ''}
                                onChange={(value) =>
                                  setManualInputValue(field.key, value)
                                }
                              />
                            ))}
                          </SimpleGrid>
                        </Stack>
                      </Paper>
                    ) : null}
                  </Stack>

                  <Group gap="xs">
                    <Button
                      size="sm"
                      variant={result || view ? 'light' : 'filled'}
                      leftSection={
                        isRunning ? (
                          <IconLoader2 size={16} />
                        ) : (
                          <IconPlayerPlay size={16} />
                        )
                      }
                      disabled={!!runningSectionId}
                      onClick={() => {
                        void runSection(section.id);
                      }}
                    >
                      {result || view ? 'Run again' : 'Run section'}
                    </Button>
                    {result || view ? (
                      <Button
                        size="sm"
                        variant="subtle"
                        color="gray"
                        disabled={isRunning}
                        onClick={() => resetSection(section.id)}
                      >
                        Reset
                      </Button>
                    ) : null}
                  </Group>
                </Group>

                {view ? (
                  <>
                    <Group gap="md">
                      {view.finishedAt ? (
                        <Text size="sm" c="dimmed">
                          Last run: {formatUtcDateTime(view.finishedAt)}
                        </Text>
                      ) : null}
                      {typeof view.durationMs === 'number' ? (
                        <Text size="sm" c="dimmed">
                          Duration: {formatDuration(view.durationMs)}
                        </Text>
                      ) : null}
                    </Group>
                    <Divider />
                    <Stack gap="xs">
                      {view.steps.map((step) => (
                        <SmokeStepRow
                          key={`${section.id}-${step.id}`}
                          step={step}
                        />
                      ))}
                    </Stack>
                  </>
                ) : (
                  <Text className={classes.emptyState}>
                    No run recorded yet.
                  </Text>
                )}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
