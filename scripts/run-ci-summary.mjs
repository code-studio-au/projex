import { spawn } from 'node:child_process';
import {
  appendCiCommandSummary,
  escapeWorkflowCommand,
  formatDuration,
} from './ci-summary.mjs';

const [label, command, ...args] = process.argv.slice(2);
if (!label || !command) {
  throw new Error(
    'Usage: node scripts/run-ci-summary.mjs <label> <command> [...args]'
  );
}

const startedAt = performance.now();
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

const result = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
const durationMs = Math.round(performance.now() - startedAt);
const passed = result.code === 0 && !result.signal;

await appendCiCommandSummary({
  durationMs,
  label,
  status: passed ? 'passed' : 'failed',
});
console.info(`[timing] ${label}: ${formatDuration(durationMs)}`);

if (!passed && process.env.GITHUB_ACTIONS === 'true') {
  const reason = result.signal
    ? `terminated by ${result.signal}`
    : `exited with code ${result.code ?? 'unknown'}`;
  console.error(
    `::error title=${escapeWorkflowCommand(label)}::${escapeWorkflowCommand(reason)}`
  );
}

if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.code ?? 1;
}
