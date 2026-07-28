import { test } from './fixtures';
import { RuleSuggestionWorkflowPage } from './pages/RuleSuggestionWorkflowPage';

test('accepts a refined rule suggestion with the corrected target', async ({
  page,
  smokeFixtures,
}) => {
  await new RuleSuggestionWorkflowPage(page, smokeFixtures, {
    onStatus(message) {
      console.info(`[..] ${message}`);
    },
  }).verify();
});
