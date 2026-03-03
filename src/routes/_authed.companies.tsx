import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/companies')({
  component: lazyRouteComponent(() => import('../pages/LandingPage')),
});
