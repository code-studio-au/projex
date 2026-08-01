import { describe, expect, test } from 'vitest';
import {
  formatStrictTypecheckSummary,
  parseTypeScriptDiagnostics,
  summarizeDiagnosticCodes,
} from '../scripts/strict-typecheck-report.mjs';

describe('strict TypeScript reporting', () => {
  test('parses file diagnostics and accounts for global diagnostics', () => {
    const report = parseTypeScriptDiagnostics(
      [
        "src/example.ts(4,9): error TS2532: Object is possibly 'undefined'.",
        'src/example.ts(8,2): error TS2375: Type mismatch.',
        'error TS18003: No inputs were found.',
      ].join('\n')
    );

    expect(report).toEqual({
      diagnostics: [
        {
          file: 'src/example.ts',
          line: 4,
          column: 9,
          code: 'TS2532',
          message: "Object is possibly 'undefined'.",
        },
        {
          file: 'src/example.ts',
          line: 8,
          column: 2,
          code: 'TS2375',
          message: 'Type mismatch.',
        },
      ],
      total: 3,
      unmatched: 1,
    });
  });

  test('orders diagnostic codes by frequency then code', () => {
    const diagnostics = parseTypeScriptDiagnostics(
      [
        'a.ts(1,1): error TS2532: First.',
        'a.ts(2,1): error TS2375: Second.',
        'a.ts(3,1): error TS2532: Third.',
      ].join('\n')
    ).diagnostics;

    expect(summarizeDiagnosticCodes(diagnostics)).toEqual([
      ['TS2532', 2],
      ['TS2375', 1],
    ]);
  });

  test('formats baseline changes in the job summary', () => {
    expect(
      formatStrictTypecheckSummary([
        {
          label: 'Application',
          baseline: 10,
          total: 12,
          fileCount: 3,
          diagnostics: [],
        },
      ])
    ).toContain('| Application | 12 | 10 | +2 | 3 |');
  });
});
