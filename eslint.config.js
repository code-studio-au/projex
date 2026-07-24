import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const appServerImportRestriction = {
  regex: String.raw`^(\.\./)+server/(?!start/functions(?:/|$)).+`,
  message:
    'App-compilable code must cross into server code only through src/api/** contracts or src/server/start/functions/**.',
};

const apiRouteServerImportRestriction = {
  regex: String.raw`^(\.\./)+server/`,
  message:
    'API route files must stay transport-only. Use src/routes/-api-shared.ts and dynamically load src/server/routes/** adapters instead of importing server infrastructure directly.',
};

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.scaffold/**', 'deploy/cdk/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', name: 'test', package: 'node:test' },
          ],
        },
      ],
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/server/**',
      'src/routes/api*.ts',
      'src/routes/-api-shared.ts',
    ],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [appServerImportRestriction],
        },
      ],
    },
  },
  {
    files: ['src/routes/api*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [apiRouteServerImportRestriction],
        },
      ],
    },
  },
  {
    files: ['src/routes/-api-shared.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: [
      'src/server/**/*.{ts,tsx}',
      'scripts/**/*.{ts,mjs}',
      'tests/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
]);
