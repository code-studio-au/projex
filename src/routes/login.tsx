import {
  createFileRoute,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import { getPostLoginTargetServerFn } from '../server/start/functions/auth';
import { sessionQueryOptions } from '../queries/session';

export const Route = createFileRoute('/login')({
  component: lazyRouteComponent(() => import('../pages/LoginPage')),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions());
  },
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions()
    );
    if (!session) return;
    const target = await getPostLoginTargetServerFn();
    throw redirect(target);
  },
});
