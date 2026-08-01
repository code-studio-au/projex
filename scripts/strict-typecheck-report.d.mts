export type StrictTypecheckDiagnostic = {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
};

export type StrictTypecheckResult = {
  label: string;
  baseline: number;
  total: number;
  fileCount: number;
  diagnostics: StrictTypecheckDiagnostic[];
};

export function parseTypeScriptDiagnostics(output: string): {
  diagnostics: StrictTypecheckDiagnostic[];
  total: number;
  unmatched: number;
};

export function summarizeDiagnosticCodes(
  diagnostics: StrictTypecheckDiagnostic[]
): Array<[code: string, count: number]>;

export function formatStrictTypecheckSummary(
  results: StrictTypecheckResult[]
): string;
