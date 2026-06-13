import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCompanyExportReadyUrl } from '../src/server/notifications/exportNotifications.ts';
import {
  asCompanyExportJobId,
  asCompanyId,
} from '../src/types/index.ts';

test('company export ready links open company settings for the exact export job', () => {
  const previousAppBaseUrl = process.env.PROJEX_APP_BASE_URL;
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.PROJEX_APP_BASE_URL = 'https://app.example.com';
  delete process.env.BETTER_AUTH_URL;

  try {
    assert.equal(
      buildCompanyExportReadyUrl({
        companyId: asCompanyId('co_1'),
        jobId: asCompanyExportJobId('expjob_1'),
      }),
      'https://app.example.com/c/co_1?tab=settings&exportJob=expjob_1'
    );
  } finally {
    if (previousAppBaseUrl === undefined) {
      delete process.env.PROJEX_APP_BASE_URL;
    } else {
      process.env.PROJEX_APP_BASE_URL = previousAppBaseUrl;
    }

    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
    }
  }
});

test('company export ready links prefer the auth app origin when both are configured', () => {
  const previousAppBaseUrl = process.env.PROJEX_APP_BASE_URL;
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.PROJEX_APP_BASE_URL = 'https://dev.example.com';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';

  try {
    assert.equal(
      buildCompanyExportReadyUrl({
        companyId: asCompanyId('co_1'),
        jobId: asCompanyExportJobId('expjob_1'),
      }),
      'https://app.example.com/c/co_1?tab=settings&exportJob=expjob_1'
    );
  } finally {
    if (previousAppBaseUrl === undefined) {
      delete process.env.PROJEX_APP_BASE_URL;
    } else {
      process.env.PROJEX_APP_BASE_URL = previousAppBaseUrl;
    }

    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
    }
  }
});
