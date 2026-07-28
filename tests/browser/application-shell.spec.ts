import { test } from './fixtures';
import { ApplicationShellPage } from './pages/ApplicationShellPage';

test('server rendering, hydration, navigation, and protected tabs', async ({
  page,
  smokeFixtures,
}) => {
  await new ApplicationShellPage(page, smokeFixtures, {
    onStatus(message) {
      console.info(`[..] ${message}`);
    },
  }).verify();
});
