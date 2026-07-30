import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import type { UserId } from '../types';
import type { RouterContext } from '../router-context';

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
    return { isSuperadmin: false, userId: null, userCompanyCount: 0 };
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
  const userCompanyCount = new Set(
    (companyMemberships ?? []).flatMap((membership) =>
      membership.userId === session.userId ? [membership.companyId] : []
    )
  ).size;

  return {
    isSuperadmin: currentUser.isGlobalSuperadmin === true,
    userId: session.userId,
    userCompanyCount,
    companies,
  };
}

export const Route = createFileRoute('/_authed/companies')({
  component: lazyRouteComponent(() => import('../pages/LandingPage')),
  ssr: true,
  loader: ({ context }) => loadCompaniesRouteData(context),
});
