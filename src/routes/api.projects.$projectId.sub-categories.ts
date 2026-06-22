import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createSubCategoryEndpoint,
  listSubCategoriesEndpoint,
  updateSubCategoryEndpoint,
} from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute('/api/projects/$projectId/sub-categories')(
  {
    server: {
      middleware: [apiRouteMiddleware],
      handlers: {
        GET: async ({ context, params }) => {
          return jsonApi(
            await executeApiEndpoint({
              endpoint: listSubCategoriesEndpoint,
              context,
              input: params,
            })
          );
        },
        POST: async ({ request, params, context }) => {
          return jsonApi(
            await executeApiEndpoint({
              endpoint: createSubCategoryEndpoint,
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
              endpoint: updateSubCategoryEndpoint,
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
  }
);
