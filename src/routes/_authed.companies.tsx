import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';

export const Route = createFileRoute('/_authed/companies')({
  component: lazyRouteComponent(() => import('../pages/LandingPage')),
  ssr: isServerAuthMode,
});
