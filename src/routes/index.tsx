import { createFileRoute, redirect } from '@tanstack/react-router';

function HomeRedirect() {
  return null;
}

export const Route = createFileRoute('/')({
  component: HomeRedirect,
  beforeLoad: async ({ context }) => {
    const [{ sessionQueryOptions }, { getPostLoginTargetServerFn }] =
      await Promise.all([
        import('../queries/session'),
        import('../server/start/functions/auth'),
      ]);
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions()
    );
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const target = await getPostLoginTargetServerFn();
    throw redirect(target);
  },
  loader: async ({ context }) => {
    const { sessionQueryOptions } = await import('../queries/session');
    await context.queryClient.ensureQueryData(sessionQueryOptions());
  },
});
