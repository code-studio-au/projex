import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const { sendAuthEmailMock } = vi.hoisted(() => ({
  sendAuthEmailMock: vi.fn(),
}));

vi.mock('../src/server/auth/email.ts', () => ({
  sendAuthEmail: sendAuthEmailMock,
}));

import {
  buildCompanyExportReadyUrl,
  sendCompanyExportReadyEmail,
} from '../src/server/notifications/exportNotifications.ts';
import { asCompanyExportJobId, asCompanyId } from '../src/types/index.ts';

afterEach(() => {
  vi.clearAllMocks();
});

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

test('company export ready links prefer the explicit public app origin', () => {
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
      'https://dev.example.com/c/co_1?tab=settings&exportJob=expjob_1'
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

test('company export ready links return null when no app base url is configured', () => {
  const previousAppBaseUrl = process.env.PROJEX_APP_BASE_URL;
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  delete process.env.PROJEX_APP_BASE_URL;
  delete process.env.BETTER_AUTH_URL;

  try {
    assert.equal(
      buildCompanyExportReadyUrl({
        companyId: asCompanyId('co_1'),
        jobId: asCompanyExportJobId('expjob_1'),
      }),
      null
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

test('sendCompanyExportReadyEmail composes a linked email payload with escaped html content', async () => {
  sendAuthEmailMock.mockResolvedValue('email');

  const delivery = await sendCompanyExportReadyEmail({
    toEmail: 'owner@example.com',
    toName: 'Pat <Owner>',
    companyName: 'Acme & Sons',
    fileName: 'Q2 "Review".xlsx',
    generatedAt: '2026-06-26T00:00:00.000Z',
    expiresAt: '2026-06-27T00:00:00.000Z',
    readyUrl:
      `https://app.example.com/c/co_1?tab=settings&name="quoted"` +
      `&owner='single'`,
  });

  assert.equal(delivery, 'email');
  const sendCall = sendAuthEmailMock.mock.calls[0] as
    | [Record<string, string>]
    | undefined;
  assert.equal(sendCall?.[0].to, 'owner@example.com');
  assert.match(sendCall?.[0].subject ?? '', /Acme & Sons/);
  assert.match(sendCall?.[0].text ?? '', /Open your export in Projex:/);
  assert.match(
    sendCall?.[0].html ?? '',
    /Pat &lt;Owner&gt;.*Acme &amp; Sons.*Q2 &quot;Review&quot;\.xlsx/s
  );
  assert.match(
    sendCall?.[0].html ?? '',
    /href="https:\/\/app\.example\.com\/c\/co_1\?tab=settings&amp;name=&quot;quoted&quot;&amp;owner=&#39;single&#39;"/
  );
});

test('sendCompanyExportReadyEmail falls back to the email address and no-link copy when readyUrl is missing', async () => {
  sendAuthEmailMock.mockResolvedValue('log');

  const delivery = await sendCompanyExportReadyEmail({
    toEmail: 'owner@example.com',
    toName: '',
    companyName: 'Acme Delivery',
    fileName: 'acme-export.xlsx',
    generatedAt: '2026-06-26T00:00:00.000Z',
    readyUrl: null,
  });

  assert.equal(delivery, 'log');
  const sendCall = sendAuthEmailMock.mock.calls[0] as
    | [Record<string, string>]
    | undefined;
  assert.match(sendCall?.[0].text ?? '', /owner@example\.com/);
  assert.match(
    sendCall?.[0].text ?? '',
    /Open Projex and go to Company Settings to download the finished workbook\./
  );
  assert.doesNotMatch(sendCall?.[0].html ?? '', /Open your export in Projex/);
});
