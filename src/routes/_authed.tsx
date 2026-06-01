import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthedLayout } from '../layouts';
import { getSessionServerFn } from '../server/start/functions/auth';
import { isServerAuthMode } from './-authMode';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
  ssr: isServerAuthMode,
  beforeLoad: async () => {
    const session = await getSessionServerFn();
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
});
