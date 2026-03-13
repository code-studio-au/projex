import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';

export const Route = createFileRoute('/_authed/c/$companyId/p/$projectId')({
  component: lazyRouteComponent(() => import('../pages/ProjectWorkspacePage')),
  ssr: isServerAuthMode,
});
