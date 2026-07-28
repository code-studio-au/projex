import { access, readFile } from 'node:fs/promises';
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

  test('project workspace delegates URL synchronization', async () => {
    const source = await readFile(
      path.resolve('src/components/ProjectWorkspace.tsx'),
      'utf8'
    );

    expect(source).toContain('useProjectWorkspaceUrlSync');
    expect(source).not.toContain('nextUrlSyncShouldReplaceRef');
    expect(source).not.toContain('normalizedCurrentSearch');
  });

  test('company settings delegates export workflow coordination', async () => {
    const source = await readFile(
      path.resolve('src/components/CompanySettingsPanel.tsx'),
      'utf8'
    );

    expect(source).toContain('CompanyExportPanel');
    expect(source).not.toContain('EXPORT_JOB_POLL_INTERVAL_MS');
    expect(source).not.toContain('handleStartExport');
  });

  test('taxonomy management delegates destructive action workflows', async () => {
    const source = await readFile(
      path.resolve('src/components/TaxonomyManagerModal.tsx'),
      'utf8'
    );

    expect(source).toContain('TaxonomyActionDialogs');
    expect(source).not.toContain('useProjectAutoCodingRulesQuery');
    expect(source).not.toContain('useBulkRecodeProjectTransactionsMutation');
  });

  test('taxonomy CRUD delegates company-default promotion', async () => {
    const projectServers = await readFile(
      path.resolve('src/server/fns/taxonomy/projectServers.ts'),
      'utf8'
    );
    const projectCrud = await readFile(
      path.resolve('src/server/fns/taxonomy/projectCrud.ts'),
      'utf8'
    );

    expect(projectServers).toContain("from './projectPromotion'");
    expect(projectCrud).not.toContain('syncCompanyDefaultTaxonomyChange');
  });

  test('reversal coordination delegates match decisions and shared state', async () => {
    const workflow = await readFile(
      path.resolve('src/server/fns/transactions/reversalWorkflowServers.ts'),
      'utf8'
    );
    const bulkWorkflow = await readFile(
      path.resolve('src/server/fns/transactions/reversalBulkServers.ts'),
      'utf8'
    );

    expect(workflow).toContain('rejectSuggestedTxnReversalMatch');
    expect(workflow).toContain('unmatchTxnReversal');
    expect(workflow).not.toContain('txn_reversal_match_rejections');
    expect(bulkWorkflow).toContain("from './reversalMatchDecisionServers'");
  });

  test('browser workflows stay isolated behind focused Playwright page objects', async () => {
    const config = await readFile(path.resolve('playwright.config.ts'), 'utf8');
    const specToPageObject = {
      'application-shell.spec.ts': 'ApplicationShellPage',
      'reversal-workflow.spec.ts': 'ReversalWorkflowPage',
      'rule-suggestion-workflow.spec.ts': 'RuleSuggestionWorkflowPage',
      'taxonomy-workflow.spec.ts': 'TaxonomyWorkflowPage',
    };

    for (const [spec, pageObject] of Object.entries(specToPageObject)) {
      const source = await readFile(
        path.resolve('tests/browser', spec),
        'utf8'
      );
      expect(source).toContain(pageObject);
    }
    await expect(
      access(path.resolve('src/server/smoke/browser.ts'))
    ).rejects.toThrow();
    expect(config).toContain("globalSetup: './tests/browser/globalSetup.ts'");
    expect(config).toContain('fullyParallel: true');
    expect(config).toContain('workers: 2');
  });
});
