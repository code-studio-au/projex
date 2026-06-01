import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { deactivateProjectServer } from '../server/fns/projects';

export const Route = createFileRoute('/api/projects/$projectId/deactivate')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await deactivateProjectServer({
          context: serverContext,
          projectId: asProjectId(params.projectId),
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
