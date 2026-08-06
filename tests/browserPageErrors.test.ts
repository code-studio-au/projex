import { describe, expect, test } from 'vitest';

import { isExpectedWebKitNavigationCancellation } from './browser/pages/AuthenticatedSmokePage';

describe('browser page error classification', () => {
  const serverFnCancellation =
    '/localhost:3000/_serverFn/abc123?payload=value due to access control checks.';
  const summaryCancellation =
    '/localhost:3000/api/projects/project-1/transactions/comment-summaries?txnId=source_a&txnId=source_b due to access control checks.';

  test('recognizes only known WebKit navigation cancellation diagnostics', () => {
    expect(
      isExpectedWebKitNavigationCancellation('webkit', serverFnCancellation)
    ).toBe(true);
    expect(
      isExpectedWebKitNavigationCancellation('webkit', summaryCancellation)
    ).toBe(true);
    expect(
      isExpectedWebKitNavigationCancellation(
        'webkit',
        'https://localhost:3000/api/projects/project%201/transactions/comment-summaries?txnId=source_a due to access control checks.'
      )
    ).toBe(true);
    expect(
      isExpectedWebKitNavigationCancellation('chromium', serverFnCancellation)
    ).toBe(false);
    expect(
      isExpectedWebKitNavigationCancellation('chromium', summaryCancellation)
    ).toBe(false);
    expect(
      isExpectedWebKitNavigationCancellation(
        'webkit',
        '/localhost:3000/api/projects due to access control checks.'
      )
    ).toBe(false);
    expect(
      isExpectedWebKitNavigationCancellation(
        'webkit',
        '/localhost:3000/api/projects/project-1/transactions due to access control checks.'
      )
    ).toBe(false);
    expect(
      isExpectedWebKitNavigationCancellation(
        'webkit',
        '/localhost:3000/_serverFn/abc123 returned 500.'
      )
    ).toBe(false);
  });
});
