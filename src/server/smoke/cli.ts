import type { SmokeSectionId, SmokeStepResult } from '../../types/index.ts';
import { smokeSectionDefinitions } from '../../types/index.ts';
import { getSmokeBaseUrl } from './env.ts';
import { runSmokeSection } from './runSection.ts';

const validSections = new Set(smokeSectionDefinitions.map((section) => section.id));

function parseRequestedSections(argv: string[]): Set<SmokeSectionId> {
  const sections: SmokeSectionId[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--section') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value after --section');
      if (!validSections.has(value as SmokeSectionId)) {
        throw new Error(
          `Unknown smoke section "${value}". Valid sections: ${Array.from(validSections).join(', ')}`
        );
      }
      sections.push(value as SmokeSectionId);
      index += 1;
      continue;
    }

    if (arg.startsWith('--section=')) {
      const value = arg.slice('--section='.length);
      if (!validSections.has(value as SmokeSectionId)) {
        throw new Error(
          `Unknown smoke section "${value}". Valid sections: ${Array.from(validSections).join(', ')}`
        );
      }
      sections.push(value as SmokeSectionId);
    }
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
  const requestedSections = parseRequestedSections(process.argv.slice(2));
  const baseUrl = getSmokeBaseUrl();
  let hasFailure = false;

  for (const section of smokeSectionDefinitions) {
    if (requestedSections.size > 0 && !requestedSections.has(section.id)) continue;

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

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
