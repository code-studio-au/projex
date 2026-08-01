import { spawn } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { escapeWorkflowCommand } from './ci-summary.mjs';
import {
  formatStrictTypecheckSummary,
  parseTypeScriptDiagnostics,
} from './strict-typecheck-report.mjs';

const projects = [
  { label: 'Application', config: 'tsconfig.app.json' },
  { label: 'Node and server', config: 'tsconfig.node.json' },
  { label: 'Tests', config: 'tsconfig.tests.json' },
];
const flags = [
  {
    key: 'exactOptionalPropertyTypes',
    label: 'Exact optional properties',
    compilerArguments: [
      '--exactOptionalPropertyTypes',
      'true',
      '--noUncheckedIndexedAccess',
      'false',
    ],
  },
  {
    key: 'noUncheckedIndexedAccess',
    label: 'Unchecked indexed access',
    compilerArguments: [
      '--exactOptionalPropertyTypes',
      'false',
      '--noUncheckedIndexedAccess',
      'true',
    ],
  },
];
const baseline = JSON.parse(
  await readFile(resolve('strict-typecheck-baseline.json'), 'utf8')
);

function runTypeScript(config, compilerArguments) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      [
        'exec',
        'tsc',
        '-p',
        config,
        '--noEmit',
        '--pretty',
        'false',
        ...compilerArguments,
      ],
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
  projects.flatMap((project) =>
    flags.map(async (flag) => {
      const run = await runTypeScript(project.config, flag.compilerArguments);
      const parsed = parseTypeScriptDiagnostics(run.output);
      const expectedDiagnostics = baseline[flag.key]?.[project.config];
      if (
        !Number.isSafeInteger(expectedDiagnostics) ||
        expectedDiagnostics < 0
      ) {
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
        flagKey: flag.key,
        flagLabel: flag.label,
        ...parsed,
        baseline: expectedDiagnostics,
        fileCount: new Set(parsed.diagnostics.map((item) => item.file)).size,
      };
    })
  )
);

const summary = formatStrictTypecheckSummary(runs);
console.info(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (process.env.GITHUB_ACTIONS === 'true') {
  const samples = flags.flatMap((flag) => {
    const unique = new Map();
    for (const run of runs.filter((item) => item.flagKey === flag.key)) {
      for (const diagnostic of run.diagnostics) {
        const key = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}:${diagnostic.code}:${diagnostic.message}`;
        if (!unique.has(key)) {
          unique.set(key, { ...diagnostic, flagLabel: flag.label });
        }
      }
    }
    return [...unique.values()].slice(0, 8);
  });
  for (const diagnostic of samples) {
    console.warn(
      `::warning file=${escapeWorkflowCommand(diagnostic.file)},line=${diagnostic.line},col=${diagnostic.column},title=${escapeWorkflowCommand(`${diagnostic.flagLabel} ${diagnostic.code}`)}::${escapeWorkflowCommand(diagnostic.message)}`
    );
  }
}

const baselineMismatches = runs.filter((run) => run.total !== run.baseline);
for (const run of baselineMismatches) {
  const direction = run.total > run.baseline ? 'increased' : 'decreased';
  const message = `${run.flagLabel}, ${run.label}: diagnostics ${direction} from ${run.baseline} to ${run.total}; review the change and update strict-typecheck-baseline.json`;
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.error(
      `::error title=Strict TypeScript baseline mismatch::${escapeWorkflowCommand(message)}`
    );
  } else {
    console.error(message);
  }
}
if (baselineMismatches.length > 0) process.exitCode = 1;
