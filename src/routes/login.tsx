import {
  createFileRoute,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import {
  getPostLoginTargetServerFn,
  getSessionServerFn,
} from '../server/start/functions/auth';

export const Route = createFileRoute('/login')({
  component: lazyRouteComponent(() => import('../pages/LoginPage')),
  beforeLoad: async () => {
    const session = await getSessionServerFn();
    if (!session) return;
    const target = await getPostLoginTargetServerFn({
      data: { userId: session.userId },
    });
    throw redirect(target);
  },
});
