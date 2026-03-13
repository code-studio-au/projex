import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router';
import { getPostLoginTarget } from './-postLogin';
import { sessionQueryOptions } from '../queries/session';
import { shouldSkipSsrAuthGuard } from './-authMode';

export const Route = createFileRoute('/login')({
  component: lazyRouteComponent(() => import('../pages/LoginPage')),
  beforeLoad: async ({ context }) => {
    if (shouldSkipSsrAuthGuard()) return;
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.api)
    );
    if (!session) return;
    const target = await getPostLoginTarget(context.api, session.userId);
    throw redirect(target);
  },
});
