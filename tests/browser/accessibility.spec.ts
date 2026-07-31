import { test } from './fixtures';
import { AccessibilityPage } from './pages/AccessibilityPage';

test('login and authenticated application shell meet automated WCAG A/AA checks', async ({
  page,
  smokeFixtures,
}) => {
  await new AccessibilityPage(page, smokeFixtures).verify();
});
