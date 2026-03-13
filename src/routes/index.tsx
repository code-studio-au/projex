import { createFileRoute, redirect } from '@tanstack/react-router';

import { getPostLoginTarget } from './-postLogin';
import { sessionQueryOptions } from '../queries/session';
import { shouldSkipSsrAuthGuard } from './-authMode';

function HomeRedirect() {
  return null;
}

export const Route = createFileRoute('/')({
  component: HomeRedirect,
  beforeLoad: async ({ context }) => {
    if (shouldSkipSsrAuthGuard()) return;
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.api)
    );
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const target = await getPostLoginTarget(context.api, session.userId);
    throw redirect(target);
  },
});
