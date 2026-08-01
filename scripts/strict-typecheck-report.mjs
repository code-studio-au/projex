const DIAGNOSTIC_PATTERN = /^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;

export function parseTypeScriptDiagnostics(output) {
  const diagnostics = Array.from(
    output.matchAll(DIAGNOSTIC_PATTERN),
    (match) => ({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: match[5],
    })
  );
  const total = output.match(/error TS\d+:/g)?.length ?? 0;

  return {
    diagnostics,
    total,
    unmatched: total - diagnostics.length,
  };
}

export function summarizeDiagnosticCodes(diagnostics) {
  const counts = new Map();
  for (const diagnostic of diagnostics) {
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    ([leftCode, leftCount], [rightCode, rightCount]) =>
      rightCount - leftCount || leftCode.localeCompare(rightCode)
  );
}

export function summarizeUniqueDiagnostics(results) {
  const summaries = new Map();
  for (const result of results) {
    const current = summaries.get(result.flagKey) ?? {
      flagKey: result.flagKey,
      flagLabel: result.flagLabel,
      diagnostics: new Map(),
    };
    for (const diagnostic of result.diagnostics) {
      const key = [
        diagnostic.file,
        diagnostic.line,
        diagnostic.column,
        diagnostic.code,
        diagnostic.message,
      ].join(':');
      current.diagnostics.set(key, diagnostic);
    }
    summaries.set(result.flagKey, current);
  }

  return [...summaries.values()].map((summary) => {
    const diagnostics = [...summary.diagnostics.values()];
    return {
      flagKey: summary.flagKey,
      flagLabel: summary.flagLabel,
      total: diagnostics.length,
      production: diagnostics.filter(
        (diagnostic) => !diagnostic.file.startsWith('tests/')
      ).length,
      tests: diagnostics.filter((diagnostic) =>
        diagnostic.file.startsWith('tests/')
      ).length,
      fileCount: new Set(diagnostics.map((diagnostic) => diagnostic.file)).size,
    };
  });
}

export function formatStrictTypecheckSummary(results) {
  const lines = [
    '## TypeScript strictness ratchet',
    '',
    '`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are evaluated independently. Recorded findings are allowed, while any baseline change must be reviewed and committed.',
    '',
    '| Flag | Project | Diagnostics | Baseline | Change | Files |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ];

  for (const result of results) {
    const delta = result.total - result.baseline;
    lines.push(
      `| ${result.flagLabel} | ${result.label} | ${result.total} | ${result.baseline} | ${delta > 0 ? '+' : ''}${delta} | ${result.fileCount} |`
    );
  }

  lines.push(
    '',
    '### Unique findings across overlapping projects',
    '',
    '| Flag | Unique | Production | Test-only | Files |',
    '| --- | ---: | ---: | ---: | ---: |'
  );
  for (const summary of summarizeUniqueDiagnostics(results)) {
    lines.push(
      `| ${summary.flagLabel} | ${summary.total} | ${summary.production} | ${summary.tests} | ${summary.fileCount} |`
    );
  }

  lines.push('', '### Most frequent diagnostics', '');
  for (const result of results) {
    const codes = summarizeDiagnosticCodes(result.diagnostics)
      .slice(0, 5)
      .map(([code, count]) => `${code} (${count})`)
      .join(', ');
    lines.push(
      `- **${result.flagLabel}, ${result.label}:** ${codes || 'No diagnostics'}`
    );
  }
  lines.push('');
  return lines.join('\n');
}
