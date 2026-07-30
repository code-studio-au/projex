import {
  createFileRoute,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';

export const Route = createFileRoute('/login')({
  component: lazyRouteComponent(() => import('../pages/LoginPage')),
  beforeLoad: async ({ context }) => {
    const [{ sessionQueryOptions }, { getPostLoginTargetServerFn }] =
      await Promise.all([
        import('../queries/session'),
        import('../server/start/functions/auth'),
      ]);
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions()
    );
    if (!session) return;
    const target = await getPostLoginTargetServerFn();
    throw redirect(target);
  },
  loader: async ({ context }) => {
    const { sessionQueryOptions } = await import('../queries/session');
    await context.queryClient.ensureQueryData(sessionQueryOptions());
  },
});
