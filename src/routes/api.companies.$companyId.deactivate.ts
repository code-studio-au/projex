import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/deactivate')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deactivateCompany(asCompanyId(params.companyId));
          return { ok: true as const };
        }),
    },
  },
});
