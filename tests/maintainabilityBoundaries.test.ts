import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

describe('maintainability boundaries', () => {
  test('taxonomy standards imports auto-coding sync directly', async () => {
    const source = await readFile(
      path.resolve('src/server/fns/taxonomy/standards.ts'),
      'utf8'
    );

    expect(source).toContain("from '../projectAutoCodingRules/sync'");
    expect(source).not.toMatch(/from ['"]\.\.\/projectAutoCodingRules['"]/);
  });

  test('the complete CI script delegates shared app checks only once', async () => {
    const packageJson = JSON.parse(
      await readFile(path.resolve('package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    const verifyCi = packageJson.scripts['verify:ci'];

    expect(verifyCi).toMatch(/^pnpm run verify:app &&/);
    expect(verifyCi).not.toContain('verify:security:repo');
    expect(verifyCi).not.toContain('pnpm audit');
  });

  test('PowerBI import coordination delegates preview tables and columns', async () => {
    const source = await readFile(
      path.resolve('src/components/PowerBiImporterPanel.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/MantineReactTable|MRT_ColumnDef/);
    expect(source).toContain('ImportPreviewTabs');
    expect(source).toContain('useImportPreviewColumns');
  });

  test('budget coordination delegates summary presentation and editing', async () => {
    const source = await readFile(
      path.resolve('src/components/BudgetPanel.tsx'),
      'utf8'
    );

    expect(source).toContain('ProjectBudgetSummary');
    expect(source).not.toContain('calculateBudgetPosition');
    expect(source).not.toContain('isEditingProjectBudget');
  });
});
