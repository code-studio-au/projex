import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { getRetryDelayMs } from '../src/server/smoke/shared.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

test('getRetryDelayMs prefers Retry-After seconds when present', () => {
  const response = new Response(null, {
    headers: { 'retry-after': '12' },
    status: 429,
  });

  expect(getRetryDelayMs(response, 1500)).toBe(12_000);
});

test('getRetryDelayMs prefers a future Retry-After date when present', () => {
  const response = new Response(null, {
    headers: { 'retry-after': 'Thu, 16 Jul 2026 00:00:09 GMT' },
    status: 429,
  });

  expect(getRetryDelayMs(response, 1500)).toBe(9_000);
});

test('getRetryDelayMs falls back when Retry-After is invalid or shorter', () => {
  const invalidResponse = new Response(null, {
    headers: { 'retry-after': 'not-a-delay' },
    status: 429,
  });
  const shortResponse = new Response(null, {
    headers: { 'retry-after': '1' },
    status: 429,
  });

  expect(getRetryDelayMs(invalidResponse, 1500)).toBe(1500);
  expect(getRetryDelayMs(shortResponse, 1500)).toBe(1500);
});
