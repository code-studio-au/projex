import { createFileRoute, redirect } from '@tanstack/react-router';

import {
  getPostLoginTargetServerFn,
  getSessionServerFn,
} from '../server/start/functions/auth';
import { sessionQueryOptions } from '../queries/session';

function HomeRedirect() {
  return null;
}

export const Route = createFileRoute('/')({
  component: HomeRedirect,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions());
  },
  beforeLoad: async ({ context }) => {
    const session =
      context.queryClient.getQueryData(sessionQueryOptions().queryKey) ??
      (await getSessionServerFn());
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const target = await getPostLoginTargetServerFn();
    throw redirect(target);
  },
});
