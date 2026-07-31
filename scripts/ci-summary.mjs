import { appendFile } from 'node:fs/promises';

export function formatDuration(durationMs) {
  if (durationMs < 1_000) return `${durationMs} ms`;

  const totalSeconds = durationMs / 1_000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

export function escapeWorkflowCommand(value) {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}

export async function appendCiCommandSummary({
  durationMs,
  label,
  status,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
}) {
  const icon = status === 'passed' ? '✅' : '❌';
  const summary = [
    '## Verification timing',
    '',
    '| Gate | Result | Duration |',
    '| --- | --- | ---: |',
    `| ${label} | ${icon} ${status} | ${formatDuration(durationMs)} |`,
    '',
  ].join('\n');

  if (summaryPath) await appendFile(summaryPath, summary);
  return summary;
}
