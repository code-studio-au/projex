import { defineConfig, devices } from '@playwright/test';

const browserName = process.env.PROJEX_SMOKE_BROWSER?.trim() || 'chromium';
if (
  browserName !== 'chromium' &&
  browserName !== 'firefox' &&
  browserName !== 'webkit'
) {
  throw new Error(
    `Unsupported PROJEX_SMOKE_BROWSER "${browserName}". Use chromium, firefox, or webkit.`
  );
}

function resolveWorkerCount(): number {
  const configured = process.env.PROJEX_SMOKE_BROWSER_WORKERS?.trim();
  if (!configured) return process.env.CI ? 4 : 2;

  const workers = Number.parseInt(configured, 10);
  if (!Number.isSafeInteger(workers) || workers < 1) {
    throw new Error('PROJEX_SMOKE_BROWSER_WORKERS must be a positive integer.');
  }
  return workers;
}

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/globalSetup.ts',
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  workers: resolveWorkerCount(),
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.GITHUB_ACTIONS
    ? [['line'], ['github']]
    : [
        ['list'],
        [
          'html',
          { open: 'never', outputFolder: `playwright-report/${browserName}` },
        ],
      ],
  outputDir: `test-results/playwright-${browserName}`,
  use: {
    baseURL: process.env.PROJEX_SMOKE_BASE_URL,
    colorScheme: 'light',
    extraHTTPHeaders: { 'x-real-ip': '127.0.0.1' },
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: browserName,
      use: {
        ...(browserName === 'firefox'
          ? devices['Desktop Firefox']
          : browserName === 'webkit'
            ? devices['Desktop Safari']
            : devices['Desktop Chrome']),
        browserName,
      },
    },
  ],
});
