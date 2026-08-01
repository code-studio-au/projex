// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { useIsHydrated } from '../src/hooks/useIsHydrated';

function HydrationProbe({ snapshots }: { snapshots: boolean[] }) {
  const isHydrated = useIsHydrated();
  snapshots.push(isHydrated);

  return null;
}

afterEach(cleanup);

test('tracks hydration independently for each consumer', async () => {
  const firstSnapshots: boolean[] = [];
  render(<HydrationProbe snapshots={firstSnapshots} />);

  assert.equal(firstSnapshots[0], false);
  await waitFor(() => assert.equal(firstSnapshots.at(-1), true));

  cleanup();

  const secondSnapshots: boolean[] = [];
  render(<HydrationProbe snapshots={secondSnapshots} />);

  assert.equal(secondSnapshots[0], false);
  await waitFor(() => assert.equal(secondSnapshots.at(-1), true));
});
