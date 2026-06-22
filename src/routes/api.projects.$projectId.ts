import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  deleteProjectEndpoint,
  getProjectEndpoint,
  updateProjectEndpoint,
} from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/projects/$projectId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: getProjectEndpoint,
            context,
            input: { projectId: params.projectId },
          })
        ),
      PATCH: async ({ context, request, params }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        return jsonApi(
          await executeApiEndpoint({
            endpoint: updateProjectEndpoint,
            context,
            input: {
              id: params.projectId,
              ...body,
            },
          })
        );
      },
      DELETE: async ({ context, request, params }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        await executeApiEndpoint({
          endpoint: deleteProjectEndpoint,
          context,
          input: {
            projectId: params.projectId,
            ...body,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
