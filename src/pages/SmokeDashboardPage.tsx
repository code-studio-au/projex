import { useMemo, useState } from 'react';
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
import type { SmokeSectionId, SmokeSectionResult, SmokeSectionStatus, SmokeStepResult } from '../types';
import { smokeSectionDefinitions } from '../types';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function statusColor(status: SmokeSectionStatus) {
  if (status === 'passed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'skipped') return 'gray';
  if (status === 'running') return 'blue';
  return 'gray';
}

function stepIcon(step: SmokeStepResult) {
  if (step.status === 'passed') return <IconCheck size={14} />;
  if (step.status === 'failed') return <IconX size={14} />;
  return <IconAlertCircle size={14} />;
}

function SmokeStepRow({ step }: { step: SmokeStepResult }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group align="flex-start" wrap="nowrap">
            <ThemeIcon radius="xl" size="md" color={statusColor(step.status)} variant="filled">
              {stepIcon(step)}
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
            {step.status === 'skipped' ? 'Skipped' : formatDuration(step.durationMs)}
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
  const [runningSectionId, setRunningSectionId] = useState<SmokeSectionId | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  async function runSection(sectionId: SmokeSectionId) {
    setPageError(null);
    setRunningSectionId(sectionId);
    try {
      const res = await fetch('/api/admin/smoke', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ sectionId }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          body && typeof body === 'object' && 'message' in body
            ? String(body.message ?? 'Smoke run failed.')
            : 'Smoke run failed.';
        throw new Error(message);
      }

      setResults((current) => ({
        ...current,
        [sectionId]: body as SmokeSectionResult,
      }));
      return true;
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not run the smoke section.');
      return false;
    } finally {
      setRunningSectionId(null);
    }
  }

  async function runFullSmoke() {
    for (const section of smokeSectionDefinitions) {
      const ok = await runSection(section.id);
      if (!ok) break;
    }
  }

  if (!isSuperadmin) {
    return (
      <Stack gap="lg">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="xs">
            <Title order={2}>Smoke Dashboard</Title>
            <Text c="dimmed">
              Run visual smoke sections from the app without SSHing into the server.
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
              <Title order={2}>Smoke Dashboard</Title>
              <Text c="dimmed">
                Run each smoke section separately, inspect the exact steps that passed or failed,
                and keep the server checks accessible from the app.
              </Text>
            </Stack>
            <Button
              leftSection={runningSectionId ? <IconLoader2 size={16} /> : <IconPlayerPlay size={16} />}
              onClick={runFullSmoke}
              disabled={!!runningSectionId}
            >
              Run full smoke
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            The dashboard runs the same smoke groups we use operationally today. Sections that
            depend on optional values like invite or privacy creds will mark themselves as skipped
            when those values are not configured in `.env.smoke.local`.
          </Text>
        </Stack>
      </Paper>

      {pageError ? <Alert color="red">{pageError}</Alert> : null}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" verticalSpacing="lg">
        {smokeSectionDefinitions.map((section) => {
          const result = results[section.id];
          const isRunning = runningSectionId === section.id;
          const completedSteps = result?.steps.filter((step) => step.status !== 'skipped').length ?? 0;
          const totalSteps = result?.steps.length ?? 0;
          const progressValue = totalSteps ? Math.max(8, (completedSteps / totalSteps) * 100) : 0;

          return (
            <Paper key={section.id} withBorder radius="lg" p="lg">
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
                  </Stack>

                  <Button
                    size="sm"
                    variant={result ? 'light' : 'filled'}
                    leftSection={isRunning ? <IconLoader2 size={16} /> : <IconPlayerPlay size={16} />}
                    disabled={!!runningSectionId}
                    onClick={() => runSection(section.id)}
                  >
                    {result ? 'Run again' : 'Run section'}
                  </Button>
                </Group>

                {isRunning ? <Progress value={100} animated /> : result ? <Progress value={progressValue} /> : null}

                {result ? (
                  <>
                    <Group gap="md">
                      <Text size="sm" c="dimmed">
                        Last run: {formatDateTime(result.finishedAt)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Duration: {formatDuration(result.durationMs)}
                      </Text>
                    </Group>
                    <Divider />
                    <Stack gap="sm">
                      {result.steps.map((step) => (
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
