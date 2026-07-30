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

type ExportJobResponseBody =
  | CompanyExportJob
  | {
      message?: string;
    }
  | null;

async function readExportJobResponse(response: Response) {
  if (!response.ok) {
    return {
      ok: false as const,
      payload: (await response.json()) as ExportJobResponseBody,
    };
  }
  return {
    ok: true as const,
    payload: (await response.json()) as ExportJobResponseBody,
  };
}

function useCompanyExportPanelController(props: {
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
        const { ok, payload } = await readExportJobResponse(response);
        if (cancelled) return;
        if (!ok) {
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
        const { ok, payload } = await readExportJobResponse(response);
        if (cancelled) return;
        if (!ok) {
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
      const { ok, payload } = await readExportJobResponse(response);
      if (!ok) {
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

  return {
    canExportCompany,
    exportDetail,
    exportFromDate,
    exportInFlight,
    exportJob,
    exportJobState,
    exportJobSummaryRows,
    exportNotificationMessage,
    exportScope,
    exportToDate,
    handleStartExport,
    notifyWhenReady,
    setExportDetail,
    setExportFromDate,
    setExportScope,
    setExportToDate,
    setNotifyWhenReady,
  };
}

type CompanyExportPanelController = ReturnType<
  typeof useCompanyExportPanelController
>;

function CompanyExportPanelView({
  model,
}: {
  model: CompanyExportPanelController;
}) {
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
            value={model.exportScope}
            onChange={(value) =>
              model.setExportScope(value === 'active' ? 'active' : 'all')
            }
            disabled={!model.canExportCompany || model.exportInFlight}
          />
          <Select
            label="Workbook detail"
            data={[
              { value: 'full', label: 'Full detail workbook' },
              { value: 'summary', label: 'Summary and reporting only' },
            ]}
            value={model.exportDetail}
            onChange={(value) =>
              model.setExportDetail(value === 'summary' ? 'summary' : 'full')
            }
            disabled={!model.canExportCompany || model.exportInFlight}
          />
          <Group grow align="flex-end" wrap="wrap">
            <TextInput
              label="Transactions from"
              type="date"
              value={model.exportFromDate}
              onChange={(event) =>
                model.setExportFromDate(event.currentTarget.value)
              }
              disabled={!model.canExportCompany || model.exportInFlight}
            />
            <TextInput
              label="Transactions to"
              type="date"
              value={model.exportToDate}
              onChange={(event) =>
                model.setExportToDate(event.currentTarget.value)
              }
              disabled={!model.canExportCompany || model.exportInFlight}
            />
          </Group>
          <Checkbox
            label="Email me when this export is ready"
            checked={model.notifyWhenReady}
            onChange={(event) =>
              model.setNotifyWhenReady(event.currentTarget.checked)
            }
            disabled={!model.canExportCompany || model.exportInFlight}
          />
          <Text size="xs" c="dimmed">
            The email links back to this export in Company Settings and still
            respects your current sign-in and company access.
          </Text>
          {model.exportJobState.error ? (
            <Alert color="red">{model.exportJobState.error}</Alert>
          ) : null}
          {model.exportJob ? (
            <Alert color={model.exportJob.status === 'failed' ? 'red' : 'blue'}>
              {model.exportJob.status === 'queued'
                ? 'Export queued. We are preparing the workbook in the background.'
                : model.exportJob.status === 'running'
                  ? 'Export in progress. The workbook will download automatically when it is ready.'
                  : model.exportJob.status === 'completed'
                    ? `Workbook ready${model.exportJob.fileName ? `: ${model.exportJob.fileName}` : ''}${typeof model.exportJob.fileSizeBytes === 'number' ? ` (${formatCompanyExportFileSize(model.exportJob.fileSizeBytes)})` : ''}.`
                    : model.exportJob.status === 'expired'
                      ? 'That prepared workbook expired. Start a fresh export to regenerate it.'
                      : (model.exportJob.errorMessage ?? 'Export failed.')}
            </Alert>
          ) : null}
          {model.exportNotificationMessage ? (
            <Alert
              color={
                model.exportJob?.readyNotificationStatus === 'failed'
                  ? 'yellow'
                  : 'gray'
              }
            >
              {model.exportNotificationMessage}
            </Alert>
          ) : null}
          {model.exportJobSummaryRows.length ? (
            <Paper withBorder radius="md" p="sm">
              <Stack gap={4}>
                {model.exportJobSummaryRows.map((row) => (
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
              disabled={!model.canExportCompany || model.exportInFlight}
              loading={model.exportJobState.isStarting}
              onClick={() => {
                void model.handleStartExport();
              }}
            >
              {model.exportJob?.status === 'completed' ||
              model.exportJob?.status === 'failed'
                ? 'Generate fresh export'
                : 'Prepare company export'}
            </Button>
            {model.exportJob?.status === 'completed' &&
            model.exportJob.downloadPath ? (
              <Button
                component="a"
                href={model.exportJob.downloadPath}
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

export default function CompanyExportPanel(
  props: Parameters<typeof useCompanyExportPanelController>[0]
) {
  const model = useCompanyExportPanelController(props);
  return <CompanyExportPanelView model={model} />;
}
