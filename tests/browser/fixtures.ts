import { test as base } from '@playwright/test';

import {
  cleanupSmokeFixtures,
  createSmokeFixtures,
  type SmokeFixtures,
} from '../../src/server/smoke/fixtures';

type SmokeTestFixtures = {
  smokeFixtures: SmokeFixtures;
};

export const test = base.extend<SmokeTestFixtures>({
  smokeFixtures: async ({ browserName }, use) => {
    void browserName;
    const fixtures = await createSmokeFixtures({
      onStatus(message) {
        console.info(`[..] ${message}`);
      },
    });

    try {
      await use(fixtures);
    } finally {
      await cleanupSmokeFixtures(fixtures, {
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
    }
  },
});
