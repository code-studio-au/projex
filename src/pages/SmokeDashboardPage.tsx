import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Code,
  Divider,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconLoader2, IconPlayerPlay, IconX } from '@tabler/icons-react';

import { useAllCompanyMembershipsQuery } from '../queries/memberships';
import { useSessionQuery } from '../queries/session';
import type {
  SmokeSectionId,
  SmokeSectionResult,
  SmokeSectionStatus,
  SmokeStepResult,
  SmokeStepStatus,
  SmokeStepStreamEvent,
  SmokeStepTemplate,
} from '../types';
import { smokeSectionDefinitions } from '../types';

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

type SmokeSectionRunSummary = {
  status: Exclude<SmokeSectionStatus, 'idle' | 'running'>;
  finishedAt: string;
  durationMs: number;
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
  message?: string;
  active?: boolean;
};

const RUN_ALL_COOLDOWN_MS = 2000;
const RUN_ALL_RATE_LIMIT_RETRY_MS = 5000;
const RUN_ALL_RATE_LIMIT_SECTION_RETRIES = 1;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function isRateLimitMessage(value: string | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized.includes('429') || normalized.includes('too many requests') || normalized.includes('rate-limit');
}

function statusColor(status: SmokeSectionStatus) {
  if (status === 'passed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'skipped') return 'gray';
  if (status === 'running') return 'blue';
  return 'gray';
}

function FocusStripCard({ label, status, title, message, active = false }: FocusStripCardProps) {
  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      style={{
        opacity: active ? 1 : 0.85,
        transform: active ? 'scale(1)' : 'scale(0.98)',
        transition: 'transform 120ms ease, opacity 120ms ease',
      }}
    >
      <Stack gap={6}>
        <Group justify="space-between" align="flex-start">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {label}
          </Text>
          <Badge color={statusColor(status)} variant={active ? 'filled' : 'light'}>
            {status === 'idle' ? 'Queued' : status}
          </Badge>
        </Group>
        <Text fw={700} size={active ? 'md' : 'sm'}>
          {title}
        </Text>
        <Text size="sm" c="dimmed" lineClamp={3}>
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
    <Paper withBorder radius="md" p="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group align="flex-start" wrap="nowrap">
            <ThemeIcon radius="xl" size="md" color={statusColor(step.status)} variant="filled">
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
          <Code block style={{ whiteSpace: 'pre-wrap' }}>
            {step.error}
          </Code>
        ) : null}
      </Stack>
    </Paper>
  );
}

