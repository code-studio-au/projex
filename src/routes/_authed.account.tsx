import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

import type { UserId } from '../types';

export const Route = createFileRoute('/_authed/account')({
  component: lazyRouteComponent(() => import('../pages/AccountPage')),
  ssr: true,
  loader: async ({ context }) => {
    const [
      { currentUserQueryOptions, pendingEmailChangeQueryOptions },
      { sessionQueryOptions },
    ] = await Promise.all([
      import('../queries/account'),
      import('../queries/session'),
    ]);
    const session = (context.queryClient.getQueryData(
      sessionQueryOptions().queryKey
    ) ??
      (await context.queryClient.ensureQueryData(sessionQueryOptions()))) as {
      userId: UserId;
    } | null;
    if (!session?.userId) return null;

    const [currentUser, pendingEmailChange] = await Promise.all([
      context.queryClient.ensureQueryData(
        currentUserQueryOptions(session.userId)
      ),
      context.queryClient.ensureQueryData(
        pendingEmailChangeQueryOptions(session.userId)
      ),
    ]);

    return {
      currentUser,
      pendingEmailChange,
    };
  },
});
