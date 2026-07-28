import { defineConfig, devices } from '@playwright/test';

const browserName = process.env.PROJEX_SMOKE_BROWSER?.trim() || 'chromium';
if (browserName !== 'chromium' && browserName !== 'firefox') {
  throw new Error(
    `Unsupported PROJEX_SMOKE_BROWSER "${browserName}". Use chromium or firefox.`
  );
}

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/globalSetup.ts',
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [
        ['line'],
        [
          'html',
          { open: 'never', outputFolder: `playwright-report/${browserName}` },
        ],
      ]
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
          : devices['Desktop Chrome']),
        browserName,
      },
    },
  ],
});