function createIdleSection(sectionId: SmokeSectionId): SmokeSectionView {
  const definition = smokeSectionDefinitions.find((section) => section.id === sectionId);
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

function applyStepUpdate(section: SmokeSectionView, stepResult: SmokeStepResult): SmokeSectionView {
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
  const session = useSessionQuery();
  const membershipsQ = useAllCompanyMembershipsQuery();

  const userId = session.data?.userId ?? null;
  const isSuperadmin = useMemo(
    () =>
      !!userId &&
      (membershipsQ.data ?? []).some(
        (membership) => membership.userId === userId && membership.role === 'superadmin'
      ),
    [membershipsQ.data, userId]
  );

  const [results, setResults] = useState<Partial<Record<SmokeSectionId, SmokeSectionResult>>>({});
  const [views, setViews] = useState<Partial<Record<SmokeSectionId, SmokeSectionView>>>({});
  const [history, setHistory] = useState<Partial<Record<SmokeSectionId, SmokeSectionRunSummary[]>>>({});
  const [runningSectionId, setRunningSectionId] = useState<SmokeSectionId | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [runAllStatus, setRunAllStatus] = useState<string | null>(null);
  const [runAllActive, setRunAllActive] = useState(false);
  const [runAllSectionIndex, setRunAllSectionIndex] = useState<number | null>(null);
  const sectionRefs = useRef<Partial<Record<SmokeSectionId, HTMLDivElement | null>>>({});

  function resetSectionState(sectionId: SmokeSectionId, options?: { keepHistory?: boolean }) {
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
    if (!options?.keepHistory) {
      setHistory((current) => {
        const next = { ...current };
        delete next[sectionId];
        return next;
      });
    }
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

  async function runSection(sectionId: SmokeSectionId): Promise<RunSectionOutcome> {
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
        body: JSON.stringify({ sectionId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          body && typeof body === 'object' && 'message' in body
            ? String(body.message ?? 'Smoke run failed.')
            : 'Smoke run failed.';
        throw new Error(message);
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
          const event = JSON.parse(trimmed) as SmokeStepStreamEvent;
          if (event.type === 'step') {
            setViews((current) => {
              const existing = current[sectionId] ?? createIdleSection(sectionId);
              return {
                ...current,
                [sectionId]: applyStepUpdate(existing, event.step),
              };
            });
            continue;
          }
          if (event.type === 'status') {
            setViews((current) => {
              const existing = current[sectionId] ?? createIdleSection(sectionId);
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
                smokeSectionDefinitions.find((section) => section.id === sectionId)?.label ?? sectionId;
              return `${sectionLabel}: ${event.message}`;
            });
            continue;
          }
          if (event.type === 'result') {
            sectionSucceeded = event.result.status !== 'failed';
            retryableRateLimit = event.result.steps.some(
              (step) => step.status === 'failed' && isRateLimitMessage(step.error)
            );
            resultMessage =
              event.result.steps.find((step) => step.status === 'failed')?.error ?? undefined;
            setResults((current) => ({
              ...current,
              [sectionId]: event.result,
            }));
            setHistory((current) => ({
              ...current,
              [sectionId]: [
                {
                  status: event.result.status,
                  finishedAt: event.result.finishedAt,
                  durationMs: event.result.durationMs,
                },
                ...(current[sectionId] ?? []),
              ].slice(0, 5),
            }));
            setViews((current) => {
              const existing = current[sectionId] ?? createIdleSection(sectionId);
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
                      : event.result.status === 'passed'
                        ? 'Completed successfully.'
                        : 'Skipped for this run.',
                  steps: existing.steps.map((step) => {
                    const completed = event.result.steps.find((item) => item.id === step.id);
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
      const message = error instanceof Error ? error.message : 'Could not run the smoke section.';
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
    setPageError(null);
    setRunAllActive(true);
    let failedSectionLabel: string | null = null;
    for (let index = 0; index < smokeSectionDefinitions.length; index += 1) {
      const section = smokeSectionDefinitions[index];
      setRunAllSectionIndex(index);
      let attempts = 0;

      while (attempts <= RUN_ALL_RATE_LIMIT_SECTION_RETRIES) {
        setRunAllStatus(`Running ${section.label}`);
        const outcome = await runSection(section.id);
        if (outcome.ok) {
          break;
        }

        if (outcome.retryableRateLimit && attempts < RUN_ALL_RATE_LIMIT_SECTION_RETRIES) {
          attempts += 1;
          await waitWithCountdown(RUN_ALL_RATE_LIMIT_RETRY_MS, (secondsRemaining) => {
            setRunAllStatus(`Rate limited on ${section.label}. Retrying in ${secondsRemaining}s.`);
          });
          resetSectionState(section.id, { keepHistory: true });
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
        setRunAllStatus(`Awaiting ${RUN_ALL_COOLDOWN_MS / 1000}s before ${nextSection.label}`);
        await new Promise((resolve) => setTimeout(resolve, RUN_ALL_COOLDOWN_MS));
      }
    }
    if (!failedSectionLabel) {
      setRunAllStatus('All sections completed.');
    }
    setRunAllActive(false);
  }

  function resetSection(sectionId: SmokeSectionId) {
    resetSectionState(sectionId);
  }

  const summary = useMemo(() => {
    const completedResults = Object.values(results).filter(Boolean) as SmokeSectionResult[];
    return {
      totalConfigured: smokeSectionDefinitions.length,
      totalCompleted: completedResults.length,
      passed: completedResults.filter((result) => result.status === 'passed').length,
      failed: completedResults.filter((result) => result.status === 'failed').length,
      skipped: completedResults.filter((result) => result.status === 'skipped').length,
      latestFinishedAt: completedResults
        .map((result) => result.finishedAt)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
    };
  }, [results]);

  const focusSections = useMemo(() => {
    if (runAllSectionIndex == null) return { previous: null, current: null, next: null };
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
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [runAllActive, runningSectionId]);

  if (!isSuperadmin) {
    return (
      <Stack gap="lg">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="xs">
            <Title order={2}>System Checks</Title>
            <Text c="dimmed">
              Run visual system checks from the app without SSHing into the server.
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
    <Stack gap="lg">
      <Paper withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <Stack gap="xs">
              <Title order={2}>System Checks</Title>
              <Text c="dimmed">
                Run each system-check section separately, inspect the exact steps that passed or
                failed, and keep the core server checks accessible from the app.
              </Text>
            </Stack>
            <Button
              leftSection={runningSectionId ? <IconLoader2 size={16} /> : <IconPlayerPlay size={16} />}
              onClick={runFullSmoke}
              disabled={!!runningSectionId}
            >
              Run all checks
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            The dashboard runs the same server checks we use operationally today. Sections that
            depend on optional values like invite or privacy creds will mark themselves as skipped
            when those values are not configured in `.env.smoke.local`.
          </Text>
          {runAllStatus ? (
            <Alert color="blue" variant="light">
              {runAllStatus}
            </Alert>
          ) : null}
        </Stack>
      </Paper>

      {runAllStatus && focusSections.current ? (
        <Paper
          withBorder
          radius="lg"
          p="lg"
          style={{
            position: 'sticky',
            top: 16,
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
                  status={results[focusSections.previous.id]?.status ?? views[focusSections.previous.id]?.status ?? 'idle'}
                  title={focusSections.previous.label}
                  message={views[focusSections.previous.id]?.statusMessage ?? focusSections.previous.description}
                />
              ) : (
                <FocusStripCard label="Previous" status="idle" title="No previous section" message="This is the first section." />
              )}
              <FocusStripCard
                label="Current"
                status={runningSectionId ? 'running' : results[focusSections.current.id]?.status ?? views[focusSections.current.id]?.status ?? 'idle'}
                title={focusSections.current.label}
                message={views[focusSections.current.id]?.statusMessage ?? focusSections.current.description}
                active
              />
              {focusSections.next ? (
                <FocusStripCard
                  label="Next"
                  status={results[focusSections.next.id]?.status ?? views[focusSections.next.id]?.status ?? 'idle'}
                  title={focusSections.next.label}
                  message={views[focusSections.next.id]?.statusMessage ?? focusSections.next.description}
                />
              ) : (
                <FocusStripCard label="Next" status="idle" title="No next section" message="This is the last configured section." />
              )}
            </SimpleGrid>
          </Stack>
        </Paper>
      ) : null}

      {pageError ? <Alert color="red">{pageError}</Alert> : null}

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Title order={4}>Summary</Title>
          <SimpleGrid cols={{ base: 2, md: 5 }} spacing="md">
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Completed
              </Text>
              <Text fw={800} size="xl">
                {summary.totalCompleted}/{summary.totalConfigured}
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Passed
              </Text>
              <Text fw={800} size="xl" c="green">
                {summary.passed}
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Failed
              </Text>
              <Text fw={800} size="xl" c="red">
                {summary.failed}
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Skipped
              </Text>
              <Text fw={800} size="xl" c="gray.7">
                {summary.skipped}
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Last completed
              </Text>
              <Text fw={700} size="sm">
                {summary.latestFinishedAt ? formatDateTime(summary.latestFinishedAt) : 'No runs yet'}
              </Text>
            </Paper>
          </SimpleGrid>
        </Stack>
      </Paper>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" verticalSpacing="lg">
        {smokeSectionDefinitions.map((section) => {
          const result = results[section.id];
          const view = views[section.id];
          const sectionHistory = history[section.id] ?? [];
          const isRunning = runningSectionId === section.id;
          const steps = view?.steps ?? [];
          const completedSteps = steps.filter(
            (step) => step.status === 'passed' || step.status === 'failed' || step.status === 'skipped'
          ).length;
          const totalSteps = steps.length;
          const progressValue = totalSteps ? Math.max(8, (completedSteps / totalSteps) * 100) : 0;

          return (
            <Paper
              key={section.id}
              withBorder
              radius="lg"
              p="lg"
              ref={(node) => {
                sectionRefs.current[section.id] = node;
              }}
            >
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Title order={4}>{section.label}</Title>
                      <Badge color={statusColor(isRunning ? 'running' : result?.status ?? 'idle')} variant="light">
                        {isRunning ? 'Running' : result ? result.status : 'Idle'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {section.description}
                    </Text>
                    {view?.statusMessage ? (
                      <Text size="sm" c={view.status === 'failed' ? 'red' : 'dimmed'}>
                        {view.statusMessage}
                      </Text>
                    ) : null}
                  </Stack>

                  <Group gap="xs">
                    <Button
                      size="sm"
                      variant={result || view ? 'light' : 'filled'}
                      leftSection={isRunning ? <IconLoader2 size={16} /> : <IconPlayerPlay size={16} />}
                      disabled={!!runningSectionId}
                      onClick={() => runSection(section.id)}
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

                {isRunning ? <Progress value={100} animated /> : steps.length ? <Progress value={progressValue} /> : null}

                {view ? (
                  <>
                    <Group gap="md">
                      {view.finishedAt ? (
                        <Text size="sm" c="dimmed">
                          Last run: {formatDateTime(view.finishedAt)}
                        </Text>
                      ) : null}
                      {typeof view.durationMs === 'number' ? (
                        <Text size="sm" c="dimmed">
                          Duration: {formatDuration(view.durationMs)}
                        </Text>
                      ) : null}
                    </Group>
                    {sectionHistory.length ? (
                      <>
                        <Divider />
                        <Stack gap={6}>
                          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                            Recent runs
                          </Text>
                          {sectionHistory.map((entry, index) => (
                            <Group key={`${section.id}-history-${index}`} justify="space-between" gap="sm">
                              <Badge variant="light" color={statusColor(entry.status)}>
                                {entry.status}
                              </Badge>
                              <Text size="xs" c="dimmed">
                                {formatDateTime(entry.finishedAt)}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {formatDuration(entry.durationMs)}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      </>
                    ) : null}
                    <Divider />
                    <Stack gap="sm">
                      {view.steps.map((step) => (
                        <SmokeStepRow key={`${section.id}-${step.id}`} step={step} />
                      ))}
                    </Stack>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
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
