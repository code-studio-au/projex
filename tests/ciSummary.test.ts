import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  appendCiCommandSummary,
  escapeWorkflowCommand,
  formatDuration,
} from '../scripts/ci-summary.mjs';

describe('CI command summaries', () => {
  test('formats sub-second, second, and minute durations', () => {
    expect(formatDuration(345)).toBe('345 ms');
    expect(formatDuration(12_345)).toBe('12.3 s');
    expect(formatDuration(125_000)).toBe('2m 5s');
  });

  test('escapes GitHub workflow command metadata and message content', () => {
    expect(escapeWorkflowCommand('lint: failed, 50%\nretry')).toBe(
      'lint%3A failed%2C 50%25%0Aretry'
    );
  });

  test('appends a concise verification timing table', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'projex-ci-summary-'));
    const summaryPath = join(directory, 'summary.md');

    await appendCiCommandSummary({
      durationMs: 1_250,
      label: 'Application tests',
      status: 'passed',
      summaryPath,
    });

    expect(await readFile(summaryPath, 'utf8')).toContain(
      '| Application tests | ✅ passed | 1.3 s |'
    );
  });
});
