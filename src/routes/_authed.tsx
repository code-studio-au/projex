import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthedLayout } from '../layouts';
import { sessionQueryOptions } from '../queries/session';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.api)
    );
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
});
