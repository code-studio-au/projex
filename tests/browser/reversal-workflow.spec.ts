import { test } from './fixtures';
import { ReversalWorkflowPage } from './pages/ReversalWorkflowPage';

test('reviews and approves generated reversal pairs', async ({
  page,
  smokeFixtures,
}) => {
  await new ReversalWorkflowPage(page, smokeFixtures, {
    onStatus(message) {
      console.info(`[..] ${message}`);
    },
  }).verify();
});
