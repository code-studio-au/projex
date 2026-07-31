const selectedDomainFiles = new Set([
  'src/server/env.ts',
  'src/server/http/security.ts',
  'src/server/fns/resourceGuards.ts',
  'src/hooks/usePowerBiImportWorkflow.ts',
  'src/store/uiPrefs.ts',
  'src/utils/auth.ts',
  'src/utils/commentMentions.ts',
  'src/utils/companySummary.ts',
  'src/utils/csv.ts',
  'src/utils/dateTime.ts',
  'src/utils/importPreview.ts',
  'src/utils/importReviewPlan.ts',
  'src/utils/importRuleSuggestions.ts',
  'src/utils/json.ts',
  'src/utils/powerBiImport.ts',
  'src/utils/projectAutoCodingRules.ts',
  'src/utils/textRuleMatching.ts',
  'src/utils/transactionCommitPlan.ts',
  'src/utils/transactionSplitPlan.ts',
  'src/utils/transactionTransferPlan.ts',
  'src/utils/transactionWorkflow.ts',
]);

export const selectedDomainThresholds = Object.freeze({
  lines: 80,
  functions: 85,
  statements: 80,
  branches: 65,
});

const coverageMetrics = ['lines', 'functions', 'statements', 'branches'];

function normalizeCoveragePath(filePath, workspaceRoot) {
  const normalized = filePath.replaceAll('\\', '/');
  const normalizedRoot = workspaceRoot.replaceAll('\\', '/').replace(/\/$/, '');
  return normalized.startsWith(`${normalizedRoot}/`)
    ? normalized.slice(normalizedRoot.length + 1)
    : normalized;
}

export function isSelectedDomainFile(filePath, workspaceRoot = process.cwd()) {
  const relativePath = normalizeCoveragePath(filePath, workspaceRoot);
  return (
    selectedDomainFiles.has(relativePath) ||
    (relativePath.startsWith('src/validation/') && relativePath.endsWith('.ts'))
  );
}

function emptyMetric() {
  return { covered: 0, total: 0, pct: 100 };
}

function aggregateCoverage(entries) {
  const aggregate = Object.fromEntries(
    coverageMetrics.map((metric) => [metric, emptyMetric()])
  );

  for (const entry of entries) {
    for (const metric of coverageMetrics) {
      aggregate[metric].covered += entry[metric].covered;
      aggregate[metric].total += entry[metric].total;
    }
  }

  for (const metric of coverageMetrics) {
    const value = aggregate[metric];
    value.pct =
      value.total === 0
        ? 100
        : Number(((value.covered / value.total) * 100).toFixed(2));
  }

  return aggregate;
}

export function evaluateCoverageSummary(
  summary,
  workspaceRoot = process.cwd()
) {
  const selectedEntries = Object.entries(summary)
    .filter(
      ([filePath, entry]) =>
        filePath !== 'total' &&
        entry &&
        isSelectedDomainFile(filePath, workspaceRoot)
    )
    .map(([, entry]) => entry);

  if (selectedEntries.length === 0) {
    throw new Error(
      'Coverage report did not contain any selected-domain files.'
    );
  }

  const selected = aggregateCoverage(selectedEntries);
  const failures = coverageMetrics.filter(
    (metric) => selected[metric].pct < selectedDomainThresholds[metric]
  );

  return {
    application: summary.total,
    failures,
    selected,
    selectedFileCount: selectedEntries.length,
  };
}

function percentage(metric) {
  return `${Number(metric.pct).toFixed(2)}%`;
}

export function formatCoverageSummary({
  application,
  failures,
  selected,
  selectedFileCount,
}) {
  const lines = [
    '## Application coverage',
    '',
    '| Scope | Files | Statements | Branches | Functions | Lines |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| Whole application (informational) | — | ${percentage(application.statements)} | ${percentage(application.branches)} | ${percentage(application.functions)} | ${percentage(application.lines)} |`,
    `| Selected risk domain (enforced) | ${selectedFileCount} | ${percentage(selected.statements)} | ${percentage(selected.branches)} | ${percentage(selected.functions)} | ${percentage(selected.lines)} |`,
    '',
  ];

  if (failures.length > 0) {
    lines.push(
      `Selected-domain thresholds failed for: ${failures.join(', ')}.`,
      ''
    );
  }

  return lines.join('\n');
}
