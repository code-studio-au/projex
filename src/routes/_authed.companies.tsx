import {
  createFileRoute,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import type { CompanyMembership, UserId } from '../types';
import type { RouterContext } from '../router-context';
import { getSingleCompanyRedirectId } from './-companiesRouteModel';

async function loadCompaniesRouteData(context: RouterContext) {
  const [
    { allCompanyMembershipsQueryOptions },
    { currentUserQueryOptions },
    { companiesQueryOptions },
    { sessionQueryOptions },
  ] = await Promise.all([
    import('../queries/memberships'),
    import('../queries/account'),
    import('../queries/reference'),
    import('../queries/session'),
  ]);
  const session = (context.queryClient.getQueryData(
    sessionQueryOptions().queryKey
  ) ?? (await context.queryClient.ensureQueryData(sessionQueryOptions()))) as {
    userId: UserId;
  } | null;
  if (!session?.userId) {
    return { isSuperadmin: false, userId: null, companies: [] };
  }

  const [companyMemberships, companies, currentUser] = await Promise.all([
    context.queryClient.ensureQueryData(
      allCompanyMembershipsQueryOptions(session.userId)
    ),
    context.queryClient.ensureQueryData(companiesQueryOptions(session.userId)),
    context.queryClient.ensureQueryData(
      currentUserQueryOptions(session.userId)
    ),
  ]);
  const isSuperadmin = currentUser.isGlobalSuperadmin === true;
  const redirectCompanyId = getSingleCompanyRedirectId({
    userId: session.userId,
    isSuperadmin,
    memberships: (companyMemberships ?? []) as CompanyMembership[],
  });
  if (redirectCompanyId) {
    throw redirect({
      to: '/c/$companyId',
      params: { companyId: redirectCompanyId },
    });
  }

  return {
    isSuperadmin,
    userId: session.userId,
    companies,
  };
}

export const Route = createFileRoute('/_authed/companies')({
  component: lazyRouteComponent(() => import('../pages/LandingPage')),
  ssr: true,
  loader: ({ context }) => loadCompaniesRouteData(context),
});
