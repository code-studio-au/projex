import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/c/$companyId/p/$projectId')({
  component: lazyRouteComponent(() => import('../pages/ProjectWorkspacePage')),
});
