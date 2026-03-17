import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthedLayout } from '../layouts';
import { isServerAuthMode, shouldSkipSsrAuthGuard } from './-authMode';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
  ssr: isServerAuthMode,
  beforeLoad: async ({ context }) => {
    if (shouldSkipSsrAuthGuard()) return;
    const session = await context.api.getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
});
