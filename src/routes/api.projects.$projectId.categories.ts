import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createCategoryEndpoint,
  listCategoriesEndpoint,
  updateCategoryEndpoint,
} from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute('/api/projects/$projectId/categories')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: listCategoriesEndpoint,
            context,
            input: params,
          })
        );
      },
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createCategoryEndpoint,
            context,
            input: {
              ...params,
              payload: await readJsonBody(request),
            },
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: updateCategoryEndpoint,
            context,
            input: {
              ...params,
              payload: await readJsonBody(request),
            },
          })
        );
      },
    },
  },
});
