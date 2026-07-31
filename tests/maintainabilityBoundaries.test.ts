import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const componentDecompositionBoundaries = [
  {
    sourcePath: 'src/components/AutoCodingRulesEditorModal.tsx',
    controller: 'useAutoCodingRulesEditorModalController',
    views: [
      'AutoCodingRuleComposer',
      'AutoCodingRulesList',
      'EditAutoCodingRuleModal',
      'DeleteAutoCodingRuleModal',
    ],
  },
  {
    sourcePath: 'src/components/BudgetPanel.tsx',
    controller: 'useBudgetPanelController',
    views: ['BudgetPanelView'],
  },
  {
    sourcePath: 'src/components/CompanyDefaultTaxonomyModal.tsx',
    controller: 'useCompanyDefaultTaxonomyModalController',
    views: [
      'CompanyDefaultTaxonomyComposer',
      'CompanyDefaultTaxonomyList',
      'MoveCompanyDefaultTaxonomyModal',
      'DeleteCompanyDefaultTaxonomyModal',
    ],
  },
  {
    sourcePath: 'src/components/CompanySettingsPanel.tsx',
    controller: 'useCompanySettingsPanelController',
    views: [
      'CompanyDetailsSettingsCard',
      'CompanyMembershipSettingsCard',
      'CompanyOperationsSettingsCard',
    ],
  },
  {
    sourcePath: 'src/components/CompanySummaryPanel.tsx',
    controller: 'useCompanySummaryPanelController',
    views: ['CompanySummaryPanelView'],
  },
  {
    sourcePath: 'src/components/ImportRulesEditorModal.tsx',
    controller: 'useImportRulesEditorModalController',
    views: [
      'ImportRuleComposer',
      'ImportRulesList',
      'EditImportRuleModal',
      'DeleteImportRuleModal',
    ],
  },
  {
    sourcePath: 'src/components/PowerBiImporterPanel.tsx',
    controller: 'usePowerBiImporterPanelController',
    views: [
      'PowerBiUploadCard',
      'PowerBiImportPreview',
      'PowerBiExclusionRuleModal',
      'PowerBiReviewDecisionModal',
    ],
  },
  {
    sourcePath: 'src/components/ProjectSettingsPanel.tsx',
    controller: 'useProjectSettingsPanelController',
    views: [
      'ProjectStructureSettingsCard',
      'ProjectMembershipSettingsCard',
      'ProjectBudgetSettingsCard',
      'ProjectTaxonomySettingsCard',
    ],
  },
  {
    sourcePath: 'src/components/ProjectWorkspace.tsx',
    controller: 'useProjectWorkspaceController',
    views: ['ProgrammeProjectWorkspaceView', 'OperationalProjectWorkspaceView'],
  },
  {
    sourcePath: 'src/components/RuleSuggestionsModal.tsx',
    controller: 'useRuleSuggestionsModalController',
    views: [
      'RuleSuggestionsContent',
      'RuleSuggestionCard',
      'RuleSuggestionEvidence',
    ],
  },
  {
    sourcePath: 'src/components/TaxonomyManagerModal.tsx',
    controller: 'useTaxonomyManagerModalController',
    views: [
      'TaxonomyComposer',
      'TaxonomyCategoryItem',
      'TaxonomySubCategoryRow',
    ],
  },
  {
    sourcePath: 'src/components/TransactionCommentsModal.tsx',
    controller: 'useTransactionCommentsModalController',
    views: ['TransactionCommentsModalView'],
  },
  {
    sourcePath: 'src/components/TransactionsPanel.tsx',
    controller: 'useTransactionsPanelController',
    views: [
      'TransactionsOverviewSection',
      'TransactionsTableSection',
      'TransactionsModalSection',
    ],
  },
  {
    sourcePath: 'src/components/companySettings/CompanyExportPanel.tsx',
    controller: 'useCompanyExportPanelController',
    views: ['CompanyExportPanelView'],
  },
  {
    sourcePath: 'src/components/taxonomyManager/TaxonomyActionDialogs.tsx',
    controller: 'useTaxonomyActionDialogsController',
    views: [
      'MoveTaxonomyDialog',
      'BulkRecodeTaxonomyDialog',
      'DeleteTaxonomyDialog',
    ],
  },
  {
    sourcePath: 'src/components/transactions/TransactionReversalModal.tsx',
    controller: 'useTransactionReversalModalController',
    views: [
      'ReversalPairSummary',
      'PendingReversalActions',
      'SuggestedReversalActions',
      'ExceptionReversalActions',
      'MatchedReversalActions',
    ],
  },
  {
    sourcePath: 'src/components/transactions/TransactionsOverviewCard.tsx',
    controller: 'useTransactionsOverviewCardController',
    views: ['TransactionsOverviewCardView'],
  },
  {
    sourcePath: 'src/pages/AccountPage.tsx',
    controller: 'useAccountPageController',
    views: ['AccountPageView'],
  },
  {
    sourcePath: 'src/pages/CompanyDashboardPage.tsx',
    controller: 'useCompanyDashboardPageController',
    views: [
      'CompanyDashboardHeader',
      'CompanyDashboardTabs',
      'ProjectLifecycleConfirmModal',
    ],
  },
  {
    sourcePath: 'src/pages/LandingPage.tsx',
    controller: 'useLandingPageController',
    views: ['LandingPageView'],
  },
  {
    sourcePath: 'src/pages/SmokeDashboardPage.tsx',
    controller: 'useSmokeDashboardController',
    views: [
      'SmokeDashboardControls',
      'SmokeDashboardRunFocus',
      'SmokeDashboardSectionGrid',
    ],
  },
] as const;

