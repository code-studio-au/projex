type CoverageMetric = {
  covered: number;
  total: number;
  pct: number;
  skipped?: number;
};

type CoverageEntry = {
  lines: CoverageMetric;
  functions: CoverageMetric;
  statements: CoverageMetric;
  branches: CoverageMetric;
};

type CoverageEvaluation = {
  application: CoverageEntry;
  failures: Array<keyof CoverageEntry>;
  selected: CoverageEntry;
  selectedFileCount: number;
};

export const selectedDomainThresholds: Readonly<
  Record<keyof CoverageEntry, number>
>;

export function isSelectedDomainFile(
  filePath: string,
  workspaceRoot?: string
): boolean;

export function evaluateCoverageSummary(
  summary: Record<string, CoverageEntry>,
  workspaceRoot?: string
): CoverageEvaluation;

export function formatCoverageSummary(evaluation: CoverageEvaluation): string;
