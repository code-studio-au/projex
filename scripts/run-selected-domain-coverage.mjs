import { spawn } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateCoverageSummary,
  formatCoverageSummary,
  selectedDomainThresholds,
} from './coverage-policy.mjs';

console.info(
  '[coverage] Whole-application reporting with selected risk-domain enforcement'
);

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'vitest', 'run', 'tests', '--coverage', ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  }
);

const result = await new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolveExit({ code, signal }));
});

if (result.signal) {
  process.kill(process.pid, result.signal);
} else if (result.code !== 0) {
  process.exitCode = result.code ?? 1;
} else {
  try {
    const report = JSON.parse(
      await readFile(resolve('coverage/coverage-summary.json'), 'utf8')
    );
    const evaluation = evaluateCoverageSummary(report);
    const summary = formatCoverageSummary(evaluation);
    console.info(`\n${summary}`);

    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    }

    if (evaluation.failures.length > 0) {
      const details = evaluation.failures
        .map(
          (metric) =>
            `${metric} ${evaluation.selected[metric].pct}% < ${selectedDomainThresholds[metric]}%`
        )
        .join(', ');
      if (process.env.GITHUB_ACTIONS === 'true') {
        console.error(`::error title=Coverage thresholds failed::${details}`);
      }
      throw new Error(`Selected-domain coverage thresholds failed: ${details}`);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
