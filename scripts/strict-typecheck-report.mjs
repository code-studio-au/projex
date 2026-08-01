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

export function formatStrictTypecheckSummary(results) {
  const lines = [
    '## Opt-in TypeScript strictness',
    '',
    '`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are reported here without blocking the required TypeScript gate.',
    '',
    '| Project | Diagnostics | Baseline | Change | Files |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];

  for (const result of results) {
    const delta = result.total - result.baseline;
    lines.push(
      `| ${result.label} | ${result.total} | ${result.baseline} | ${delta > 0 ? '+' : ''}${delta} | ${result.fileCount} |`
    );
  }

  lines.push('', '### Most frequent diagnostics', '');
  for (const result of results) {
    const codes = summarizeDiagnosticCodes(result.diagnostics)
      .slice(0, 5)
      .map(([code, count]) => `${code} (${count})`)
      .join(', ');
    lines.push(`- **${result.label}:** ${codes || 'No diagnostics'}`);
  }
  lines.push('');
  return lines.join('\n');
}
