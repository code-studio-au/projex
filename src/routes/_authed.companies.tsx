import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import type { UserId } from '../types';

export const Route = createFileRoute('/_authed/companies')({
  component: lazyRouteComponent(() => import('../pages/LandingPage')),
  ssr: true,
  loader: async ({ context }) => {
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
    ) ??
      (await context.queryClient.ensureQueryData(sessionQueryOptions()))) as {
      userId: UserId;
    } | null;
    if (!session?.userId)
      return { isSuperadmin: false, userId: null, userCompanyCount: 0 };

    const companyMemberships = await context.queryClient.ensureQueryData(
      allCompanyMembershipsQueryOptions(session.userId)
    );
    const companies = await context.queryClient.ensureQueryData(
      companiesQueryOptions(session.userId)
    );
    const currentUser = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(session.userId)
    );
    const userCompanyCount = new Set(
      (companyMemberships ?? [])
        .filter((membership) => membership.userId === session.userId)
        .map((membership) => membership.companyId)
    ).size;

    return {
      isSuperadmin: currentUser.isGlobalSuperadmin === true,
      userId: session.userId,
      userCompanyCount,
      companies,
    };
  },
});
