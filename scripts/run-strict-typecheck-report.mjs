import { spawn } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { escapeWorkflowCommand } from './ci-summary.mjs';
import {
  formatStrictTypecheckSummary,
  parseTypeScriptDiagnostics,
} from './strict-typecheck-report.mjs';

const projects = [
  { label: 'Application', config: 'tsconfig.strict.app.json' },
  { label: 'Node and server', config: 'tsconfig.strict.node.json' },
  { label: 'Tests', config: 'tsconfig.strict.tests.json' },
];
const baseline = JSON.parse(
  await readFile(resolve('strict-typecheck-baseline.json'), 'utf8')
);

function runTypeScript(config) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'tsc', '-p', config, '--noEmit', '--pretty', 'false'],
      { cwd: process.cwd(), env: process.env }
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveRun({ code, output, signal }));
  });
}

const runs = await Promise.all(
  projects.map(async (project) => {
    const run = await runTypeScript(project.config);
    const parsed = parseTypeScriptDiagnostics(run.output);
    const expectedDiagnostics = baseline[project.config];
    if (!Number.isSafeInteger(expectedDiagnostics) || expectedDiagnostics < 0) {
      throw new Error(`Missing strictness baseline for ${project.config}`);
    }
    if (run.signal) {
      throw new Error(
        `${project.config} was terminated by ${run.signal}:\n${run.output}`
      );
    }
    if (run.code !== 0 && parsed.total === 0) {
      throw new Error(
        `${project.config} failed without TypeScript diagnostics:\n${run.output}`
      );
    }
    return {
      ...project,
      ...parsed,
      baseline: expectedDiagnostics,
      fileCount: new Set(parsed.diagnostics.map((item) => item.file)).size,
    };
  })
);

const summary = formatStrictTypecheckSummary(runs);
console.info(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (process.env.GITHUB_ACTIONS === 'true') {
  const samples = runs.flatMap((run) =>
    run.diagnostics.slice(0, 8).map((diagnostic) => ({
      ...diagnostic,
      project: run.label,
    }))
  );
  for (const diagnostic of samples) {
    console.warn(
      `::warning file=${escapeWorkflowCommand(diagnostic.file)},line=${diagnostic.line},col=${diagnostic.column},title=${escapeWorkflowCommand(`${diagnostic.project} ${diagnostic.code}`)}::${escapeWorkflowCommand(diagnostic.message)}`
    );
  }

  for (const run of runs) {
    if (run.total > run.baseline) {
      console.warn(
        `::warning title=Strict TypeScript baseline increased::${escapeWorkflowCommand(`${run.label}: ${run.total} diagnostics exceeds baseline ${run.baseline}`)}`
      );
    }
  }
}
