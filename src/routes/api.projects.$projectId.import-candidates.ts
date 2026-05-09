import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-candidates'
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listImportCandidates(asProjectId(params.projectId))
        ),
    },
  },
});
