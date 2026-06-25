import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [tanstackStart(), react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/dbIntegration*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
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
    tsconfigPaths: true,
  },
  build: {
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

          if (
            id.includes('node_modules/@mantine/') ||
            id.includes('node_modules/@emotion/')
          ) {
            return 'vendor-ui';
          }

          if (id.includes('node_modules/@tabler/')) {
            return 'vendor-icons';
          }

          return undefined;
        },
      },
    },
  },
  optimizeDeps:
    command === 'serve'
      ? {
          exclude: [
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
}));
