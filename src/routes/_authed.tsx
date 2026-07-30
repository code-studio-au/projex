import {
  createFileRoute,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';

export const Route = createFileRoute('/_authed')({
  component: lazyRouteComponent(() => import('../components/AuthedLayout')),
  ssr: true,
  beforeLoad: async ({ context }) => {
    const { sessionQueryOptions } = await import('../queries/session');
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions()
    );
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async ({ context }) => {
    const [
      { currentUserQueryOptions },
      { companiesQueryOptions },
      { sessionQueryOptions },
    ] = await Promise.all([
      import('../queries/account'),
      import('../queries/reference'),
      import('../queries/session'),
    ]);
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions()
    );
    if (!session?.userId) return null;

    await Promise.all([
      context.queryClient.ensureQueryData(
        currentUserQueryOptions(session.userId)
      ),
      context.queryClient.ensureQueryData(
        companiesQueryOptions(session.userId)
      ),
    ]);

    return null;
  },
});
