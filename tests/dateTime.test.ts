import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  emailChangeRequestResponseSchema,
  pendingEmailChangeResponseSchema,
  txnCommentResponseSchema,
} from '../src/validation/responseSchemas.ts';
import {
  asCompanyId,
  asProjectId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';
import { formatUtcDate, formatUtcDateTime } from '../src/utils/dateTime.ts';
import { dateOnlyFromInput } from '../src/utils/finance.ts';

test('dateOnlyFromInput uses UTC parts for Date input', () => {
  const value = new Date('2026-06-01T23:30:00-05:00');

  assert.equal(dateOnlyFromInput(value), '2026-06-02');
});

test('UTC formatters keep ISO-style ordering and explicit UTC for timestamps', () => {
  const value = '2026-06-01T23:30:00-05:00';

  assert.equal(formatUtcDate(value), '2026-06-02');
  assert.equal(formatUtcDateTime(value), '2026-06-02 04:30 UTC');
});

test('UTC formatters return invalid values unchanged', () => {
  assert.equal(formatUtcDate('not-a-date'), 'not-a-date');
  assert.equal(formatUtcDateTime('not-a-date'), 'not-a-date');
});

test('response schemas enforce ISO timestamps with offsets where expected', () => {
  assert.equal(
    pendingEmailChangeResponseSchema.safeParse({
      newEmail: 'user@example.com',
      requestedAt: '2026-06-01T12:00:00.000Z',
      expiresAt: '2026-06-01T13:00:00.000Z',
    }).success,
    true
  );

  assert.equal(
    emailChangeRequestResponseSchema.safeParse({
      newEmail: 'user@example.com',
      expiresAt: '2026-06-01 13:00:00',
      delivery: 'email',
    }).success,
    false
  );

  assert.equal(
    txnCommentResponseSchema.safeParse({
      id: asTxnCommentId('c_1'),
      companyId: asCompanyId('co_1'),
      projectId: asProjectId('prj_1'),
      txnId: asTxnId('txn_1'),
      body: 'Please review',
      createdByUserId: asUserId('u_1'),
      createdByName: 'Reviewer',
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: 'not-a-timestamp',
    }).success,
    false
  );
});

test('company summary response schema supports nested child projects', async () => {
  const { companySummaryProjectResponseSchema } =
    await import('../src/validation/responseSchemas.ts');

  const parsed = companySummaryProjectResponseSchema.parse({
    id: asProjectId('prg_1'),
    name: 'Programme',
    projectType: 'programme',
    status: 'active',
    visibility: 'company',
    currency: 'AUD',
    budgetCents: 0,
    months: [],
    children: [
      {
        id: asProjectId('prj_1'),
        name: 'Child',
        projectType: 'project',
        parentProjectId: asProjectId('prg_1'),
        status: 'active',
        visibility: 'private',
        currency: 'AUD',
        budgetCents: 100,
        months: [],
      },
    ],
  });

  assert.equal(parsed.children?.[0].id, 'prj_1');
});
