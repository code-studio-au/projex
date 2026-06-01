import {
  createFileRoute,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import {
  getPostLoginTargetServerFn,
  getSessionServerFn,
} from '../server/start/functions/auth';
import { sessionQueryOptions } from '../queries/session';

export const Route = createFileRoute('/login')({
  component: lazyRouteComponent(() => import('../pages/LoginPage')),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions());
  },
  beforeLoad: async ({ context }) => {
    const session =
      context.queryClient.getQueryData(sessionQueryOptions().queryKey) ??
      (await getSessionServerFn());
    if (!session) return;
    const target = await getPostLoginTargetServerFn();
    throw redirect(target);
  },
});
