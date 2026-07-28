import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';

import type { CompanyExportJob, CompanyId } from '../../types';
import classes from '../../styles/ui.module.css';
import {
  formatCompanyExportFileSize,
  getCompanyExportNotificationMessage,
  getCompanyExportSummaryRows,
} from './companyExportPresentation';

const EXPORT_JOB_POLL_INTERVAL_MS = 2000;

type ExportJobState = {
  job: CompanyExportJob | null;
  error: string | null;
  isStarting: boolean;
};

export default function CompanyExportPanel(props: {
  companyId: CompanyId;
  initialExportJobId: string | null;
  canExportCompany: boolean;
  isHydrated: boolean;
}) {
  const { companyId, initialExportJobId, canExportCompany, isHydrated } = props;
  const [exportScope, setExportScope] = useState<'all' | 'active'>('all');
  const [exportDetail, setExportDetail] = useState<'full' | 'summary'>('full');
  const [exportFromDate, setExportFromDate] = useState('');
  const [exportToDate, setExportToDate] = useState('');
  const [notifyWhenReady, setNotifyWhenReady] = useState(false);
  const [exportJobState, setExportJobState] = useState<ExportJobState>({
    job: null,
    error: null,
    isStarting: false,
  });
  const autoDownloadJobIdRef = useRef<string | null>(null);

  const currentExportOptions = useMemo(
    () => ({
      scope: exportScope,
      detail: exportDetail,
      from: exportFromDate || undefined,
      to: exportToDate || undefined,
      notifyWhenReady,
    }),
    [exportDetail, exportFromDate, exportScope, exportToDate, notifyWhenReady]
  );

  useEffect(() => {
    if (!isHydrated || !canExportCompany) return;

    let cancelled = false;
    void (async () => {
      const endpoint = initialExportJobId
        ? `/api/export-jobs/${encodeURIComponent(initialExportJobId)}`
        : `/api/companies/${encodeURIComponent(companyId)}/export-jobs`;
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { accept: 'application/json' },
        });
        const payload = (await response.json()) as
          | CompanyExportJob
          | {
              message?: string;
            }
          | null;
        if (cancelled) return;
        if (!response.ok) {
          if (initialExportJobId) {
            setExportJobState((current) => ({
              ...current,
              error:
                typeof payload === 'object' && payload && 'message' in payload
                  ? (payload.message ?? 'Could not load the requested export.')
                  : 'Could not load the requested export.',
            }));
          }
          return;
        }
        if (!payload) return;
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
  }, [canExportCompany, companyId, initialExportJobId, isHydrated]);

  const polledExportJobId = exportJobState.job?.id;
  const polledExportJobStatus = exportJobState.job?.status;

  useEffect(() => {
    if (!polledExportJobId) return;
    if (
      polledExportJobStatus !== 'queued' &&
      polledExportJobStatus !== 'running'
    ) {
      return;
    }

    const jobId = polledExportJobId;
    let timeoutId: number | null = null;
    let cancelled = false;

    async function pollExportJob() {
      try {
        const response = await fetch(
          `/api/export-jobs/${encodeURIComponent(jobId)}`,
          {
            method: 'GET',
            headers: { accept: 'application/json' },
          }
        );
        const payload = (await response.json()) as
          | CompanyExportJob
          | {
              message?: string;
            };
        if (cancelled) return;
        if (!response.ok) {
          setExportJobState((current) => ({
            ...current,
            error:
              typeof payload === 'object' && payload && 'message' in payload
                ? (payload.message ?? 'Could not refresh export job status.')
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
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void pollExportJob();
          }, EXPORT_JOB_POLL_INTERVAL_MS);
        }
      }
    }

    timeoutId = window.setTimeout(() => {
      void pollExportJob();
    }, EXPORT_JOB_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [polledExportJobId, polledExportJobStatus]);

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
      const payload = (await response.json()) as
        | CompanyExportJob
        | {
            message?: string;
          };
      if (!response.ok) {
        throw new Error(
          typeof payload === 'object' && payload && 'message' in payload
            ? (payload.message ?? 'Could not start export.')
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
        error:
          error instanceof Error ? error.message : 'Could not start export.',
      }));
    }
  }

  const exportJob = exportJobState.job;
  const exportInFlight =
    exportJobState.isStarting ||
    exportJob?.status === 'queued' ||
    exportJob?.status === 'running';
  const exportNotificationMessage =
    getCompanyExportNotificationMessage(exportJob);
  const exportJobSummaryRows = getCompanyExportSummaryRows(exportJob);

  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Exports</Title>
        <Text size="sm" c="dimmed">
          Download a full-company Excel workbook for finance handoff, offline
          analysis, or executive reporting.
        </Text>
        <Stack gap="sm" style={{ width: '100%', maxWidth: 680 }}>
          <Select
            label="Project scope"
            data={[
              { value: 'all', label: 'All visible projects and programmes' },
              {
                value: 'active',
                label: 'Active projects and programmes only',
              },
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
          <Group grow align="flex-end" wrap="wrap">
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
          <Checkbox
            label="Email me when this export is ready"
            checked={notifyWhenReady}
            onChange={(event) =>
              setNotifyWhenReady(event.currentTarget.checked)
            }
            disabled={!canExportCompany || exportInFlight}
          />
          <Text size="xs" c="dimmed">
            The email links back to this export in Company Settings and still
            respects your current sign-in and company access.
          </Text>
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
                    ? `Workbook ready${exportJob.fileName ? `: ${exportJob.fileName}` : ''}${typeof exportJob.fileSizeBytes === 'number' ? ` (${formatCompanyExportFileSize(exportJob.fileSizeBytes)})` : ''}.`
                    : exportJob.status === 'expired'
                      ? 'That prepared workbook expired. Start a fresh export to regenerate it.'
                      : (exportJob.errorMessage ?? 'Export failed.')}
            </Alert>
          ) : null}
          {exportNotificationMessage ? (
            <Alert
              color={
                exportJob?.readyNotificationStatus === 'failed'
                  ? 'yellow'
                  : 'gray'
              }
            >
              {exportNotificationMessage}
            </Alert>
          ) : null}
          {exportJobSummaryRows.length ? (
            <Paper withBorder radius="md" p="sm">
              <Stack gap={4}>
                {exportJobSummaryRows.map((row) => (
                  <Text key={row} size="xs" c="dimmed">
                    {row}
                  </Text>
                ))}
              </Stack>
            </Paper>
          ) : null}
          <Group gap="sm" wrap="wrap">
            <Button
              variant="default"
              disabled={!canExportCompany || exportInFlight}
              loading={exportJobState.isStarting}
              onClick={() => {
                void handleStartExport();
              }}
            >
              {exportJob?.status === 'completed' ||
              exportJob?.status === 'failed'
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
      </Stack>
    </Paper>
  );
}
