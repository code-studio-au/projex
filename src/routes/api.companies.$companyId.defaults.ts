import { createFileRoute } from '@tanstack/react-router';

import { asCompanyId } from '../types';
import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/companies/$companyId/defaults')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.getCompanyDefaults(asCompanyId(params.companyId))
        ),
    },
  },
});
