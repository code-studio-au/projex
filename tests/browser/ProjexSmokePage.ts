import type { Page } from '@playwright/test';

import { runBrowserSmoke } from '../../src/server/smoke/browser';
import { getSmokeConfiguredBaseUrl } from '../../src/server/smoke/env';
import type { SmokeFixtures } from '../../src/server/smoke/fixtures';

export class ProjexSmokePage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  verifyApplicationShell() {
    return this.run();
  }

  verifyGeneratedWorkflows(fixtures: SmokeFixtures) {
    return this.run(fixtures);
  }

  private run(generatedFixtures?: SmokeFixtures) {
    return runBrowserSmoke(this.page, getSmokeConfiguredBaseUrl(), {
      generatedFixtures,
      onStatus(message) {
        console.info(`[..] ${message}`);
      },
    });
  }
}
