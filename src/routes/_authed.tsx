import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthedLayout } from '../layouts';
import { currentUserQueryOptions } from '../queries/account';
import { companiesQueryOptions } from '../queries/reference';
import { sessionQueryOptions } from '../queries/session';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
  ssr: true,
  loader: async ({ context }) => {
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
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions()
    );
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
});
