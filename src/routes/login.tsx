import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router';
import { getPostLoginTarget } from './-postLogin';

export const Route = createFileRoute('/login')({
  component: lazyRouteComponent(() => import('../pages/LoginPage')),
  beforeLoad: async ({ context }) => {
    const session = await context.api.getSession();
    if (!session) return;
    const target = await getPostLoginTarget(context.api, session.userId);
    throw redirect(target);
  },
});
