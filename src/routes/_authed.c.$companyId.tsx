import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/c/$companyId')({
  component: lazyRouteComponent(() => import('../pages/CompanyDashboardPage')),
});
