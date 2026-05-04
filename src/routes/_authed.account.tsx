import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

import { isServerAuthMode } from './-authMode';

export const Route = createFileRoute('/_authed/account')({
  component: lazyRouteComponent(() => import('../pages/AccountPage')),
  ssr: isServerAuthMode,
});
