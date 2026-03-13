import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthedLayout } from '../layouts';
import { sessionQueryOptions } from '../queries/session';
import { isServerAuthMode, shouldSkipSsrAuthGuard } from './-authMode';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
  ssr: isServerAuthMode,
  beforeLoad: async ({ context }) => {
    if (shouldSkipSsrAuthGuard()) return;
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.api)
    );
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
});
