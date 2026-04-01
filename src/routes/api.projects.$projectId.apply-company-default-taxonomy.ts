import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/apply-company-default-taxonomy')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApi(request, (api) => api.applyCompanyDefaultTaxonomy(asProjectId(params.projectId))),
    },
  },
});
