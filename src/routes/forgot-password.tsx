import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/forgot-password')({
  component: lazyRouteComponent(() => import('../pages/ForgotPasswordPage')),
});
