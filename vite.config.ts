import { resolve as pathResolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

const dayjsPluginIds = [
  'advancedFormat',
  'customParseFormat',
  'isoWeek',
  'localeData',
  'localizedFormat',
  'timezone',
  'utc',
  'weekday',
  'weekOfYear',
  'weekYear',
] as const;

const macOsServeOptimizerIncludes = [
  // Transitive runtime packages that need explicit CJS interop when
  // discovery-based optimization is disabled.
  'dayjs',
  ...dayjsPluginIds.flatMap((pluginId) => [
    `dayjs/plugin/${pluginId}`,
    `dayjs/plugin/${pluginId}.js`,
  ]),
  'prop-types',
  'react-is',
];

function shouldUseExplicitMacOsServeOptimizer() {
  return process.platform === 'darwin';
}

function createMacOsServeOptimizerAlias() {
  return [
    {
      find: /^dayjs\/plugin\/(.+?)(?:\.js)?$/,
      replacement: pathResolve(
        process.cwd(),
        'node_modules/.pnpm/node_modules/dayjs/plugin/$1.js'
      ),
    },
    {
      find: /^dayjs\/locale\/(.+?)(?:\.js)?$/,
      replacement: pathResolve(
        process.cwd(),
        'node_modules/.pnpm/node_modules/dayjs/locale/$1.js'
      ),
    },
    {
      find: 'dayjs',
      replacement: pathResolve(
        process.cwd(),
        'node_modules/.pnpm/node_modules/dayjs'
      ),
    },
    {
      find: 'prop-types',
      replacement: pathResolve(
        process.cwd(),
        'node_modules/.pnpm/node_modules/prop-types/index.js'
      ),
    },
    {
      find: 'react-is',
      replacement: pathResolve(
        process.cwd(),
        'node_modules/.pnpm/node_modules/react-is/index.js'
      ),
    },
  ];
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const useExplicitMacOsServeOptimizer =
    command === 'serve' && shouldUseExplicitMacOsServeOptimizer();

  return {
    plugins: [tanstackStart(), react()],
    test: {
      environment: 'node',
      include: [
        'tests/**/*.test.ts',
        'tests/**/*.test.tsx',
        'deploy/cdk/tests/**/*.test.ts',
      ],
      exclude: ['tests/dbIntegration*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        reportsDirectory: './coverage',
        // This deliberately reports selected domain coverage, not whole-repo
        // coverage. Keep the public label aligned when this allowlist changes.
        include: [
          'src/server/env.ts',
          'src/server/http/security.ts',
          'src/server/fns/resourceGuards.ts',
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
          'src/validation/**/*.ts',
        ],
        thresholds: {
          lines: 80,
          functions: 85,
          statements: 80,
          branches: 65,
        },
      },
    },
    resolve: {
      alias: useExplicitMacOsServeOptimizer
        ? createMacOsServeOptimizerAlias()
        : undefined,
      tsconfigPaths: true,
    },
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }

            return undefined;
          },
        },
      },
    },
    optimizeDeps:
      command === 'serve'
        ? {
            // Rolldown's scan-based dep optimizer currently trips over macOS
            // watcher-native transitive deps like fsevents. On macOS, switch dev
            // to an explicit prebundle allowlist instead of discovery so startup
            // stays deterministic without pulling native watcher binaries into
            // the browser dep graph.
            noDiscovery: useExplicitMacOsServeOptimizer,
            include: useExplicitMacOsServeOptimizer
              ? macOsServeOptimizerIncludes
              : undefined,
            exclude: [
              'fsevents',
              'chokidar',
              '@tanstack/react-start',
              '@tanstack/react-start/client',
              '@tanstack/react-start/server',
              '@tanstack/react-start-client',
              '@tanstack/react-start-server',
              '@tanstack/start-client-core',
              '@tanstack/start-server-core',
            ],
          }
        : undefined,
  };
});
