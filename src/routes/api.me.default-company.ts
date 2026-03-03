import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asUserId } from '../types';

export const Route = createFileRoute('/api/me/default-company')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApi(request, async (api) => {
          const session = await api.getSession();
          if (!session) return { companyId: null };
          const companyId = await api.getDefaultCompanyIdForUser(asUserId(session.userId));
          return { companyId };
        }),
    },
  },
});
