import { createFileRoute, redirect } from '@tanstack/react-router';

import {
  getPostLoginTargetServerFn,
  getSessionServerFn,
} from '../server/start/functions/auth';

function HomeRedirect() {
  return null;
}

export const Route = createFileRoute('/')({
  component: HomeRedirect,
  beforeLoad: async () => {
    const session = await getSessionServerFn();
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const target = await getPostLoginTargetServerFn({
      data: { userId: session.userId },
    });
    throw redirect(target);
  },
});
