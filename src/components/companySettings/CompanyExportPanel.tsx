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

import type { CompanyId } from '../../types';
import {
  useCompanyExportJobQuery,
  useCreateCompanyExportJobMutation,
} from '../../queries/companyExports';
import classes from '../../styles/ui.module.css';
import { omitUndefinedProperties } from '../../utils/optionalProperties';
import {
  formatCompanyExportFileSize,
  getCompanyExportNotificationMessage,
  getCompanyExportSummaryRows,
} from './companyExportPresentation';

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
  const [startedExport, setStartedExport] = useState<{
    companyId: CompanyId;
    jobId: string;
    routeJobId: string | null;
  } | null>(null);
  const autoDownloadTargetJobIdRef = useRef<string | null>(null);

  const selectedJobId =
    startedExport?.companyId === companyId &&
    startedExport.routeJobId === initialExportJobId
      ? startedExport.jobId
      : initialExportJobId;
  const exportJobQuery = useCompanyExportJobQuery({
    companyId,
    jobId: selectedJobId,
    enabled: isHydrated && canExportCompany,
  });
  const createExportJob = useCreateCompanyExportJobMutation(companyId);

  const currentExportOptions = useMemo(
    () =>
      omitUndefinedProperties({
        scope: exportScope,
        detail: exportDetail,
        from: exportFromDate || undefined,
        to: exportToDate || undefined,
        notifyWhenReady,
      }),
    [exportDetail, exportFromDate, exportScope, exportToDate, notifyWhenReady]
  );

  const exportJob = exportJobQuery.data ?? null;

  useEffect(() => {
    const job = exportJob;
    if (!job || job.status !== 'completed' || !job.downloadPath) return;
    if (autoDownloadTargetJobIdRef.current !== job.id) return;

    autoDownloadTargetJobIdRef.current = null;
    window.location.assign(job.downloadPath);
  }, [exportJob]);

  async function handleStartExport() {
    try {
      const job = await createExportJob.mutateAsync(currentExportOptions);
      autoDownloadTargetJobIdRef.current = job.id;
      setStartedExport({
        companyId,
        jobId: job.id,
        routeJobId: initialExportJobId,
      });
    } catch {
      // Mutation state owns the user-facing error.
    }
  }

  const exportError = createExportJob.error ?? exportJobQuery.error;
  const exportJobState = {
    error:
      exportError instanceof Error
        ? exportError.message
        : exportError
          ? 'Could not load export status.'
          : null,
    isStarting: createExportJob.isPending,
  };
  const exportInFlight =
    createExportJob.isPending ||
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