describe('maintainability boundaries', () => {
  test.each(componentDecompositionBoundaries)(
    '$sourcePath keeps orchestration separate from focused views',
    async ({ sourcePath, controller, views }) => {
      const source = await readFile(path.resolve(sourcePath), 'utf8');

      expect(source).toContain(`function ${controller}`);
      for (const view of views) {
        expect(source).toContain(`function ${view}`);
      }
    }
  );

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
    expect(verifyCi).toContain('verify:smoke:browser:webkit:full:skip-build');
  });

  test('GitHub CI parallelizes application verification behind its stable gate', async () => {
    const [packageManifestText, ciWorkflow, coverageRunner, viteConfig] =
      await Promise.all([
        readFile(path.resolve('package.json'), 'utf8'),
        readFile(path.resolve('.github/workflows/ci.yml'), 'utf8'),
        readFile(
          path.resolve('scripts/run-selected-domain-coverage.mjs'),
          'utf8'
        ),
        readFile(path.resolve('vite.config.ts'), 'utf8'),
      ]);

    for (const lane of ['static', 'types', 'tests', 'build']) {
      expect(packageManifestText).toContain(`"verify:app:${lane}"`);
      expect(ciWorkflow).toContain(`verify-${lane}:`);
      expect(ciWorkflow).toContain(`- verify-${lane}`);
    }
    expect(ciWorkflow).toContain('verify:\n    name: verify\n    if: always()');
    expect(ciWorkflow).toContain('node scripts/run-ci-summary.mjs');
    expect(ciWorkflow).not.toMatch(/reporter.?=.?junit|reporter.?=.?json/i);
    expect(coverageRunner).toContain("'run', 'tests', '--coverage'");
    expect(viteConfig).toContain("include: ['src/**/*.{ts,tsx}']");
    expect(viteConfig).toContain("['default', 'github-actions']");
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
    const [
      config,
      packageManifestText,
      smokeRunner,
      browserLauncher,
      ciWorkflow,
    ] = await Promise.all([
      readFile(path.resolve('playwright.config.ts'), 'utf8'),
      readFile(path.resolve('package.json'), 'utf8'),
      readFile(path.resolve('scripts/run-smoke-disposable.mjs'), 'utf8'),
      readFile(path.resolve('scripts/smoke-browser.mjs'), 'utf8'),
      readFile(path.resolve('.github/workflows/ci.yml'), 'utf8'),
    ]);
    const specToPageObject = {
      'accessibility.spec.ts': 'AccessibilityPage',
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
    expect(config).toContain('workers: resolveWorkerCount()');
    expect(config).toContain('process.env.CI ? 4 : 2');
    expect(config).toContain('failOnFlakyTests: Boolean(process.env.CI)');
    expect(config).toContain('forbidOnly: Boolean(process.env.CI)');
    expect(config).toContain("['github']");
    expect(packageManifestText).toContain(
      '"smoke:browser:disposable": "node scripts/run-smoke-disposable.mjs --browser --browser-only"'
    );
    expect(smokeRunner).toContain('if (!BROWSER_ONLY)');
    expect(browserLauncher).toContain('...cliArgs.passthrough');
    expect(ciWorkflow).toContain(
      'browser:\n          - chromium\n          - firefox\n          - webkit'
    );
    expect(ciWorkflow).toContain("if: matrix.browser == 'webkit'");
    expect(ciWorkflow).toContain(
      'run: pnpm exec playwright install --with-deps webkit'
    );
    expect(ciWorkflow).toContain(
      'name: playwright-browser-diagnostics-${{ matrix.browser }}'
    );
    expect(ciWorkflow).toContain('name: smoke-browser-disposable');
    expect(packageManifestText).toContain('"verify:smoke:browser:webkit:full"');
  });

  test('database verification owns one test-server lifecycle and closes short-lived pools', async () => {
    const [
      packageManifestText,
      integrationRunner,
      poolFactory,
      databaseSingleton,
      migrationCommand,
      ciWorkflow,
      releaseWorkflow,
    ] = await Promise.all([
      readFile(path.resolve('package.json'), 'utf8'),
      readFile(path.resolve('scripts/run-db-integration.mjs'), 'utf8'),
      readFile(path.resolve('src/server/db/pgPool.ts'), 'utf8'),
      readFile(path.resolve('src/server/db/db.ts'), 'utf8'),
      readFile(path.resolve('src/server/db/migrate.ts'), 'utf8'),
      readFile(path.resolve('.github/workflows/ci.yml'), 'utf8'),
      readFile(path.resolve('.github/workflows/release.yml'), 'utf8'),
    ]);
    expect(packageManifestText).toContain(
      '"verify:db:gate": "node scripts/run-db-integration.mjs --verify-gate"'
    );
    expect(integrationRunner).toContain('PROJEX_TEST_DB_REUSE_SERVER');
    expect(integrationRunner).toContain(
      "runProjexCommand('pnpm', ['run', 'db:verify-types']"
    );
    expect(poolFactory).toContain('allowExitOnIdle:');
    expect(databaseSingleton).toContain(
      'export async function destroyDb(): Promise<void>'
    );
    expect(migrationCommand).toContain('db.destroy(), destroyDb()');
    expect(ciWorkflow).toContain("PROJEX_TEST_DB_REUSE_SERVER: 'true'");
    expect(releaseWorkflow).toContain("PROJEX_TEST_DB_REUSE_SERVER: 'true'");
  });
});
