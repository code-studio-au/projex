import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

import { parseCompanyDashboardSearch } from './-routeSearchValidation';

export const Route = createFileRoute('/_authed/c/$companyId/')({
  validateSearch: parseCompanyDashboardSearch,
  component: lazyRouteComponent(() => import('../pages/CompanyDashboardPage')),
  ssr: true,
});
