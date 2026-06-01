import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { reactivateProjectServer } from '../server/fns/projects';

export const Route = createFileRoute('/api/projects/$projectId/reactivate')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await reactivateProjectServer({
          context: serverContext,
          projectId: asProjectId(params.projectId),
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
