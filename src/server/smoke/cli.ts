import type { SmokeSectionId, SmokeStepResult } from '../../types/index.ts';
import { smokeSectionDefinitions } from '../../types/index.ts';
import { parseCliArgs } from '../../../scripts/cli-args.mjs';
import { getSmokeConfiguredBaseUrl } from './env.ts';
import {
  cleanupSmokeFixtures,
  createSmokeFixtures,
  sweepSmokeFixtures,
  type SmokeFixtures,
} from './fixtures.ts';
import { runSmokeSection } from './runSection.ts';

const validSections = new Set(
  smokeSectionDefinitions.map((section) => section.id)
);

function isSmokeSectionId(value: string): value is SmokeSectionId {
  return smokeSectionDefinitions.some((section) => section.id === value);
}

function parseRequestedSections(values: string[]): Set<SmokeSectionId> {
  const sections: SmokeSectionId[] = [];
  for (const value of values) {
    if (!isSmokeSectionId(value)) {
      throw new Error(
        `Unknown smoke section "${value}". Valid sections: ${Array.from(validSections).join(', ')}`
      );
    }
    sections.push(value);
  }

  return new Set(sections);
}

function logStep(step: SmokeStepResult) {
  const prefix =
    step.status === 'passed'
      ? '[ok]'
      : step.status === 'failed'
        ? '[!!]'
        : '[..]';
  const detail =
    step.status === 'failed'
      ? `: ${step.error ?? 'Unknown failure'}`
      : step.detail
        ? `: ${step.detail}`
        : '';
  console.info(`${prefix} ${step.label}${detail}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cliArgs = parseCliArgs(argv, {
    booleanFlags: [
      '--cleanup-stale-fixtures',
      '--sweep-stale-fixtures',
      '--use-generated-fixtures',
    ],
    valueOptions: ['--section'],
  });
  const requestedSections = parseRequestedSections(
    cliArgs.getValues('--section')
  );
  const useGeneratedFixtures = cliArgs.flags.has('--use-generated-fixtures');
  const sweepStaleFixtures = cliArgs.flags.has('--sweep-stale-fixtures');
  const cleanupOnly = cliArgs.flags.has('--cleanup-stale-fixtures');
  const baseUrl = getSmokeConfiguredBaseUrl();
  let hasFailure = false;
  let fixtures: SmokeFixtures | null = null;

  try {
    if (cleanupOnly) {
      await sweepSmokeFixtures({
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
      return;
    }

    if (useGeneratedFixtures) {
      fixtures = await createSmokeFixtures({
        sweepStale: sweepStaleFixtures,
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
    } else if (sweepStaleFixtures) {
      await sweepSmokeFixtures({
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
    }

    for (const section of smokeSectionDefinitions) {
      if (requestedSections.size > 0 && !requestedSections.has(section.id))
        continue;

      console.info(`\n== ${section.label} ==`);
      const result = await runSmokeSection(section.id, baseUrl, {
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
        onStep(step) {
          logStep(step);
        },
      });

      if (result.status === 'failed') {
        hasFailure = true;
      }
    }
  } finally {
    if (fixtures) {
      await cleanupSmokeFixtures(fixtures, {
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
