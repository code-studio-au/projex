import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/verify-email-change')({
  component: lazyRouteComponent(() => import('../pages/VerifyEmailChangePage')),
});
