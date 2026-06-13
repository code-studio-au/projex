import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

import { isServerAuthMode } from './-authMode';
import type { UserId } from '../types';
import {
  currentUserQueryOptions,
  pendingEmailChangeQueryOptions,
} from '../queries/account';
import { sessionQueryOptions } from '../queries/session';

export const Route = createFileRoute('/_authed/account')({
  component: lazyRouteComponent(() => import('../pages/AccountPage')),
  ssr: isServerAuthMode,
  loader: async ({ context }) => {
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
