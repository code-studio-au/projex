import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthedLayout } from '../layouts';
import { isServerAuthMode, shouldBypassSsrAuthGuardForLocalMode } from './-authMode';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
  ssr: isServerAuthMode,
  beforeLoad: async ({ context }) => {
    if (shouldBypassSsrAuthGuardForLocalMode()) return;
    const session = await context.api.getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
});
