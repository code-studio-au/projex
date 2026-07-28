import { test } from './fixtures';
import { TaxonomyWorkflowPage } from './pages/TaxonomyWorkflowPage';

test('moves and deletes taxonomy while preserving rule targets', async ({
  page,
  smokeFixtures,
}) => {
  await new TaxonomyWorkflowPage(page, smokeFixtures, {
    onStatus(message) {
      console.info(`[..] ${message}`);
    },
  }).verify();
});
