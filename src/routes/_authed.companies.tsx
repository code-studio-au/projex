import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';
import { allCompanyMembershipsQueryOptions } from '../queries/memberships';
import { sessionQueryOptions } from '../queries/session';
import type { UserId } from '../types';

export const Route = createFileRoute('/_authed/companies')({
  component: lazyRouteComponent(() => import('../pages/LandingPage')),
  ssr: isServerAuthMode,
  loader: async ({ context }) => {
    const session = (
      context.queryClient.getQueryData(sessionQueryOptions().queryKey) ??
      (await context.queryClient.ensureQueryData(sessionQueryOptions()))
    ) as { userId: UserId } | null;
    if (!session?.userId) return null;

    await context.queryClient.ensureQueryData(
      allCompanyMembershipsQueryOptions(session.userId)
    );

    return null;
  },
});
