import { createFileRoute } from '@tanstack/react-router';

import SmokeDashboardPage from '../pages/SmokeDashboardPage';
import { isServerAuthMode } from './-authMode';

export const Route = createFileRoute('/_authed/smoke')({
  component: SmokeDashboardPage,
  ssr: isServerAuthMode,
});
