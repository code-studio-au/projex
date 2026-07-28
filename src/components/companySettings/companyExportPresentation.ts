import type { CompanyExportJob } from '../../types';
import { formatUtcDateTime } from '../../utils/dateTime';

export function formatCompanyExportFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const display =
    value >= 100
      ? value.toFixed(0)
      : value >= 10
        ? value.toFixed(1)
        : value.toFixed(2);
  return `${display} ${units[unitIndex]}`;
}

export function getCompanyExportNotificationMessage(
  job: CompanyExportJob | null
) {
  if (!job?.notifyWhenReady) return null;
  if (job.status === 'failed') {
    return 'Ready-email delivery is skipped when export generation fails.';
  }
  if (job.readyNotificationStatus === 'pending') {
    return 'We will send a ready email for this export if delivery is configured.';
  }
  if (job.readyNotificationStatus === 'sent') {
    return job.readyNotificationDelivery === 'email'
      ? 'Ready email sent for this export.'
      : 'Email delivery is not configured, so the ready email was logged on the server instead.';
  }
  if (job.readyNotificationStatus === 'failed') {
    return (
      job.readyNotificationError ??
      'Could not send the ready email for this export.'
    );
  }
  return null;
}

export function getCompanyExportSummaryRows(job: CompanyExportJob | null) {
  if (!job) return [];

  const rows: string[] = [
    `Scope: ${job.scope === 'active' ? 'Active projects and programmes only' : 'All visible projects and programmes'}`,
    `Workbook: ${job.detail === 'summary' ? 'Summary and reporting only' : 'Full detail workbook'}`,
  ];

  if (job.fromDate || job.toDate) {
    rows.push(
      `Transactions: ${job.fromDate ?? 'Any start'} to ${job.toDate ?? 'Any end'}`
    );
  } else {
    rows.push('Transactions: All available dates');
  }

  rows.push(`Requested: ${formatUtcDateTime(job.requestedAt)}`);

  if (job.completedAt) {
    rows.push(`Generated: ${formatUtcDateTime(job.completedAt)}`);
  } else if (job.failedAt) {
    rows.push(`Failed: ${formatUtcDateTime(job.failedAt)}`);
  } else if (job.startedAt) {
    rows.push(`Started: ${formatUtcDateTime(job.startedAt)}`);
  }

  if (job.expiresAt && job.status === 'completed') {
    rows.push(`Available until: ${formatUtcDateTime(job.expiresAt)}`);
  }

  return rows;
}
