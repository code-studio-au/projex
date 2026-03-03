import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/deactivate')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deactivateProject(asProjectId(params.projectId));
          return { ok: true as const };
        }),
    },
  },
});
