import { ProjexSmokePage } from './ProjexSmokePage';
import { test } from './fixtures';

test('server rendering, hydration, navigation, and protected tabs', async ({
  page,
  smokeFixtures,
}) => {
  void smokeFixtures;
  await new ProjexSmokePage(page).verifyApplicationShell();
});
