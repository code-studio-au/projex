import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  COMPANY_EXPORT_POLL_INTERVAL_MS,
  companyExportJobQueryOptions,
  getCompanyExportPollingInterval,
} from '../src/queries/companyExports';
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
    requestedAt: '2026-08-02T01:00:00.000Z',
    notifyWhenReady: false,
    readyNotificationStatus: 'not_requested',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('company export queries', () => {
  test('loads an exact export through the scoped API query with cancellation', async () => {
    const job = exportJob();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(JSON.stringify(job), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const result = await queryClient.fetchQuery(
      companyExportJobQueryOptions({
        userId: 'user-1',
        companyId: job.companyId,
        jobId: job.id,
        enabled: true,
      })
    );

    expect(result).toEqual(job);
    const call = fetchMock.mock.calls.at(0);
    expect(call).toBeDefined();
    if (!call) throw new Error('Expected the export query to call fetch');
    expect(call[0]).toBe('/api/export-jobs/export-1');
    expect(call[1]).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
    });
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  test('polls only while the export is queued or running', () => {
    expect(
      getCompanyExportPollingInterval(exportJob({ status: 'queued' }))
    ).toBe(COMPANY_EXPORT_POLL_INTERVAL_MS);
    expect(
      getCompanyExportPollingInterval(exportJob({ status: 'running' }))
    ).toBe(COMPANY_EXPORT_POLL_INTERVAL_MS);
    expect(
      getCompanyExportPollingInterval(exportJob({ status: 'completed' }))
    ).toBe(false);
    expect(getCompanyExportPollingInterval(null)).toBe(false);
  });
});
