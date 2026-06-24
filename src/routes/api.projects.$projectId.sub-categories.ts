import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

export const Route = createFileRoute('/api/projects/$projectId/sub-categories')(
  {
    server: {
      middleware: [apiRouteMiddleware],
      handlers: {
        GET: async ({ context, params }) => {
          return jsonApi(
            await executeLazyApiEndpoint({
              specifier: '../server/app/taxonomyEndpoints',
              exportName: 'listSubCategoriesEndpoint',
              context,
              input: params,
            })
          );
        },
        POST: async ({ request, params, context }) => {
          return jsonApi(
            await executeLazyApiEndpoint({
              specifier: '../server/app/taxonomyEndpoints',
              exportName: 'createSubCategoryEndpoint',
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
            await executeLazyApiEndpoint({
              specifier: '../server/app/taxonomyEndpoints',
              exportName: 'updateSubCategoryEndpoint',
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
