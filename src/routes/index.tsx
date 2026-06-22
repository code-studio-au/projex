import { createFileRoute, redirect } from '@tanstack/react-router';

import { getPostLoginTargetServerFn } from '../server/start/functions/auth';
import { sessionQueryOptions } from '../queries/session';

function HomeRedirect() {
  return null;
}

export const Route = createFileRoute('/')({
  component: HomeRedirect,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions());
  },
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions()
    );
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const target = await getPostLoginTargetServerFn();
    throw redirect(target);
  },
});
