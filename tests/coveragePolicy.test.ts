import { describe, expect, test } from 'vitest';
import {
  evaluateCoverageSummary,
  formatCoverageSummary,
  isSelectedDomainFile,
} from '../scripts/coverage-policy.mjs';

function metric(covered: number, total: number) {
  return {
    covered,
    total,
    pct: total === 0 ? 100 : (covered / total) * 100,
    skipped: 0,
  };
}

function coverageEntry(covered: number, total: number) {
  return {
    lines: metric(covered, total),
    functions: metric(covered, total),
    statements: metric(covered, total),
    branches: metric(covered, total),
  };
}

describe('application coverage policy', () => {
  test('recognizes explicit risk-domain and validation files', () => {
    expect(
      isSelectedDomainFile('/workspace/src/utils/csv.ts', '/workspace')
    ).toBe(true);
    expect(
      isSelectedDomainFile('/workspace/src/validation/auth.ts', '/workspace')
    ).toBe(true);
    expect(
      isSelectedDomainFile('/workspace/src/components/App.tsx', '/workspace')
    ).toBe(false);
  });

  test('enforces selected-domain thresholds without enforcing broad coverage', () => {
    const evaluation = evaluateCoverageSummary(
      {
        total: coverageEntry(20, 100),
        '/workspace/src/utils/csv.ts': coverageEntry(9, 10),
        '/workspace/src/components/App.tsx': coverageEntry(0, 90),
      },
      '/workspace'
    );

    expect(evaluation.failures).toEqual([]);
    expect(evaluation.selected.lines.pct).toBe(90);
    expect(evaluation.application.lines.pct).toBe(20);
    expect(formatCoverageSummary(evaluation)).toContain(
      'Whole application (informational)'
    );
  });

  test('reports selected-domain threshold failures', () => {
    const evaluation = evaluateCoverageSummary(
      {
        total: coverageEntry(70, 100),
        '/workspace/src/utils/csv.ts': coverageEntry(6, 10),
      },
      '/workspace'
    );

    expect(evaluation.failures).toEqual([
      'lines',
      'functions',
      'statements',
      'branches',
    ]);
  });
});
