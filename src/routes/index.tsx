import { createFileRoute, redirect } from '@tanstack/react-router';

import { getPostLoginTarget } from './-postLogin';

function HomeRedirect() {
  return null;
}

export const Route = createFileRoute('/')({
  component: HomeRedirect,
  beforeLoad: async ({ context }) => {
    const session = await context.api.getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const target = await getPostLoginTarget(context.api, session.userId);
    throw redirect(target);
  },
});
