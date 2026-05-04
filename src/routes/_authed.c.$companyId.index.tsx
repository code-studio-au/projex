import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';

export const Route = createFileRoute('/_authed/c/$companyId/')({
  component: lazyRouteComponent(() => import('../pages/CompanyDashboardPage')),
  ssr: isServerAuthMode,
});
