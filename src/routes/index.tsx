import { createFileRoute, redirect } from '@tanstack/react-router';

import { getPostLoginTarget } from './-postLogin';
import { sessionQueryOptions } from '../queries/session';

function HomeRedirect() {
  return null;
}

export const Route = createFileRoute('/')({
  component: HomeRedirect,
  beforeLoad: async ({ context }) => {
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
