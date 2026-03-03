import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/reactivate')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.reactivateCompany(asCompanyId(params.companyId));
          return { ok: true as const };
        }),
    },
  },
});
