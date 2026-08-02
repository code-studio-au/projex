import { describe, expect, test } from 'vitest';

import { isExpectedWebKitServerFnCancellation } from './browser/pages/AuthenticatedSmokePage';

describe('browser page error classification', () => {
  const cancellation =
    '/localhost:3000/_serverFn/abc123?payload=value due to access control checks.';

  test('recognizes only WebKit server-function cancellation diagnostics', () => {
    expect(isExpectedWebKitServerFnCancellation('webkit', cancellation)).toBe(
      true
    );
    expect(isExpectedWebKitServerFnCancellation('chromium', cancellation)).toBe(
      false
    );
    expect(
      isExpectedWebKitServerFnCancellation(
        'webkit',
        '/localhost:3000/api/projects due to access control checks.'
      )
    ).toBe(false);
    expect(
      isExpectedWebKitServerFnCancellation(
        'webkit',
        '/localhost:3000/_serverFn/abc123 returned 500.'
      )
    ).toBe(false);
  });
});
