export type StrictTypecheckDiagnostic = {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
};

export type StrictTypecheckResult = {
  flagKey: string;
  flagLabel: string;
  label: string;
  baseline: number;
  total: number;
  fileCount: number;
  diagnostics: StrictTypecheckDiagnostic[];
};

export type StrictTypecheckUniqueSummary = {
  flagKey: string;
  flagLabel: string;
  total: number;
  production: number;
  tests: number;
  fileCount: number;
};

export function parseTypeScriptDiagnostics(output: string): {
  diagnostics: StrictTypecheckDiagnostic[];
  total: number;
  unmatched: number;
};

export function summarizeDiagnosticCodes(
  diagnostics: StrictTypecheckDiagnostic[]
): Array<[code: string, count: number]>;

export function summarizeUniqueDiagnostics(
  results: StrictTypecheckResult[]
): StrictTypecheckUniqueSummary[];

export function formatStrictTypecheckSummary(
  results: StrictTypecheckResult[]
): string;
