import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

import { parseResetPasswordSearch } from './-routeSearchValidation';

export const Route = createFileRoute('/reset-password')({
  validateSearch: parseResetPasswordSearch,
  component: lazyRouteComponent(() => import('../pages/ResetPasswordPage')),
});
