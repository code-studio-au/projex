import { describe, expect, test } from 'vitest';

import {
  formatCompanyExportFileSize,
  getCompanyExportNotificationMessage,
  getCompanyExportSummaryRows,
} from '../src/components/companySettings/companyExportPresentation';
import {
  asCompanyExportJobId,
  asCompanyId,
  asUserId,
  type CompanyExportJob,
} from '../src/types';

function exportJob(
  overrides: Partial<CompanyExportJob> = {}
): CompanyExportJob {
  return {
    id: asCompanyExportJobId('export-1'),
    companyId: asCompanyId('company-1'),
    createdByUserId: asUserId('user-1'),
    scope: 'all',
    detail: 'full',
    status: 'running',
    requestedAt: '2026-07-28T10:00:00.000Z',
    notifyWhenReady: false,
    readyNotificationStatus: 'not_requested',
    ...overrides,
  };
}

describe('company export presentation model', () => {
  test('formats file sizes at useful precision', () => {
    expect(formatCompanyExportFileSize(512)).toBe('512 B');
    expect(formatCompanyExportFileSize(1536)).toBe('1.50 KB');
    expect(formatCompanyExportFileSize(12 * 1024 * 1024)).toBe('12.0 MB');
    expect(formatCompanyExportFileSize(-1)).toBe('');
  });

  test('describes ready-email state without implying failed delivery succeeded', () => {
    expect(
      getCompanyExportNotificationMessage(
        exportJob({
          notifyWhenReady: true,
          readyNotificationStatus: 'sent',
          readyNotificationDelivery: 'email',
        })
      )
    ).toBe('Ready email sent for this export.');
    expect(
      getCompanyExportNotificationMessage(
        exportJob({
          status: 'failed',
          notifyWhenReady: true,
          readyNotificationStatus: 'pending',
        })
      )
    ).toBe('Ready-email delivery is skipped when export generation fails.');
  });

  test('builds an auditable summary for completed filtered exports', () => {
    expect(
      getCompanyExportSummaryRows(
        exportJob({
          scope: 'active',
          detail: 'summary',
          status: 'completed',
          fromDate: '2026-07-01',
          toDate: '2026-07-31',
          completedAt: '2026-07-28T10:02:00.000Z',
          expiresAt: '2026-07-29T10:02:00.000Z',
        })
      )
    ).toEqual([
      'Scope: Active projects and programmes only',
      'Workbook: Summary and reporting only',
      'Transactions: 2026-07-01 to 2026-07-31',
      'Requested: 2026-07-28 10:00 UTC',
      'Generated: 2026-07-28 10:02 UTC',
      'Available until: 2026-07-29 10:02 UTC',
    ]);
  });
});
