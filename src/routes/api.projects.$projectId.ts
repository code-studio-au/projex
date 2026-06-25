import { createFileRoute } from '@tanstack/react-router';

import {
  deleteProjectBodySchema,
  updateProjectBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';
import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

export const Route = createFileRoute('/api/projects/$projectId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'getProjectEndpoint',
            context,
            input: { projectId: params.projectId },
          })
        ),
      PATCH: async ({ context, request, params }) => {
        const body = validateOrThrow(
          updateProjectBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'updateProjectEndpoint',
            context,
            input: {
              id: params.projectId,
              ...body,
            },
          })
        );
      },
      DELETE: async ({ context, request, params }) => {
        const body = validateOrThrow(
          deleteProjectBodySchema,
          await readJsonBody(request)
        );
        await executeLazyApiEndpoint({
          specifier: '../server/app/companyEndpoints',
          exportName: 'deleteProjectEndpoint',
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
