import { ProjexSmokePage } from './ProjexSmokePage';
import { test } from './fixtures';

test('generated taxonomy, import-rule, and reversal workflows', async ({
  page,
  smokeFixtures,
}) => {
  await new ProjexSmokePage(page).verifyGeneratedWorkflows(smokeFixtures);
});
