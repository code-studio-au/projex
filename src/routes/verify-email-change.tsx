import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

import { parseVerifyEmailChangeSearch } from './-routeSearchValidation';

export const Route = createFileRoute('/verify-email-change')({
  validateSearch: parseVerifyEmailChangeSearch,
  component: lazyRouteComponent(() => import('../pages/VerifyEmailChangePage')),
});
